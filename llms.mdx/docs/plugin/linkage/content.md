# 插件联动 (/docs/plugin/linkage)

插件之间没有共享的 Rust 类型，也没有彼此的符号表。原生插件（cdylib）跑在同一个进程里，
但只通过宿主的 C ABI 打交道。想「A 把自己的能力借给 B 用」，只有宿主提供的那几条通道。

这篇讲最常用的一条：**命名服务 + 软依赖**。示例服务叫 `demo.notes`：一个插件提供
「笔记」能力，另一个插件按名字调用它。

> 命令表已经不由 `/help` 插件提供，而是宿主预置的 `fuyubot.host.commands`。
> 那部分见[命令表与 /help](./command-table.mdx)；缓存服务见 [TDLib 对象缓存](./cache.mdx)。
> 本文只讲通用的共享服务模式。

## 先选通道 [#先选通道]

| 想做的事 | 通道 | 有返回值 | 对方必须在？ |
| --- | --- | --- | --- |
| 广播「发生了什么」，不关心谁在听 | [事件总线](./events.mdx) `emit` / 订阅 | 否 | 否 |
| 调一个能力，**当场要结果** | 命名服务 `provide_service(_shared)` + `call_service` | 是（JSON 字符串） | 是（调用那一刻） |
| 让宿主 / AI 能发现并调用 | [工具表](./tools.mdx) `register_tool` + `call_tool` | 是 | 是 |
| 只要求「我启动时它已经在了」 | `inject` / `soft_inject` | — | 不负责传值 |

服务适合「一个插件提供能力、其它插件按名字调」：缓存、鉴权、数据源、笔记都属于这一类。
它不替代事件——事件是**通知**，服务是**调用**。两者可以叠：服务方法内部照样能 `emit`。

## 联动结构 [#联动结构]

```mermaid
flowchart LR
  U["调用方插件"] -->|"call_service('demo.notes','add',…)"| H["宿主"]
  H -->|"转交"| P["提供方插件"]
  P -->|"provide_service_shared"| H
  P -->|"add / list"| R["自己的注册表"]
```

- 提供方：`start()` 里 `provide_service_shared("demo.notes", &vtable)`；
- 消费方：`call_service("demo.notes", "add", …)`；
- 消费方**不链接**提供方，也不 import 它的代码，只认服务名、方法名和 JSON 协议；
- 需要「提供方先起来」时，消费方用 `soft_inject` / `inject` 声明，但**不传值**。

服务名建议用反向域名（`demo.notes`），方法名用动词；协议字段**只增不改**，
破坏性改动时把 `ServiceVTable.version` 加一（宿主不校验，但调用方可以据此判断）。
坏入参不要 panic——回一个带 `error` 的 JSON，调用方才有机会降级。

## 提供方：把能力做成服务 [#提供方把能力做成服务]

下面代码用 `fuyubot-abi` 的类型写。外部 Rust 插件直接依赖 crates.io 上的
`fuyubot-abi`，拿到的是同一套 `ServiceVTable` / `ServiceMethod` / `Plugin` / `define_plugin!`。

### 1. 写方法 [#1-写方法]

服务方法只有一个签名：收 JSON、回 JSON（或 `NULL` 表示失败）。

```rust
use std::cell::RefCell;
use std::ffi::{CStr, CString, c_char, c_void};

thread_local! {
    static REPLY: RefCell<CString> = RefCell::new(CString::new("").unwrap());
}

/// 提供方持有返回值：宿主 `call_service` 调完会立刻拷走。
fn reply(text: &str) -> *const c_char {
    let text = CString::new(text).unwrap_or_default();
    REPLY.with(|buffer| {
        *buffer.borrow_mut() = text;
        buffer.borrow().as_ptr()
    })
}

unsafe extern "C" fn svc_add(
    _context: *mut c_void,
    input_json: *const c_char,
) -> *const c_char {
    let input = match unsafe { CStr::from_ptr(input_json) }.to_str() {
        Ok(input) => input,
        Err(_) => return reply(r#"{"ok":false,"error":"非 UTF-8"}"#),
    };
    let value: serde_json::Value = match serde_json::from_str(input) {
        Ok(value) => value,
        Err(_) => return reply(r#"{"ok":false,"error":"不是合法 JSON"}"#),
    };
    let Some(text) = value.get("text").and_then(|value| value.as_str()) else {
        return reply(r#"{"ok":false,"error":"缺 text"}"#);
    };
    // …把 text 放进自己的注册表…
    reply(&serde_json::json!({"ok": true, "text": text}).to_string())
}

unsafe extern "C" fn svc_list(
    _context: *mut c_void,
    _input_json: *const c_char,
) -> *const c_char {
    // 实际实现里读注册表、serde_json::to_string 之后交给 reply。
    reply("[]")
}
```

方法跑在**调用方线程**上。消费方若在命令回调（接收循环线程）里调它，这里就不能做慢事——
否则整个宿主一起卡住。要慢慢做的活，在方法里排个队、立刻返回。

⚠️ `ServiceMethodFn` 是 `extern "C"`，**方法里不能有 panic**：逃出这个边界的 panic 会直接
abort 整个宿主，不是只挂你的插件。解析失败回 `{"ok":false,"error":"…"}`；确实可能 panic 的
代码段自己 `catch_unwind`。

### 2. 打包 VTable 与它引用的缓冲 [#2-打包-vtable-与它引用的缓冲]

`ServiceVTable` 里全是裸指针：`name` 指向服务名，`methods` 指向方法数组，每个方法项又指向
自己的名字。这些缓冲必须和 VTable **活一样久**，所以打包进同一个结构体，一起放进 `Box`：

```rust
use std::ffi::CString;
use fuyubot_abi::{HostApi, ServiceMethod, ServiceVTable};

struct NotesService {
    // 需要回问「谁在调我」时用；单独 Box 一层保证地址稳定。
    #[allow(dead_code)]
    host: Box<HostApi>,
    vtable: ServiceVTable,
    // vtable 的裸指针指向这些堆缓冲，必须与 vtable 同生共死。
    #[allow(dead_code)]
    methods: Vec<ServiceMethod>,
    #[allow(dead_code)]
    names: Vec<CString>,
}

fn build_service(host: HostApi) -> Box<NotesService> {
    let names = vec![
        CString::new("demo.notes").unwrap(),
        CString::new("add").unwrap(),
        CString::new("list").unwrap(),
    ];
    let methods = vec![
        ServiceMethod { name: names[1].as_ptr(), func: Some(svc_add) },
        ServiceMethod { name: names[2].as_ptr(), func: Some(svc_list) },
    ];
    let host = Box::new(host);
    let vtable = ServiceVTable {
        name: names[0].as_ptr(),
        version: 1,
        size: core::mem::size_of::<ServiceVTable>() as u32,
        context: (&*host as *const HostApi).cast_mut().cast::<c_void>(),
        methods: methods.as_ptr(),
        method_count: methods.len(),
    };
    Box::new(NotesService { host, vtable, methods, names })
}
```

几个容易写错的点：

- `Vec` 的**堆缓冲**在结构体移动时不会跟着搬，所以 `Box::new` 之后
  `names[i].as_ptr()` / `methods.as_ptr()` 仍然有效。**别在注册之后再 `push`**。
- `version` 是提供方自己的协议版本，宿主**不校验**；它只用于调用方自己判断。
- `context` 会原样传给每个方法。需要实例状态就把 `self` 指针放这里；需要问调用方就把
  `HostApi` 放这里（它是 `Copy` 的，跨线程可用）。

### 3. `start()` 注册，`stop()` 放下 [#3-start-注册stop-放下]

```rust
impl Plugin for NotesPlugin {
    fn start(&mut self, _config_json: &str) -> Result<(), String> {
        let service = build_service(self.host);
        let handle = self
            .host
            .provide_service_shared("demo.notes", &service.vtable);
        if !handle.is_valid() {
            self.host.log(
                LogLevel::Error,
                "注册 demo.notes 失败（同名服务已存在？）",
            );
        }
        self.service = Some(service);
        Ok(())
    }

    fn stop(&mut self) {
        // 放下即释放；宿主随后按 owner 整批回滚服务注册（stop → rollback）。
        self.service = None;
    }
}
```

<Callout type="warn">
  **跨插件共享必须用 `provide_service_shared`。** `provide_service` 写的是调用者自己的
  子作用域，兄弟插件沿父链往上看不到它；两个插件各注册一份同名私有服务也不会冲突，
  但也就谈不上联动。`_shared` 写进程级的根表，同名会和别人撞。
</Callout>

<Callout type="info">
  `ServiceHandle` **不是** RAII：它没有 `Drop`，丢在一边不会注销。插件卸载时宿主按 owner
  回滚它注册的一切。这里的 `Option<Box<NotesService>>` 只是为了**保活 VTable**。
</Callout>

### 4. 提供方也要能单独活 [#4-提供方也要能单独活]

提供服务时给自己留一份兜底：没有消费方来调，插件仍然能工作。
别把「有人来调我」当成自己启动的前提。

## 消费方：按名字调用 + 软依赖 [#消费方按名字调用--软依赖]

```rust
impl Plugin for ConsumerPlugin {
    fn start(&mut self, _config_json: &str) -> Result<(), String> {
        match self.host.call_service(
            "demo.notes",
            "add",
            r#"{"text":"hello"}"#,
        ) {
            Ok(reply) => self.host.log(LogLevel::Info, &format!("notes.add: {reply}")),
            Err(error) => self.host.log(
                LogLevel::Warn,
                &format!("notes.add 失败（继续跑）：{error}"),
            ),
        }
        Ok(())
    }

    // 可选：希望提供方先起来时再声明。
    fn soft_inject() -> Vec<String> {
        vec!["demo.notes".to_owned()]
    }
}
```

`call_service` 是普通安全函数，返回 `Result<String, AbiError>`：

- 服务不存在 / 方法不存在 / 方法指针是 `None` → `Err`；
- 方法返回 `NULL` → `Err`（v6 起 `NULL` 表示失败，空串才是「成功但没输出」）；
- 方法返回字符串 → 立刻拷成 `String`，调用方拿到的是自己的一份。

⚠️ 错误类型不细分「服务不存在」和「没有这个方法」。日志里要把服务名、方法名一起打出来。

### `soft_inject` 做了什么、没做什么 [#soft_inject-做了什么没做什么]

宿主在 `plugin_init` **之前**读 `plugin_manifest` 里的依赖列表（`define_plugin!` 会把
`Plugin::soft_inject()` 写进去）。同步阶段分两轮：

1. 先激活「硬依赖齐 **且** 软依赖也齐」的插件；
2. 再激活「只有硬依赖齐」的插件。

但它**不是**「提供方一定在」的保证：

- 提供方卡在硬依赖上时，消费方的软依赖不算齐，第二轮照样激活消费方；
- 提供方 `start()` 报错，软依赖同样不阻塞消费方；
- 运行期中提供方被卸载，消费方仍处于 `Active`，之后的每次调用都要自己处理错误。

一句话：**软依赖管排队，不管可用性**。所以上面的 `match` 分支不是客套，是必须的。

### 软依赖写服务名还是插件名？ [#软依赖写服务名还是插件名]

| 写法 | 宿主查什么 | 什么时候用 |
| --- | --- | --- |
| 服务名（`"demo.notes"`） | 根作用域的 `Context` 里有没有这个名字 | 推荐。换一个插件提供同名服务，排序仍然成立 |
| 插件名（`"demo.notes-provider"`） | 有没有同名插件处于 `Active` | 只关心「那个插件」而不是「那个能力」时 |

⚠️ 软依赖写**私有**服务名是排不上序的：兄弟插件看不到它，管理器在根作用域里也查不到。
跨插件的能力一律走 `provide_service_shared`，依赖也写同一个服务名。

### 软还是硬？ [#软还是硬]

| 场景 | 选择 |
| --- | --- |
| 没有它也要能跑，只是少一个功能 | `soft_inject` + 运行期降级 |
| 没有数据库 / 鉴权就完全没意义，宁可别启动 | `inject`（硬依赖） |
| 只要求「它先起来」，不直接调它的服务 | `soft_inject` 写插件名 |
| 能力名稳定、可能有替代提供者 | `soft_inject` 写服务名 |

硬依赖的语义是**准入**：缺了就不激活，停在 `Pending` 等；如果提供它的插件已经 `Failed`，
依赖方会被级联标成 `Failed`。但它也不传值——到了 `start()` 里，你仍然要自己
`get_service` / `call_service`。

依赖声明不要写进配置：manifest 是权威来源，`define_plugin!` 从 trait 自动生成。
只有没有 `plugin_manifest` 的 v3 老插件，宿主才回退到 `[plugin.<名字>].inject` /
`.soft_inject`（manifest 该侧非空时**覆盖**配置，不是合并）。见
[插件总览](./index.mdx#声明依赖inject-与-soft_inject)。

## 生命周期与所有权 [#生命周期与所有权]

| 事 | 规则 |
| --- | --- |
| 什么时候注册 | `start()`。`init()` 阶段插件还没被准入，别在那时对外暴露能力 |
| 注册进宿主的是什么 | 裸指针，**不复制**。VTable 和它引用的字符串 / 方法数组必须一直活着 |
| 什么时候释放 | `plugin_stop` 先跑，然后宿主 `rollback_owner` 撤销注册。`stop()` 里放下 `Box` 即可 |
| 同名冲突 | `provide_service_shared` 返回无效句柄，宿主只打一条 `warn`；调用方必须检查 `is_valid()` |
| 方法返回值 | 提供方持有，宿主当场拷走；不要跨调用保存那个指针 |
| `get_service` 的指针 | 同样是借的。别长期缓存——提供方一旦卸载，指针就悬空 |
| 方法在哪跑 | 调用方线程，同步执行。命令回调里调服务 = 在接收循环线程上跑，不能阻塞 |
| 输入可信吗 | 共享服务任何插件都能调。方法里自己校验 JSON、限制大小、别信 `context` 之外的东西 |

## 其它语言 [#其它语言]

| 语言 | 提供方 | 消费方 |
| --- | --- | --- |
| Rust | `provide_service` / `provide_service_shared` | `call_service`（推荐），或 `get_service` + 自己扫方法表 |
| C / C++ | VTable 里第 9 / 20 项 | `call_service`（第 24 项，v6 起）；`get_service` + 扫 `methods[i]` 仍能跑 |
| Go | 同上（c-shared 不能卸载，见 ABI 页） | 同上 |
| Python / JS / TS | 暂不支持 | 薄 SDK 还没暴露服务调用，见[脚本插件](../script/index.mdx) |

> 自己 `get_service` 再直调**能跑，但宿主不在场**：这次调用不算「经过宿主」，所以
> 提供方的 `current_plugin()` 拿不到调用方（返回 `None`）、失败也没有 `last_error` 细节。
> 要身份和错误信息就用 `call_service`。

C 侧的字段布局与调用示例见 [插件 ABI](./abi.mdx#服务的形状servicevtable) 和
[原生插件](./native.mdx)。

## 排查 [#排查]

- 服务注册失败：宿主日志里有一行 `注册共享服务 … 失败: 命名服务 … 已经注册过了`
  （或「收到了空 vtable」）。
- 调用失败：日志里要带服务名 + 方法名；`last_error` 会有具体原因。
- 谁在跑、谁在等：`/plugins` 走宿主预置的 `fuyubot.host.plugins` 服务，会列出
  `active` / `pending`（带 `missing`）/ `failed`（带 `reason`）；`fuyubot status` 读的是
  实例发布的同一份快照。
- 依赖声明从哪来：`plugin_manifest`。激活时日志里那行
  `激活 <名字> v<版本>（硬依赖 N、软依赖 M）` 就是宿主实际读到的数量。
- 命令表 / 缓存是宿主预置服务，不会再出现「等 `/help` 先起来」这种依赖。

## 一页检查清单 [#一页检查清单]

- [ ] 提供方用 `provide_service_shared`，方法名和 JSON 协议写进文档。
- [ ] VTable、方法数组、名字缓冲装在同一个 `Box` 里，注册后不再扩容。
- [ ] 检查 `ServiceHandle::is_valid()`；`stop()` 里放下持有物，不手动 free 宿主的东西。
- [ ] 消费方对 `call_service` 的失败有降级分支，不 `unwrap`。
- [ ] 可选联动用 `soft_inject`，并接受「提供方可能不在」；缺了就活不了才用 `inject`。
- [ ] 方法里不做慢活、不阻塞调用方线程；也不让 panic 逃出 `extern "C"` 边界。
- [ ] 命令登记走 `fuyubot.host.commands`，不需要再软依赖 `/help`。
