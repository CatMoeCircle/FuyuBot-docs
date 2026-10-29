# 订阅与事件 (/docs/plugin/events)

事件总线是插件拿到 TDLib 更新的唯一入口，也是插件之间说话的方式。三个动作：
`on` 订阅（返回句柄）、`off` 退订（或让句柄 drop）、`emit` 发自定义事件。

## 双通道：具体 `@type` 与兜底 `update` [#双通道具体-type-与兜底-update]

每条更新会被**同时**发到两条通道上：

| 通道 | 谁收 | 什么时候用 |
| --- | --- | --- |
| 具体的 `@type`（`updateNewMessage` 等） | 精确订阅了它的监听器 | 你只关心一种更新 |
| `"update"` | 订阅兜底通道的所有监听器 | 你要看全部，或不想追 TDLib 的类型名 |
| `"response"` | **只发给发起那个请求的插件** | 收 `td_invoke*` 的结果 |

`"update"` 与 `"response"` 是 ABI 常量（`UPDATE_EVENT` / `RESPONSE_EVENT`），别自己拼字符串。

一条更新从进来到落到你的回调，中间是这样走的：

<svg viewBox="0 0 680 416" width="100%" role="img" aria-label="更新分发：穿过管线后同时发到两条通道" style={{ maxWidth: '680px', margin: '1.75rem auto', display: 'block' }}>
  <title>更新分发：穿过管线后同时发到两条通道</title>
  <desc>TDLib 的更新经接收循环交给 UpdatePipeline，穿过 PreUpdate、PreRoute、InPlugin、PostResponse 四个阶段后，被同时发到具体 @type 通道与兜底 update 通道，分别落到精确订阅的插件与订阅兜底的插件。</desc>
  <defs>
    <marker id="ev-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </marker>
  </defs>

  <rect x="140" y="16" width="400" height="56" rx="10" fill="var(--color-fd-primary)" fillOpacity="0.05" stroke="var(--color-fd-primary)" strokeOpacity="0.4" strokeWidth="1" />
  <text x="340" y="40" fontSize="12.5" fontWeight="500" textAnchor="middle" dominantBaseline="central" fill="currentColor">TdClient 接收循环</text>
  <text x="340" y="60" fontSize="10.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" fillOpacity="0.6">一条原始 JSON 更新进来</text>

  <path d="M340 72 L340 96" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" markerEnd="url(#ev-arrow)" />

  <rect x="40" y="100" width="600" height="132" rx="14" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
  <text x="60" y="122" fontSize="12.5" fontWeight="500" dominantBaseline="central" fill="currentColor">UpdatePipeline::process_value</text>
  <text x="620" y="122" fontSize="10.5" textAnchor="end" dominantBaseline="central" fill="currentColor" fillOpacity="0.55">六阶段，实跑 4 个</text>

  <rect x="52" y="134" width="132" height="56" rx="8" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
  <text x="118" y="154" fontSize="12.5" fontWeight="500" textAnchor="middle" dominantBaseline="central" fill="currentColor">PreUpdate</text>
  <text x="118" y="174" fontSize="10.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" fillOpacity="0.6">0 · 刚进来</text>

  <rect x="200" y="134" width="132" height="56" rx="8" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
  <text x="266" y="154" fontSize="12.5" fontWeight="500" textAnchor="middle" dominantBaseline="central" fill="currentColor">PreRoute</text>
  <text x="266" y="174" fontSize="10.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" fillOpacity="0.6">1 · 解析 @type</text>

  <rect x="348" y="134" width="132" height="56" rx="8" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
  <text x="414" y="154" fontSize="12.5" fontWeight="500" textAnchor="middle" dominantBaseline="central" fill="currentColor">InPlugin</text>
  <text x="414" y="174" fontSize="10.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" fillOpacity="0.6">2 · 可改负载</text>

  <rect x="496" y="134" width="132" height="56" rx="8" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
  <text x="562" y="154" fontSize="12.5" fontWeight="500" textAnchor="middle" dominantBaseline="central" fill="currentColor">PostResponse</text>
  <text x="562" y="174" fontSize="10.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" fillOpacity="0.6">3 · 收尾</text>

  <path d="M184 162 L196 162" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" markerEnd="url(#ev-arrow)" />
  <path d="M332 162 L344 162" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" markerEnd="url(#ev-arrow)" />
  <path d="M480 162 L492 162" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" markerEnd="url(#ev-arrow)" />

  <text x="60" y="216" fontSize="10.5" dominantBaseline="central" fill="currentColor" fillOpacity="0.55">中间件挂在阶段上；一条更新只跑一遍，不是每个监听器一遍</text>

  <path d="M340 232 L340 256" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" markerEnd="url(#ev-arrow)" />
  <text x="352" y="246" fontSize="10.5" dominantBaseline="central" fill="currentColor" fillOpacity="0.55">同时发两条</text>

  <rect x="60" y="260" width="280" height="56" rx="10" fill="var(--color-fd-primary)" fillOpacity="0.05" stroke="var(--color-fd-primary)" strokeOpacity="0.4" strokeWidth="1" />
  <text x="200" y="280" fontSize="12.5" fontWeight="500" textAnchor="middle" dominantBaseline="central" fill="currentColor">具体 @type 通道</text>
  <text x="200" y="300" fontSize="10.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" fillOpacity="0.6">updateNewMessage、……</text>

  <rect x="340" y="260" width="280" height="56" rx="10" fill="var(--color-fd-primary)" fillOpacity="0.05" stroke="var(--color-fd-primary)" strokeOpacity="0.4" strokeWidth="1" />
  <text x="480" y="280" fontSize="12.5" fontWeight="500" textAnchor="middle" dominantBaseline="central" fill="currentColor">兜底 update 通道</text>
  <text x="480" y="300" fontSize="10.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" fillOpacity="0.6">每条更新都发一份</text>

  <path d="M200 316 L200 340" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" markerEnd="url(#ev-arrow)" />
  <path d="M480 316 L480 340" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" markerEnd="url(#ev-arrow)" />

  <rect x="60" y="340" width="250" height="56" rx="10" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
  <text x="185" y="360" fontSize="12.5" fontWeight="500" textAnchor="middle" dominantBaseline="central" fill="currentColor">插件 A</text>
  <text x="185" y="380" fontSize="10.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" fillOpacity="0.6">精确订阅 updateNewMessage</text>

  <rect x="355" y="340" width="265" height="56" rx="10" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
  <text x="487" y="360" fontSize="12.5" fontWeight="500" textAnchor="middle" dominantBaseline="central" fill="currentColor">插件 B</text>
  <text x="487" y="380" fontSize="10.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" fillOpacity="0.6">订阅兜底 update，或带过滤器</text>
</svg>

**两条通道是「同时」，不是「二选一」**：一条 `updateNewMessage` 既会敲精确订阅它的监听器，也会敲所有
订阅了 `"update"` 的监听器。过滤器在两个通道上各判一次，所以订阅兜底又写了过滤器的那一侧不会因为
「没命中精确通道」而漏掉。

## 过滤器 [#过滤器]

`on` 的第三个参数是一份过滤器 JSON：**点分路径 → 期望值**。

```json
{ "message.chat_id": -1001234567890 }
```

| 规则 | 说明 |
| --- | --- |
| `event_type` 键只用来**选通道** | `{"event_type":"response","request_id":5}` 表示等 5 号响应；它**不参与负载匹配** |
| 其余键做负载字段相等匹配 | 字段位置随更新类型变：`updateNewMessage` 的 `chat_id` 在 `message.chat_id` |
| 空 / `null` / 不传 | 该通道全收 |

同一个事件可以订阅**多次**、各带各的过滤器。脚本侧按订阅号 `handle` 分发，所以不该响的回调不会响。

## 归属：`emit` 不是广播 [#归属emit-不是广播]

插件里调 `emit` 走的是 `emit_scoped(自己, …)`：只送给**该插件自己 + 全局订阅者**。
归属的语义是「**额外定向**」而不是「排除广播」——宿主 `emit` 的更新照旧发给所有订阅者，
`emit_scoped(owner, …)` 只是在那份收件人之外**再加**上 `owner` 自己的订阅。

| 谁发 | 谁收得到 |
| --- | --- |
| 宿主发更新 / `emit` | 所有匹配的订阅者 |
| 插件 `emit("x", …)` | 该插件自己的订阅者 + 全局订阅者 |
| 宿主的响应 | `emit_scoped(发起者, "response", …)`：全局 + 发起者 |

要让别的插件收到你的事件，**让对方订阅全局事件**，不要指望你的 `emit` 是一次广播。

<Callout type="warn">
  订阅句柄必须活着。Rust 侧 `HostExt::subscribe_json` 返回的是 `#[must_use]` 的
  `Subscription`，**drop 就是退订**；`let _ = …` 会立刻退订。插件卸载时宿主还会整批回滚，
  但那已经是另一回事了。
</Callout>

## Rust [#rust]

```rust
use fuyubot_plugin_api::{HostApi, HostExt, Subscription};
use serde_json::json;

struct MyPlugin {
    host: HostApi,
    _all: Option<Subscription>,
    _mine: Option<Subscription>,
}

fn start(&mut self, _config_json: &str) -> Result<(), String> {
    // 兜底通道 + 无条件
    self._all = self.host.subscribe_json("update", None, on_any, std::ptr::null_mut());

    // 具体 @type + 字段过滤
    let filter = json!({ "message.chat_id": -1001234567890 });
    self._mine = self.host.subscribe_json(
        "updateNewMessage", Some(filter), on_mine, std::ptr::null_mut(),
    );
    Ok(())
}

fn emit_job_done(&self) {
    // 只有「自己 + 全局订阅者」收得到
    let _ = self.host.emit("job_done", &json!({ "ok": true }).to_string());
}
```

回调用 `extern "C-unwind" fn(user_data, payload) -> i32`，返回 `0` 表示成功；`payload` 是宿主临时的
NUL 结尾字符串，要留就当场拷走（`parse_payload` 已经替你解析成 `serde_json::Value`）。

## Python / JS（薄 SDK） [#python--js薄-sdk]

```python
from fuyubot import on, emit, log

on("updateNewMessage",
   lambda p: log("有人说 /hello"),
   {"message.content.text.text": "/hello"})

emit("job_done", {"ok": True})   # 自己 + 全局订阅者收得到
```

```js
import { on, emit, log } from "./fuyubot";

on("updateNewMessage", (payload) => {
  log("有人说 /hello");
}, { "message.content.text.text": "/hello" });

emit("job_done", { ok: true });
```

脚本侧的订阅**没有退订接口**——注册后一直有效，随插件停止一起撤。
方法的逐个说明见 [Python 插件](./python.mdx) / [JS 与 TS 插件](./js-ts.mdx)。

要按固定次数等一条更新（阻塞式），用 `wait_for_update`，见 [调用 TDLib](./tdlib.mdx)。
要改流经管线的负载，用中间件，见 [工具与中间件](./tools.mdx)。
