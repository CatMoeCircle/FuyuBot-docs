# 调试与安装 (/docs/plugin/testing)

插件出问题通常不是「代码写得不对」，而是「没被加载」「加载了但没订阅上」「订阅了但请求拼错」。
这三步各有对应的工具，全都不需要 Telegram 账号。

| 做什么 | 用什么 | 需要账号吗 |
| --- | --- | --- |
| 看导出符号 | `dumpbin /exports`（Windows）/ `nm -D`（Linux/macOS） | 否 |
| 跑一遍更新管线 | `fuyubot run --replay <文件>` | 否 |
| 装进插件目录 | `fuyubot plugin install <路径>` | 否 |
| 看装了哪些插件 | `fuyubot plugin list`（静态读清单，不加载） | 否 |
| 真登录、真更新 | `fuyubot run` | 是 |

## 静态检查导出符号 [#静态检查导出符号]

宿主只认七个符号，缺 `plugin_init` 一定加载失败。**不要用 `dlopen` 去验**——那会在你的进程里
跑插件的初始化代码，已经算加载了。直接读导出表：

```powershell
# Windows
dumpbin /exports target\debug\fuyubot_plugin_demo.dll | findstr plugin_
```

```bash
# Linux / macOS
nm -D --defined-only target/debug/libfuyubot_plugin_demo.so | grep plugin_
```

应该看到 `plugin_init` / `plugin_start` / `plugin_stop` / `plugin_free_string`，
以及可选的 `plugin_manifest` / `fuyubot_abi_version` / `plugin_free_handle`。
看不到 `plugin_init` = 宿主一定拒绝，先查 `crate-type = ["cdylib"]` 和 `extern "C"`。

三个版本别混：

- **宿主 ABI 世代** = `HostApiVTable::version`（当前 5），就在 VTable 首字段；
- **插件声明的 ABI 版本** 在 `PluginHandle::abi_version`，是 `plugin_init` 的返回值——
  静态检查看不到，**装载时才判定**；
- **插件自己的 crate 版本** 在 `plugin_manifest` 的 `version` 字段里。

## 回放：不接账号也能验插件 [#回放不接账号也能验插件]

```bash
fuyubot run --replay examples\replay\new_message.json --plugin-dir <插件目录>
```

回放把文件里的更新（单个对象或对象数组）灌进六阶段管线后退出：**不接 TDLib、不用账号**，
插件发出的请求只留档不发。输出三样东西：

1. 每条更新的 `UpdateOutcome`：

```text
回放 updateNewMessage → UpdateOutcome { update_type: "updateNewMessage", listeners: 1, warnings: [] }
```

2. 插件打的日志（`HostRuntime::log_lines`，上限 256 行）；
3. 插件发出去的请求：`#请求号 方法名 参数`。

| 参数 | 说明 |
| --- | --- |
| `--replay <文件>` | 要回放的更新；对象或对象数组 |
| `--plugin-dir <目录>` | 覆盖插件目录（默认取 `fuyubot.toml` 的 `plugins.dir`） |
| `--replay-wait <MS>` | 回放后的静默窗口；不填时脚本插件 2000ms、纯原生插件 150ms（上限 60 秒） |

脚本插件在**另一个进程**里跑，反应要经管道回来，还可能捎带网络请求——窗口太短会把最终答复漏掉。

<Callout type="info">
  回放**故意不接 TDLib**：它要在任何机器上离线可跑，接了就要账号与网络。
  所以回放能证明「插件收到更新后做出了正确判断、发出了正确请求」，**不能**证明真 Telegram 认这些参数。
</Callout>

## 安装 [#安装]

```bash
fuyubot init --dir . --name demo                        # 生成 fuyubot.toml + plugins/
fuyubot plugin install plugins/demo --config fuyubot.toml
fuyubot plugin list
```

```text
已安装 F:\…\plugins\demo.dll
```

- 脚本插件走另一条路（目录形，装进 `plugins/scripts/<目录名>/`），见[脚本插件](../script/index.mdx)。
- `plugin install <工程目录>` 找产物的顺序是 `<工程>/target/{release,debug}` → 工程目录本身 →
  **沿父链最近的** `target/{release,debug}`（两边都有时取**较新**的那个）。最后一档专为 workspace
  成员准备：`cargo build -p <crate>` 的产物默认落在仓库根 `target/`，工程自己那份 `target/` 并不存在，
  靠父链一样能找到——**没有 `--target-dir` 这个参数**，找不着就直接指着产物装。

## 装完还是不响？ [#装完还是不响]

| 症状 | 先看 |
| --- | --- |
| 导出表里没有 `plugin_init` | crate 是不是 `crate-type = ["cdylib"]`；C++ 的七个符号在不在 `extern "C"` 里 |
| 日志里有「跳过 xxx」 | ABI 版本不匹配，或 `dlopen` 失败（缺兄弟 DLL：把依赖放在插件旁边，加载器会先查库自己的目录） |
| 加载了但一条事件都没收到 | 订阅是不是没注册成功（`HostApi::on` 返回的句柄 `is_valid()` 为假），或事件名写成了别名 |
| 脚本插件起不来 | 不在本板块——见[脚本插件 › 排查](../script/index.mdx#排查)（manifest 身份段、`run()`、`uv` / `bun`、原生桥库） |
| 请求发出去了但没收到响应 | 回放里本来就不会有响应（请求只留档）；真环境下等的是 `"response"` 通道，见 [调用 TDLib](./tdlib.mdx) |

TDLib 的方法名与参数名以 `td_api.tl` 为准（见[调用 TDLib](./tdlib.mdx#方法名以-tdlib-为准)）；
契约与所有权规则见 [ABI 契约](./abi.mdx)。
