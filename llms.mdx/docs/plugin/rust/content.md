# Rust 插件 (/docs/plugin/rust)

Rust 插件只依赖一个 crate：`fuyubot-plugin-api`。它把 `fuyubot-abi` 的形状转成用着不疼的样子——
`HostApi`（已解包、调用路径上没有 `Option` 和 panic 分支）、`HostExt` 便利方法、
drop 即退订的 `Subscription`、`ResponseRouter`（可 `await` 的请求/更新等待），以及
`define_plugin!` 宏。异步写法见 [异步等待](./async.mdx)。

## 依赖 [#依赖]

```toml
# 由 `fuyubot-sdk init` 生成：独立插件 crate，不属于任何 workspace
[workspace]

[package]
name = "fuyubot_demo"
version = "0.1.0"
edition = "2024"
rust-version = "1.99"

[lib]
crate-type = ["cdylib"]          # 宿主 dlopen 的就是它

[dependencies]
fuyubot-plugin-api = "0.1.1"        # crates.io；对 SDK 源码开发时换成 path = "…/crates/fuyubot-plugin-api"
```

那个空的 `[workspace]` 不是多余的：没有它，cargo 会一路往上找父目录的 workspace 声明然后报错。

## 最小可用插件 [#最小可用插件]

这就是 `fuyubot-sdk init demo --lang rust` 生成的模板：

```rust
use fuyubot_plugin_api::{HostApi, HostExt, Plugin, Subscription, define_plugin};

struct MyPlugin {
    host: HostApi,
    /// 订阅句柄**必须活着**：它 drop 的那一刻就退订了。
    _updates: Option<Subscription>,
}

impl Plugin for MyPlugin {
    fn init(host: HostApi) -> Result<Self, String> {
        host.info("demo: init");
        Ok(Self { host, _updates: None })
    }

    fn start(&mut self, config_json: &str) -> Result<(), String> {
        self.host.info(&format!("demo: start({config_json})"));
        // 兜底通道 "update" 收全部；要精确就换成 "updateNewMessage" 之类具体的 @type。
        self._updates = self
            .host
            .subscribe_json("update", None, on_update, std::ptr::null_mut());
        Ok(())
    }
}

/// 回调没有捕获环境；要状态就放进插件字段、经 `user_data` 传进来。
extern "C-unwind" fn on_update(
    _user: *mut std::ffi::c_void,
    payload: *const std::ffi::c_char,
) -> i32 {
    // SAFETY: 宿主按 ABI 契约传的是临时 NUL 结尾字符串。
    let update = unsafe { fuyubot_plugin_api::parse_payload(payload) };
    let update_type = update.get("@type").and_then(|v| v.as_str()).unwrap_or("?");
    println!("demo: 收到 {update_type}");
    0
}

define_plugin!(MyPlugin, "demo");
```

## `Plugin` trait [#plugin-trait]

| 方法 | 对应符号 | 说明 |
| --- | --- | --- |
| `init(host) -> Result<Self, String>` | `plugin_init` | 构造状态；返回 `Err` = 加载失败 |
| `start(&mut self, config_json) -> Result<(), String>` | `plugin_start` | 宿主已把 VTable、插件目录都准备好；订阅/注册都写在这里 |
| `stop(&mut self)` | `plugin_stop` | 可选；宏随后把状态收回 `Box` 释放 |

`define_plugin!` 还会把插件代码包在 `catch_unwind` 里——和 `C-unwind` 是两层，
**两层都要**：一层防 panic 逃出 ABI，一层防 panic 把宿主线程带走。

## 读 / 写配置 [#读--写配置]

每个插件在 `fuyubot.toml` 的 `[plugin.<插件名>]` 下有自己的一段配置（详见[配置文件](../usage/config.mdx)）。
`HostApi` 上两个方法直接读写它：

| 方法 | 作用 |
| --- | --- |
| `get_config(section, key) -> Option<String>` | 读**任意**段。`section` 空串读顶层（`[bot]` 等），`key` 空串读整段、否则按点路径取键。返回 JSON 文本，找不到就是 `None` |
| `set_config(key, value_json) -> Result<(), AbiError>` | 写**自己**的段。**没有 section 参数**——宿主按调用者身份判定，写不到别人那段。`key` 空串覆盖整段。成功后写内存并回写 `fuyubot.toml` |

```rust
fn start(&mut self, _config_json: &str) -> Result<(), String> {
    // 读自己的段 `[plugin.demo]`（插件名点分，宿主当点路径下钻到 plugin.demo）。
    let greeting: String = self
        .host
        .get_config("demo", "greeting")
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_else(|| "hello".to_owned());
    self.host.info(&format!("greeting = {greeting}"));

    // 读别人的段：允许（只读）。
    if let Some(city) = self.host.get_config("my.weather", "city") {
        self.host.info(&format!("天气插件的 city = {city}"));
    }

    // 写自己的段：把上次启动时间存回去（会回写 fuyubot.toml）。
    self.host
        .set_config("last_started", "\"2026-01-01\"")
        .map_err(|e| format!("写自己的配置失败: {e}"))?;
    Ok(())
}
```

<Callout type="warn">
  `set_config` 回写是**全量重写** `fuyubot.toml`——你手写在文件里的注释、空行会被 `toml`
  序列化丢掉。插件写配置属于程序化修改，这是可接受的取舍；要保注释就别让插件运行时去改，
  把值手工维护进文件。
</Callout>

## 回调里带状态 [#回调里带状态]

回调是裸函数指针，没有捕获环境。状态要么放插件字段、经 `user_data` 传进去，要么像
`examples/rust-echo` 那样把 `Box<HostApi>` 的地址当 `user_data`：

```rust
// 结构体里另加一个 state: usize 字段，stop 时清零。
fn start(&mut self, _config_json: &str) -> Result<(), String> {
    let state = Box::into_raw(Box::new(self.host));
    self.state = state as usize;
    self._updates = self.host.subscribe_json(
        "updateNewMessage", None, on_message, state as *mut std::ffi::c_void,
    );
    Ok(())
}
```

`stop` 里用 `Box::from_raw` 收回，只收一次；否则就是内存泄漏（或重复释放）。

<Callout type="warn">
  `Subscription` 是 `#[must_use]`：`let _ = host.subscribe_json(…)` 会**立刻退订**。
  一定要存进插件字段。插件卸载时宿主还会整批回滚，但那时插件自己的状态已经漏了。
</Callout>

## 一次看全：常用 ABI 怎么调 [#一次看全常用-abi-怎么调]

`HostApi` 上是 VTable 那 20 个函数的一对一封装，`HostExt` 另外给了几个「不用自己拼 JSON 字符串」
的便利方法（`subscribe_json` / `invoke_value` / `call_tool_value` / `config_value` /
`set_config_value` / `wait_for_update_json` / `info|warn|error`）。下面这段把它们用了一遍
（省掉了 `user_data` 取 `HostApi` 的样板，见上面「回调里带状态」一节）：

```rust
use fuyubot_plugin_api::{HostApi, HostExt, Stage};
use serde_json::json;

fn start(&mut self, _config_json: &str) -> Result<(), String> {
    // ① 订阅：第二个参数是过滤器（None = 全收）
    self._updates = self.host.subscribe_json(
        "updateNewMessage",
        Some(json!({ "message.content.text.text": "/ping" })),
        on_ping,
        std::ptr::null_mut(),
    );

    // ② 发自定义事件：自己 + 全局订阅者收得到
    self.host
        .emit("demo.ready", &json!({ "ok": true }).to_string())
        .map_err(|e| e.to_string())?;

    // ③ 登记工具：带处理器；只登记元数据用 register_tool_meta
    self._tool = Some(self.host.register_tool(
        r#"{"name":"demo.echo","description":"回显入参","input_schema":{"type":"object"}}"#,
        Some(on_echo),
        std::ptr::null_mut(),
    ));

    // ④ 挂中间件：阶段数值见「工具与中间件」
    self.host
        .use_middleware(Stage::InPlugin as u32, on_stage, std::ptr::null_mut());

    // ⑤ 读写配置（HostExt 的版本直接吃 serde_json::Value）
    if let Some(city) = self.host.config_value("my.weather", "city") {
        self.host.info(&format!("天气插件 city = {city}"));
    }
    self.host.set_config_value("last_seen", json!(123))?;

    // ⑥ 看看进程里都有哪些工具 / 插件（返回的是宿主线程局部缓冲，读完即弃）
    if let Some(tools) = self.host.list_tools() {
        self.host.info(&format!("工具表：{tools}"));
    }
    Ok(())
}

extern "C-unwind" fn on_ping(user: *mut std::ffi::c_void, payload: *const std::ffi::c_char) -> i32 {
    // SAFETY: 宿主按 ABI 契约传的是临时 NUL 结尾字符串。
    let update = unsafe { fuyubot_plugin_api::parse_payload(payload) };
    // SAFETY: user_data 是 start 里塞进去的 Box<HostApi>。
    let Some(host) = (unsafe { (user as *const HostApi).as_ref() }) else {
        return -1;
    };
    let chat_id = update.pointer("/message/chat_id").and_then(|v| v.as_i64());
    let Some(chat_id) = chat_id else { return 0 };

    // ⑦ 发请求：只拿请求号，响应走 "response" 通道（见「调用 TDLib」）
    match host.invoke_value("sendMessage", json!({
        "chat_id": chat_id,
        "input_message_content": {
            "@type": "inputMessageText",
            "text": { "@type": "formattedText", "text": "pong", "entities": [] },
        },
    })) {
        Ok(request) => host.info(&format!("已发 #{}", request.id)),
        Err(e) => host.error(&format!("发不出去：{e}")),
    }

    // ⑧ 同步执行不碰网络的方法：当场返回，不进接收循环
    let parsed = host.td_execute(r#"{"@type":"parseTextEntities","text":"*粗体*",
        "parse_mode":{"@type":"textParseModeMarkdown","version":2}}"#);

    // ⑨ 调别人的工具（同步拿结果）
    match host.call_tool_value("weather.now", json!({ "city": "上海" })) {
        Ok(out) => host.info(&format!("天气：{out}")),
        Err(e) => host.warn(&format!("调工具失败：{e}")),
    }
    0
}
```

| 想干什么 | 用哪个 |
| --- | --- |
| 订阅 / 退订 | `subscribe_json`（返回 `Subscription`，drop 即退订）/ 句柄 `off` |
| 发 TDLib 请求 | `invoke_value(method, params)`（或底层 `td_invoke_simplified` 吃字符串） |
| 同步执行 | `td_execute`（`parseTextEntities` / `getTextEntities` 这类） |
| 等一条更新 / 一条响应 | `wait_for_update_json`（阻塞）或 `ResponseRouter` 的 `await` 版，见[异步等待](./async.mdx) |
| 工具 | `register_tool` / `register_tool_meta` / `call_tool` / `call_tool_result` / `list_tools` |
| 服务 | `provide_service`（自己作用域）/ `provide_service_shared`（进程级）/ `get_service` |
| 配置 | `get_config` / `set_config`（字符串版）、`config_value` / `set_config_value`（`Value` 版） |
| 中间件 | `use_middleware(Stage::X as u32, cb, user_data)` |
| 看别人 | `list_tools` / `list_plugins` |

## 用封装层发消息：`fuyubot-simplify` [#用封装层发消息fuyubot-simplify]

上面 ⑦ 那种手写 JSON 能跑，但每个方法都要自己拼嵌套结构、还要自己等「发送结局」。
Rust 插件可以直接用封装层——**只有 Rust 有这个**（它是 crate，不是 ABI）：

```toml
[dependencies]
fuyubot-simplify = "0.1"      # 与 fuyubot-plugin-api 同版本线
```

```rust
use fuyubot_simplify::{SendMessageParams, Simplify, Text};

fn start(&mut self, _config_json: &str) -> Result<(), String> {
    let simplify = Simplify::new(self.host);        // HostApi 是 Copy

    // 等到「真发出去」才返回，拿到最终那条 Message
    let sent = simplify
        .send_message(chat_id, &SendMessageParams::text("你好"))
        .map_err(|e| e.to_string())?;

    // Markdown + 回复 + 内联键盘一次到位；Markdown 不自己解析，问 TDLib 要 entities
    simplify
        .send_message(chat_id, &SendMessageParams {
            text: Some(Text::markdown("*粗体*")),
            reply_to_message_id: Some(sent["id"].as_i64().unwrap_or(0)),
            ..SendMessageParams::default()
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

它只简化**输入**，不改变输出：每个方法仍经 `td_invoke*` 发出，原始更新照旧对插件可见。
完整 API（发送 / 相册 / 编辑 / 富消息 / 命令解析）见 [Simplify 封装](./simplify.mdx)。
⚠️ 在更新回调里**不能**用这些等待版——等更新要靠接收循环那个线程送回来，而回调就跑在它上面；
回调里请用 `*_then`，见[异步等待](./async.mdx)。

## 编译与安装 [#编译与安装]

```bash
cargo build --release
fuyubot plugin install target/release/fuyubot_demo.dll
```

<Callout type="error">
  `define_plugin!` **一个 crate 只能展开一次**。一个 cdylib 就是一个插件——这不是限制，是设计：
  七个导出符号名由 ABI 定死，展开两次就是重复定义。
</Callout>

要发消息、调 TDLib、等响应，见 [调用 TDLib](./tdlib.mdx)；要按字段过滤更新，见
[订阅与事件](./events.mdx)；契约本身见 [ABI 契约](./abi.mdx)。
