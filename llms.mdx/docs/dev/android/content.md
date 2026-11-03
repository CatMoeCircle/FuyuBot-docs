# Android：JNI 运行时 (/docs/dev/android)

Android 上**交付的是一个 JNI 库**，不是 APK、不是可执行文件：

```text
fuyubot-<版本>-android-jni-<abi>.zip        <abi> = arm64-v8a | x86_64
├─ libfuyubotjni.so      ← System.loadLibrary("fuyubotjni")
├─ libtdjson.so          ← 同 ABI，必须一起装
├─ plugins/*.so          ← 可选内置插件（/start、/help、/plugins）
├─ include/fuyubot_jni.h ← C 符号的头文件（可选）
└─ README.txt
```

APK 由应用作者自己出；这个包只提供**运行时本体**。宿主内部与桌面版是同一套东西
（`fuyubot-app` 编排 + `fuyubot-loader` 宿主 + `fuyubot-tdlib`），只有「谁来回答登录提问」
不同：Android 上是 Java 回调。

## 装法 [#装法]

1. 两个 `.so` 放进 `app/src/main/jniLibs/<abi>/`；
2. `plugins/` 里的 `.so`（可选）拷进你的 `<root>/plugins/`，并 `chmod 0444`
   （动态加载的代码要是只读的，Android 14 起对 `targetSdk 34+` 有这个要求）；
3. 代码里**先加载 tdjson，再加载 fuyubotjni**。

```kotlin
package com.catmoecircle.fuyubot.runtime

class Native(private val callback: Any) {
    external fun nativeVersion(): Int
    external fun nativeRegister(callback: Any): Int
    external fun nativeStart(optionsJson: String): Int
    external fun nativeStop(): Int
    external fun nativeIsRunning(): Boolean
    external fun nativeAnswer(id: Int, text: String?): Int

    // ABI v2：运行时查询
    external fun nativePlugins(): String                        // 插件列表 JSON
    external fun nativePluginInfo(name: String): String?        // 单个插件；没有 = null
    external fun nativeTdRequest(requestJson: String, timeoutMs: Long): String?  // 阻塞
    external fun nativeLastError(): String                      // 本线程最后一次错误

    init {
        // 先 tdjson：之后库内 dlopen("libtdjson.so") 会命中已加载的那一份，
        // 与 extractNativeLibs 怎么配无关。
        System.loadLibrary("tdjson")
        System.loadLibrary("fuyubotjni")
        check(nativeVersion() == 2)      // ABI 运行时判定
        check(nativeRegister(callback) == 0)
    }
}
```

> **绑定是运行期的**：`JNI_OnLoad` 用 `RegisterNatives` 把上面十个方法绑到
> `com.catmoecircle.fuyubot.runtime.Native`（默认值），导出符号里没有 `Java_...`。
> 类名 / 方法名 / 签名必须与上面一字不差；包名不是符号名的一部分——自己编译时可以用
> `FUYUBOT_JNI_CLASS=com/你的/包/Native` 换掉，预编译包就按默认包名写。
> `nativeRegister` 在 JNI 层收的是 `Object`，所以回调对象没有包名限制：库按方法名调
> `onState` / `onAsk` / `onQr`，你自己的 interface 或 class 只要有这三个方法即可。
>
> 开了 R8 / ProGuard 必须 keep 绑定类，否则混淆改掉类名/方法名就绑不上（第一次调用才报
> `UnsatisfiedLinkError`）：`-keep class com.catmoecircle.fuyubot.runtime.Native { *; }`

## 启动 [#启动]

```kotlin
val root = File(filesDir, "fuyubot").apply { mkdirs() }.absolutePath
val options = """
{
  "root": "$root",
  "api_id": 12345,
  "api_hash": "…",
  "bot_token": "123456:ABC…"
}
"""
val n = Native(callback)   // init 里已经 loadLibrary + nativeRegister
if (n.nativeStart(options) != 0) { /* 看日志或 onState */ }
```

`nativeStart` **立即返回**：真正干活在库内的工作线程上。成功只代表「线程起来了」，
不代表已登录——进度看 `onState` 与 `<root>/logs/fuyubot.log`。

### options JSON [#options-json]

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `root` | ✅ | 绝对路径，**必须是 app 私有目录**（`filesDir`）。`/sdcard` 是 `noexec`，TDLib 也写不进去 |
| `api_id` | ✅ | int32，与 `setTdlibParameters` 一致 |
| `api_hash` | ✅ | 只用于登录，**不会**进配置树（插件读不到） |
| `bot_token` | | 有值就走 bot 登录，全程不弹任何 UI |
| `plugin_dir` | | 相对 `root`，默认 `plugins` |
| `data_dir` | | 相对 `root`，默认 `data`（TDLib 数据库与文件都在这儿） |
| `log_level` | | `error` / `warn` / `info` / `debug` / `trace`，默认 `info` |
| `tdlib_log_verbosity` | | TDLib 自己的日志详细度，默认 1 |
| `lib_dir` | | 显式指定 `libtdjson.so` 所在的目录（一般不用给） |

目录会在启动时自动建好：`<root>/{data,logs,plugins}`。日志写在 `<root>/logs/fuyubot.log`——
Android 应用进程的 stdout/stderr 是 `/dev/null`，所以这是**唯一**能看到日志的地方。

## 回调 [#回调]

```text
Callback.onState(int state, String detail)
Callback.onAsk(int id, int kind, String prompt)     // 回答走 nativeAnswer(id, text)
Callback.onQr(String link)                          // 只展示，不需要回答
```

`state`：

| 值 | 含义 |
| --- | --- |
| `0` STARTING | 起来了，正在装插件 / 登录 |
| `1` READY | 已登录，开始分发更新 |
| `2` STOPPING | 收到停止请求，正在收摊 |
| `3` STOPPED | 收摊完成 |
| `4` FAILED | 出事退出，`detail` 是原因 |

`kind`（`prompt` 一律是给人看的中文整句，直接显示即可）：

| 值 | 含义 | 建议的输入框 |
| --- | --- | --- |
| `0` | bot token | 文本（有 `bot_token` 时根本不会问） |
| `1` | 手机号 | 文本 + 数字键盘 |
| `2` | 验证码 | 数字（长度写在 `prompt` 里） |
| `3` | 两步验证密码 | **密码框**（打码） |
| `4` | 登录方式 | 二选一：回答 `phone` 或 `qr` |
| `5` | 其它 | 通用文本框 |

回调发生在**库的工作线程**上（不是 Java 主线程），弹窗 / 通知请自己切线程；回调里别做长耗时操作
——它挡着登录状态机。`nativeAnswer(id, null)` 表示取消，登录会以失败收场。

`onQr` 对应 TDLib 的「其它设备确认」登录：把链接显示出来（或自己画二维码）即可，不需要回答。

## 停车 [#停车]

```kotlin
override fun onDestroy() {
    nativeStop()   // 停接收循环 → 卸插件 → TDLib 关会话刷盘，最多等 8 秒
    super.onDestroy()
}
```

`nativeStop` 是幂等的：没在跑就返回 `0`。**必须调**——库的工作线程与 tokio 运行时不是
daemon，不调会把进程吊在那儿。

## 谁负责保活 [#谁负责保活]

**库不声明任何 Android 组件、权限或唤醒锁**，也不做自启 / 互拉。这些只能在应用侧做：

| 事项 | 谁做 |
| --- | --- |
| 前台 Service、通知渠道、`foregroundServiceType` | 应用 |
| `PARTIAL_WAKE_LOCK`、电池优化白名单 | 应用 |
| 被杀后重启（`START_STICKY` / WorkManager） | 应用 |
| 网络断线重连 | 库（TDLib 内建，经 `updateConnectionState` 转给插件） |
| 硬杀之后从 session 恢复 | 库（下次 `nativeStart` 直接进 `READY`） |
| 优雅停机、刷盘 | 库（`nativeStop`） |
| 状态上报，供应用决定要不要拉起 | 库（`onState`） |

库承诺的三件事：`start` 幂等（已在跑返回 `2`）、`stop` 幂等且会等收摊、`onState` 如实上报。
同一个 `data_dir` 只允许一个实例——TDLib 的数据库同一时刻只能被一个进程打开。

## 插件与 TDLib（ABI v2） [#插件与-tdlibabi-v2]

三个查询接口都是 **JSON 文本进、JSON 文本出**——加字段不破 ABI，也不用为每个 td_api
方法生成一个绑定。

```kotlin
// 1. 当前插件列表
val list = nativePlugins()
// {"count":2,"plugins":[{"name":"fuyubot.start","version":"0.1.2","abi_version":5,
//   "state":"active","inject":["fuyubot.host.td"],"soft_inject":[],
//   "path":"/data/…/plugins/libfuyubot_start.so","file":"libfuyubot_start.so"}]}

// 2. 单个插件（就是上面数组里的一项）；不存在的名字 → null
val one = nativePluginInfo("fuyubot.start")

// 3. 用原始 td_api JSON 跟 TDLib 交互（发一条、等它自己的响应）
val me = withContext(Dispatchers.IO) {
    nativeTdRequest("""{"@type":"getMe"}""", 15_000)
}
```

插件条目的字段：

| 字段 | 说明 |
| --- | --- |
| `name` | 插件名（点分，`plugin_init` 报的那个） |
| `version` | 插件 manifest 的版本；老插件（ABI v3）是空串 |
| `abi_version` | 插件编进去的 ABI 版本 |
| `state` | `active` / `pending` / `activating` / `failed` / `unknown` |
| `inject` / `soft_inject` | 硬 / 软依赖（manifest 优先，配置段兜底） |
| `path` / `file` | 插件文件与文件名 |
| `missing` / `reason` | 仅 `pending` 有 `missing`（还缺哪些能力），仅 `failed` 有 `reason` |

状态是**现算**的（内核的插件报告），不是装插件那一刻的快照；运行时没起来时
`nativePlugins()` 返回 `{"count":0,"plugins":[]}`（不是 `null`，也不是错误）。

`nativeTdRequest` 的规矩：

- 发出去的是**原始 td_api JSON**，响应原样回来：`{"@type":"user",…}`；
  TDLib 的业务错误也是**正常响应**（`{"@type":"error","code":…,"message":…}`），不是 `null`。
- `null` 只表示**没拿到响应**：运行时没起来、JSON 非法、发不出去、超时。原因读
  `nativeLastError()`（**线程局部**：要在同一个线程上紧接着读）。
- `timeoutMs <= 0` → 默认 30 秒，上限 600 秒。
- **阻塞**：放到 `Dispatchers.IO` 之类的线程上。
- ⚠️ 别在 `onState` / `onAsk` 回调里调它：那些回调就跑在库的工作线程上，等响应等于
  自己等自己——库会认出这条线程并立刻返回 `null`。

## C 符号（逃生门） [#c-符号逃生门]

不走 JNI 也能直接用这 9 个 C 符号（头文件在包里）：

```c
int32_t     fuyubot_abi_version(void);
int32_t     fuyubot_start(const char *options_json);
int32_t     fuyubot_stop(void);
int32_t     fuyubot_is_running(void);
int32_t     fuyubot_answer(int32_t id, const char *text);   /* text = NULL 表示取消 */
const char *fuyubot_last_error(void);                        /* 线程局部，下次调用前有效 */

/* ABI v2 */
const char *fuyubot_plugins(void);                           /* 列表 JSON；没起来 = 空表 */
const char *fuyubot_plugin_info(const char *name);           /* 单个插件；没有 = NULL */
const char *fuyubot_td_request(const char *request_json,      /* 原始 td_api JSON → 响应 */
                               int32_t timeout_ms);           /* 阻塞；<=0 默认 30s，上限 600s */
```

返回码：`0` 成功、`1` 参数错、`2` 已在运行、`3` 超时、`4` 内部 panic（已兜住）、`5` 内部错
（细节看 `fuyubot_last_error()`）。三个返回字符串的函数同一套纪律：**线程局部缓冲**，
下次在同一线程调本库前有效，别 free、别存、别跨线程传。
纯 C 宿主没有回调通道：`onAsk` 那一步没人回答，所以只适合 `bot_token` 登录（把它放进 options）。

## 与命令行的关系 [#与命令行的关系]

同一个 bot 两种跑法，session 互相通用：

```text
桌面 / Termux： fuyubot run --config fuyubot.toml
Android APK   ： System.loadLibrary("fuyubotjni") + nativeStart(options)
```

两者都走 `fuyubot-app` 的同一套顺序（装插件 → 登录 → 分发 → 收摊），区别只在宿主：
一个把提问打到控制台，一个抛成 Java 回调；`data/` 里的 TDLib session 两边是同一份格式。
