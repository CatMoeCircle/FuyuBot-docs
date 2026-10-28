# ABI 契约 (/docs/plugin/abi)

这是**唯一**的跨语言契约：形状只有 `fuyubot-abi/src/lib.rs` 一份实现，C 头文件
`fuyubot_plugin.h` 由 cbindgen 从它生成（**产物，不是源码**，别手改）。宿主侧所有桥在
`fuyubot-loader/src/runtime.rs`。**改 ABI = 改那个文件 + 加版本号。**

## 插件必须导出的符号 [#插件必须导出的符号]

v3 的四个契约符号仍是必需/可选的底线；v4 另外导出三个**静态符号**，让
`fuyubot-sdk check` 不 dlopen 也能看见插件是按哪个 ABI 编的（版本值仍只能运行时判定）。

| 符号 | 类型 | 必须吗 | 说明 |
| --- | --- | --- | --- |
| `plugin_init` | `unsafe extern "C" fn(*const HostApiVTable) -> PluginHandle` | **必须** | 校验 VTable、构造状态；返回失败句柄（`abi_version == 0`）= 拒绝加载 |
| `plugin_start` | `unsafe extern "C" fn(PluginHandle, *const c_char) -> i32` | 可选 | 拿到配置 JSON，注册订阅 / 工具 / 中间件；返回 `0` 成功 |
| `plugin_stop` | `unsafe extern "C" fn(PluginHandle)` | 可选 | 卸载前调一次，回收自己的状态 |
| `plugin_free_string` | `unsafe extern "C" fn(*mut c_char)` | **必须** | 释放**插件自己**分配的字符串（宿主从不 free 插件的指针） |
| `plugin_free_handle` | `unsafe extern "C" fn(PluginHandle)` | v4 可选 | 版本不匹配、不能调 `plugin_stop` 时，用来释放 `plugin_init` 分配的状态 |
| `fuyubot_abi_version` | `unsafe extern "C" fn() -> u32` | v4 可选 | 返回编译期 `ABI_VERSION`；静态工具只检查“存在”，值要运行时看 |
| `plugin_manifest` | `unsafe extern "C" fn() -> *const c_char` | v4 可选 | 自描述 JSON（名字 + `inject` / `soft_inject`）；宿主接线仍在进行中 |

符号名由常量钉住（`SYM_PLUGIN_INIT` / `SYM_PLUGIN_START` / `SYM_PLUGIN_STOP` /
`SYM_PLUGIN_FREE_STRING` / `SYM_PLUGIN_FREE_HANDLE` / `SYM_PLUGIN_ABI_VERSION` /
`SYM_PLUGIN_MANIFEST`），`PluginLoader::load_with_config` 按这些名字 `lib.get(...)`。
C++ 里必须把它们放进 `extern "C"` 块，否则名字被 mangle，宿主 dlsym 不到。

`PluginHandle` = `{ abi_version: u32, size: u32, context: *mut c_void, name: *const c_char }`；
`is_valid()` 的判据是「`abi_version != 0` **且** `context` 非空」，所以插件的 `context` 不能是
`NULL`。`PluginHandle::FAILED` 是全零版本号，`const _` 里有
`assert!(PluginHandle::FAILED.abi_version == 0)`。

## HostApiVTable：`host_ctx` + 19 个函数指针 [#hostapivtablehost_ctx--19-个函数指针]

`version` 在偏移 0、`size` 在 4、`host_ctx` 在 8，其余 **19 个是函数指针**，全是 `Option<...>`；
总大小 = `2 * size_of::<u32>() + 20 * size_of::<*const c_void>()`（`host_ctx` + 19 个函数），
由 `const _` 里的 `offset_of!` / `size_of` 断言钉死。每个函数第一个参数都是 `host: *mut c_void`。

下表签名省略第一个参数 `host`：

| # | 字段 | 签名 | 宿主实现 | 说明 |
| --- | --- | --- | --- | --- |
| — | `version` | `u32` | `ABI_VERSION` | 必须等于 `ABI_VERSION`；首个字段，插件能在读其它任何字段之前先比一次 |
| — | `size` | `u32` | `size_of::<HostApiVTable>()` | 老宿主 + 新插件时先比 `size` 再读尾部字段，读越界就是 UB |
| — | `host_ctx` | `*mut c_void` | `&HostRuntime` | 每个函数都原样回传；插件作者看不见它（`HostApi` 自动带上） |
| 1 | `on` | `(update_type, filter_json, callback, user_data) -> SubscriptionHandle` | `api_on` | 订阅；`filter_json` 里的 `event_type` 选通道，其余键做负载匹配；`NULL` / 空串 / `"null"` = 收全部 |
| 2 | `off` | `(handle) -> ()` | `api_off` | 退订；句柄 drop 时宿主也会整批回滚 |
| 3 | `emit` | `(event_type, payload_json) -> i32` | `api_emit` | 发自定义事件；对插件而言是 `emit_scoped(自己, …)`，只送自己 + 全局订阅者 |
| 4 | `register_tool` | `(descriptor_json, handler, user_data) -> ToolHandle` | `api_register_tool` | 登记元数据 + 可选处理器；处理器是 `C-unwind fn(user_data, input_json) -> *const c_char`，只登记元数据用 `register_tool_meta` |
| 5 | `call_tool` | `(name, input_json) -> RequestId` | `api_call_tool` | 走 `ToolRegistry::call_tool` 的请求号路径（兼容/异步工具） |
| 6 | `call_tool_result` | `(name, input_json) -> *const c_char` | `api_call_tool_result` | **同步**执行工具并返回结果 JSON（失败 `{"error":…}`）。宿主线程局部缓冲，读完即弃 |
| 7 | `list_tools` | `() -> *const c_char` | `api_list_tools` | 全部工具的元数据 JSON 数组。**宿主线程局部缓冲**，读完即弃 |
| 8 | `list_plugins` | `() -> *const c_char` | `api_list_plugins` | 进程内插件报告 JSON 数组（名字 / 状态 / 缺依赖 / 失败原因） |
| 9 | `provide_service` | `(name, *const ServiceVTable) -> ServiceHandle` | `api_provide_service` | 注册命名服务；`vtable` 必须活到注销为止 |
| 10 | `get_service` | `(name) -> *const ServiceVTable` | `api_get_service` | 取回同一个指针；没有就是 `NULL` |
| 11 | `td_invoke` | `(method_json) -> RequestId` | `api_td_invoke` | 发完整 TDLib 请求 JSON（含 `@type`） |
| 12 | `td_invoke_simplified` | `(method_name, params_json) -> RequestId` | `api_td_invoke_simplified` | 给参数补上 `@type = method_name`；参数不是对象就整份替换成 `{"@type": …}` |
| 13 | `td_execute` | `(request_json) -> *const c_char` | `api_td_execute` | **同步**执行不碰网络的方法（`td_json_client_execute`），当场返回响应 JSON。**不发请求号、不进请求留档、不等响应通道**——所以能在事件回调里用；宿主没接 TDLib 时返回 `NULL` |
| 14 | `use_middleware` | `(stage: u32, callback, user_data) -> MiddlewareHandle` | `api_use_middleware` | 挂在某个阶段；回调返回非 0 → 本阶段中断 |
| 15 | `wait_for_update` | `(filter_json, timeout_ms: u64) -> WaitHandle` | `api_wait_for_update` | **阻塞**当前线程；`timeout_ms == 0` 表示只检查当前状态。Rust 插件优先用 `ResponseRouter` 的 await 版 |
| 16 | `cancel_wait` | `(handle) -> ()` | `api_cancel_wait` | 从另一个线程取消等待 |
| 17 | `log` | `(level: u32, message) -> ()` | `api_log` | 落进宿主环形缓冲（`LOG_CAPACITY = 256`）并打一行到 stderr；非法 level 按 `Info` 处理 |
| 18 | `get_config` | `(section, key) -> *const c_char` | `api_get_config` | 读全局配置：`section` 空串读顶层（`[bot]` / `[telegram]` 等），否则把 `section` 当点路径在 `plugin` 表里下钻（`fuyubot.manage` → `plugin.fuyubot.manage`）；`key` 空串读整段、否则按点路径取键。**宿主线程局部缓冲**，读完即弃；段 / 键不存在返回 `NULL` |
| 19 | `set_config` | `(key, value_json) -> i32` | `api_set_config` | 写配置：**只能写调用者自己名下的段**（没有 section 参数，宿主按调用者身份判定，插件无法伪造）。`key` 空串覆盖整段、否则按点路径设键。返回 0 = 成功（写内存 + 回写 `fuyubot.toml`）；非 0 = 越权 / 解析失败 / 写盘失败 |

两条形状上的硬要求：

- **第一个参数总是 `host: *mut c_void`**：裸函数指针没有捕获环境，VTable 里放不了闭包；
  不给显式上下文就只能靠进程级全局，那样一个进程只能有一个宿主、测试也没法并行。
- **每个函数指针字段都是 `Option<...>`**：C 侧传 `NULL` 合法，非 `Option` 字段收到 `NULL` 就是 UB。
  Rust 侧 `HostApi::from_raw` 一次解包校验全部 19 个，之后调用路径上没有 `Option`、也没有 panic 分支。

句柄类型（`SubscriptionHandle` / `ToolHandle` / `ServiceHandle` / `MiddlewareHandle` / `RequestId`）
都是 `#[repr(C)]` + 单个 `u64`（断言钉住 `size_of == size_of::<u64>()`）；
`LogLevel` = 1..5（`Error` / `Warn` / `Info` / `Debug` / `Trace`），`Stage` = 0..5；
`WaitHandle` = `{ id: u64, matched: u32, _reserved: u32, payload_json: *const c_char }`。

## 内存所有权：三条硬规矩 [#内存所有权三条硬规矩]

1. **谁分配谁释放**。插件通过 `plugin_init` 返回的 `name`、以及插件自己分配的任何字符串，
   都由插件持有；宿主**绝不** free 它们。插件要给宿主一个需要接管的临时字符串，只能走
   `plugin_free_string` 那套约定。
2. **宿主返回的字符串是线程局部缓冲**。`list_tools`、`get_config`、`WaitHandle::payload_json`
   指向宿主的一块复用缓冲（`thread_local! HOST_STRING`），**只在下一次调用宿主函数之前有效**。
   要留着就当场拷走，并且**不要试图释放它**——VTable 里没有 host 侧的 free 函数，这是设计不是遗漏。
3. **`ServiceMethodFn` 的返回值由提供方持有**，调用方读完即弃。

## 版本协商 [#版本协商]

| 位置 | 谁比 | 不匹配的后果 |
| --- | --- | --- |
| `ABI_VERSION`（当前 `4`） | 编译期常量，两侧共同引用 | — |
| `HostApiVTable::version` | 插件侧 `HostApi::from_raw` | `AbiError::VersionMismatch` |
| `HostApiVTable::size` | 同上 | `AbiError::VTableTooSmall` |
| 某个函数指针是 `NULL` | 同上 | `AbiError::MissingFunction("<字段名>")` |
| `PluginHandle::abi_version` | 宿主侧 `PluginLoader` | `AbiMismatch`：**拒绝加载** |

版本不兼容时宿主**不能**调 `plugin_stop`——那是对一个不认识的 ABI 下手。v4 起插件可以
导出 `plugin_free_handle`，让宿主在版本不匹配时释放 `plugin_init` 分配的状态；老插件没有
这个符号，那部分内存仍然回收不了。字段只增不改，新增一律追加在尾部。

**版本 2 的改动**：尾部追加了 `td_execute`（同步执行，见上表第 13 项）。

**版本 3 的改动**：尾部追加了 `get_config` / `set_config`（第 18 / 19 项），让插件能读全局配置、
写自己的段。

**版本 4 的改动**：
- `register_tool` 增加 `handler` / `user_data`，工具终于能真的执行；
- 尾部追加 `call_tool_result`（同步拿工具结果）与 `list_plugins`（插件报告）；
- 新增静态导出 `plugin_free_handle` / `fuyubot_abi_version` / `plugin_manifest`。

追加字段本身不破坏老插件（它们先比 `size`），但按契约「改 ABI 就加版本号」，
`ABI_VERSION` 一起跳到 4——**用旧版本编出来的插件会被宿主拒绝加载**，重新编一次即可
（仓库里所有插件与模板都从 `ABI_VERSION` 取值）。

## 为什么本 ABI 一个可变参数函数指针都没有 [#为什么本-abi-一个可变参数函数指针都没有]

Rust 的 `extern "C" fn(.., ...)` 确实稳定（能写、cbindgen 也能生成），但**本 ABI 一个都没用**，
理由只有一条：`...` 会把**参数类型和个数校验全部丢掉**。VTable 里 19 个函数的参数都是固定的，
用 `...` 只会让 C 侧传错参数从编译错误降级成运行期 UB。

将来真要加，正确的声明形状是（C 侧）：

```c
typedef void (*FuyubotLogFn)(uint32_t level, const char *format, ...);
// Rust 侧对应：unsafe extern "C" fn(level: u32, format: *const c_char, ...)
```

两条必须知道的事：

- 变参部分**不能**是唯一的参数——C 要求 `...` 之前至少有一个具名参数。
- **变参函数指针跨不了 ABI 的 `Option` 优化**：`Option<fn(..., ...)>` 不是 niche 优化，占**两个指针宽**，
  必须显式判空。本 crate 里那条
  `size_of::<Option<unsafe extern "C" fn()>>() == size_of::<*const c_void>()` 断言只对**非变参**函数指针
  成立；普通函数指针字段能享受 niche 优化（`NULL` 就是 `None`），这也是「整个 VTable 所有字段都能是
  `Option<...>` 且不撑大布局」的前提之一。

## 五种语言各自声明的兼容 ABI 版本 [#五种语言各自声明的兼容-abi-版本]

| 语言 | 声明在哪 | 值 | 怎么生效 |
| --- | --- | --- | --- |
| C | 头文件 `fuyubot_plugin.h` 里的 `#define ABI_VERSION 4` | 4 | 模板里写 `if (host == NULL \|\| host->version != ABI_VERSION) return failed;` |
| C++ | 同一份 `fuyubot_plugin.h` | 4 | 同上（导出符号放 `extern "C"`） |
| Rust | `fuyubot_plugin_api::SDK_ABI_VERSION`、`COMPATIBLE_HOST_ABI_VERSIONS`、`is_compatible()` | 4 | `define_plugin!` 把它填进 `PluginHandle::abi_version` |
| Python | **脚本不接触 ABI** | — | 由中间插件 `fuyubot_python_host` 承载（标准 ABI v4 cdylib），`abi_version` 它填 |
| JS / TS | **脚本不接触 ABI** | — | 同上，由 `fuyubot_js_host` 承载 |

脚本插件走的是薄 SDK（`fuyubot.py` / `fuyubot.ts`）→ 原生桥 → 中间插件这条路，
**作者永远不碰 C ABI**；ABI 版本由承载它的那份 cdylib 声明。Python 与 JS 的中间插件
是同一套机制的两份实现，「两门语言对 ABI 的理解」不可能漂移。

## 回调为什么是 `C-unwind` [#回调为什么是-c-unwind]

`EventCallbackFn` 与 `MiddlewareCallbackFn` 都是 `unsafe extern "C-unwind" fn(...)`。
`extern "C"` 边界上逃出去的 panic 会直接 **abort 整个进程**，宿主来不及 `catch_unwind`；
`C-unwind` 允许 unwind 穿过边界，宿主就能接住、记一条日志、继续跑下一条更新。
对 C/C++ 而言两者 ABI 完全一致；C++ 异常同样会穿过这个边界，**请自己在回调内处理完**。

`define_plugin!` 生成的三个导出函数还会把插件代码包在 `catch_unwind` 里——两层都要。

<Callout type="warn">
  版本不兼容时宿主**不会**调 `plugin_stop`：那是对一个不认识的 ABI 下手。字段只增不改，
  新增一律追加在尾部；改动必须同时抬 `ABI_VERSION`。
</Callout>

```bash
fuyubot-sdk abi-version   # 打印 3
```
