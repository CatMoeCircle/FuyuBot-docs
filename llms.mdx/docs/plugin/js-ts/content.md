# JS 与 TypeScript 插件 (/docs/plugin/js-ts)

JS / TS 插件就是一个目录：`package.json` 写身份，入口文件写逻辑，`fuyubot.ts`（单文件薄 SDK）
管通信。运行时是 [bun](https://bun.sh)，**TS 不需要 `tsc`**。上手三步见
[脚本插件](./scripts.mdx)。本页是**方法手册 + 示例**。

<Callout type="info">
  本页讲托管路径的 `fuyubot.js` / `fuyubot.ts`（`fuyubot-js-host`），它也支持
  `runAsync` / `invokeAsync` / `waitAsync`。`script_plugin!` 内嵌的
  `fuyubot_plugin.js` 有同名 API，见 [异步等待](./async.mdx)。
</Callout>

```text
my-plugin/
  package.json   ← 身份（"fuyubot" 段：name / entry）
  index.ts       ← 你写的逻辑（.js 也行）
  fuyubot.ts     ← 薄 SDK（单文件，拷进来就行）
  fuyubot.d.ts   ← 类型声明（可选，IDE 补全）
```

manifest 长这样（`entry` 不写就默认 `index.ts`）：

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "type": "module",
  "fuyubot": { "name": "mybot.my-plugin", "entry": "index.ts" }
}
```

## 方法一览 [#方法一览]

薄 SDK 把 VTable 那 22 个函数包成了这些（`run()` 之前只能调同步的那几个）：

| 方法 | 走的 ABI | 干什么 |
| --- | --- | --- |
| `on(event, handler, filter?)` | `on` | 订阅事件：事件来了就调你的函数 |
| `off(event, handler)` | `off` | 退订一个订阅 |
| `invoke(method, params?, onResponse?)` | `td_invoke_simplified` | 调一次 TDLib 接口；给了 `onResponse` 就在响应回来时调（按 `request_id` 配对，不用自己记请求号） |
| `invokeAsync(method, params?)` | `td_invoke_simplified` | 同上，返回 Promise |
| `emit(event, payload?)` | `emit` | 发一条自定义事件（自己 + 全局订阅者收到） |
| `log(message, level = "info")` | `log` | 打日志（`debug` / `info` / `warn` / `error`） |
| `registerTool(name, description = "", inputSchema?)` | `register_tool`（`meta` 版） | 登记工具**元数据**——脚本不能交函数指针，所以没有处理器 |
| `callTool(name, input?, onResponse?)` | `call_tool_result` | 调用一个工具，**同步**拿输出（失败是 `{"error": …}`） |
| `listTools(onTools?)` | `list_tools` | 同步列出全部工具的元数据 |
| `tdExecute(request, onResult?)` | `td_execute` | **同步**执行不碰网络的 TDLib 方法（`parseTextEntities` 之类），发消息**不能**走它 |
| `useMiddleware(stage, handler)` | `use_middleware` | 挂中间件（`stage` 是 0..5）；不能单独注销，随插件停止一起撤 |
| `waitForUpdate(filter, timeoutMs?, onMatch?)` | `wait_for_update` | 等一条匹配的更新（在宿主侧独立线程里等），超时回调收到 `null` |
| `waitAsync(filter, timeoutMs?)` | `wait_for_update` | 上一条的 Promise 版 |
| `getService(name, onService?)` | `get_service` | 读一个服务的元数据；不存在时回调收到 `null` |
| `callService(name, method, input?, onResult?)` | `get_service` | 同步调用服务的某个方法 |
| `config()` | — | `plugin_start` 传进来的那份配置 JSON |
| `pluginConfig()` | — | **同步**读**自己**那一段配置（`[plugin.<插件名>]`）；`run()` 之前也能用 |
| `getConfig(section, key?, onConfig?)` | `get_config` | 读**任意**插件段（异步，回调在 `run()` 之后） |
| `setConfig(key, value, onDone?)` | `set_config` | 写**自己**那一段配置（成功后回写 `fuyubot.toml`） |
| `simplifyInvoke(op, onResponse?)` | `simplify_invoke` | 让宿主跑一个 simplify 操作（发消息等结局、超时撤回、Markdown→entities…）；结果经 `response` 通道回投，整条 `simplifyResult` 交 `onResponse`（不传就只发不收） |
| `simplifyInvokeAsync(op)` | `simplify_invoke` | 上一条的 Promise 版，`resolve` 整条 `simplifyResult`（`{ok, op, result\|error}`），自己判 `ok` |
| `simplifyInvokeResult(op, onResult?)` | `simplify_invoke_result` | **同步**跑不碰网络的 op（`parse_text_entities` / `rich_from_markdown` / `list_ops`），回调收结果；传异步 op 拿到 `ok:false` / `code:"async_op"` |
| `run()` | — | 握手并开始收事件——**永远是最后一行** |

## 一次看全：常用 ABI 怎么调 [#一次看全常用-abi-怎么调]

```js
import { on, invoke, tdExecute, callTool, listTools, emit, waitForUpdate,
         getConfig, setConfig, log, run } from "./fuyubot";

on("updateNewMessage", (payload) => {
  const chatId = payload.message.chat_id;

  // ① 发 TDLib 请求：响应按 request_id 配好对再回调
  invoke("sendMessage", {
    chat_id: chatId,
    input_message_content: {
      "@type": "inputMessageText",
      text: { "@type": "formattedText", text: "pong", entities: [] },
    },
  }, (resp) => log(`发出去了：${JSON.stringify(resp)}`));

  // ② 同步执行不碰网络的方法：当场拿结果，发消息不能走它
  tdExecute({
    "@type": "parseTextEntities",
    text: "*粗体*",
    parse_mode: { "@type": "textParseModeMarkdown", version: 2 },
  }, (result) => log(`解析结果：${JSON.stringify(result)}`));

  // ③ 调别人的工具 / 看有哪些工具
  callTool("weather.now", { city: "上海" }, (out) => log(`天气：${JSON.stringify(out)}`));
  listTools((tools) => log(`共 ${(tools || []).length} 个工具`));

  // ④ 发自定义事件：自己 + 全局订阅者收得到
  emit("ping.seen", { chat_id: chatId });

  // ⑤ 等下一条更新（宿主侧独立线程里等，不阻塞脚本）
  waitForUpdate({ "message.content.text.text": "/pong" }, 5000,
    (p) => log(p ? "等到下一条" : "超时"));

  // ⑥ 读写配置：读别人的异步，写自己的会回写 fuyubot.toml
  getConfig("my.weather", "city", (v) => log(`天气插件 city=${v}`));
  setConfig("last_seen", chatId, (ok) => log(`写入成功=${ok}`));
}, { "message.content.text.text": "/ping" });

run();
```

三条容易踩的：

- `onResponse` / `onResult` 这类回调**只在 `run()` 之后才有**——宿主得先握手；模块顶层只能调
  `pluginConfig()` 这种同步的。
- `tdExecute` 只给不碰网络的方法用，拿它发消息会失败。
- `waitForUpdate` 是在**宿主侧**线程里等的，脚本这边不阻塞；`timeoutMs` 省略表示只检查当前状态。

## 读 / 写配置 [#读--写配置]

`fuyubot.toml` 里每个插件有自己的段（见[配置文件](../usage/config.mdx)）。读**自己**那段
用 `pluginConfig()`——它是**同步**的，宿主在启动脚本时就把这段塞进了 `argv[2]`，所以
`run()` 之前（模块顶层）就能用：

```ts
import { on, log, pluginConfig, getConfig, run } from "./fuyubot";

const cfg = pluginConfig(); // { city: "上海" }；没配就是 {}
const city = (cfg.city as string) ?? "北京";

on("updateNewMessage", (payload) => {
  log(`城市 = ${city}`);
  // 读别人的段：异步，回调要等 run() 之后。
  getConfig("my.weather", "city", (value) => log(`天气插件的城市：${JSON.stringify(value)}`));
});

run();
```

```toml
# fuyubot.toml —— 这个段就叫 [plugin.<你的插件名>]
[plugin.fuyubot.js.weather]
city = "上海"
```

- **读别人的段**（`getConfig`）是**异步**的：回执要等 `run()` 之后才有，所以只能在事件/中间件
  回调里用。段或键不存在时回调收到 `null`。
- **写自己的段**（`setConfig`）也是异步的，成功后 `onDone(true)`，宿主会**回写
  `fuyubot.toml`**。⚠️ 回写是**全量重写**，你手写的注释会丢。
- 写失败（越权 / 值不是合法 JSON / 写盘失败）时宿主只发一条 error 日志、**不会**调 `onDone`
  ——别把「没收到回调」当成成功。

<Callout type="info">
  脚本插件只能写**自己**的段：`setConfig` 没有 section 参数，宿主按调用者身份判定归属，
  所以改不到别的插件那一段（会被拒）。这是 ABI 层面的硬约束，不是薄 SDK 的限制。
</Callout>

## 事件怎么触发 [#事件怎么触发]

你的函数只有**被事件触发**才会跑。事件有两个来源：

1. **TDLib 更新**：来一条消息、消息发送成功……每种更新是一个事件，**事件名就是更新的 `@type`**
   （`updateNewMessage`、`updateMessageSendSucceeded` ……）。每条更新会同时发到两个通道：
   具体的 `@type` 事件，和兜底的 `"update"` 事件（订阅它可以看全部）。
2. **你自己发的事件**：`emit("job_done", …)` 发出的自定义事件（细节见
   [订阅与事件](./events.mdx)）。

<svg viewBox="0 0 680 204" width="100%" role="img" aria-label="事件怎么到你手上：TDLib 更新按 @type 分发，自己的事件直接送" style={{ maxWidth: '680px', margin: '1.75rem auto', display: 'block' }}>
  <title>事件怎么到你手上</title>
  <desc>TDLib 的更新按 @type 分发到具体订阅，没有具体订阅时落到 update 兜底通道；插件自己 emit 的事件直接送给对应订阅者。</desc>
  <defs>
    <marker id="evt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </marker>
  </defs>

  <rect x="40" y="16" width="150" height="44" rx="10" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
  <text x="115" y="38" fontSize="12" fontWeight="500" textAnchor="middle" dominantBaseline="central" fill="currentColor">TDLib 更新</text>

  <rect x="230" y="16" width="180" height="44" rx="10" fill="var(--color-fd-primary)" fillOpacity="0.05" stroke="var(--color-fd-primary)" strokeOpacity="0.35" strokeWidth="1" />
  <text x="320" y="30" fontSize="12" fontWeight="500" textAnchor="middle" dominantBaseline="central" fill="currentColor">按 @type 分发</text>
  <text x="320" y="47" fontSize="10.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" fillOpacity="0.55">PreRoute 之后</text>

  <rect x="460" y="6" width="180" height="44" rx="10" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
  <text x="550" y="24" fontSize="11" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" textAnchor="middle" dominantBaseline="central" fill="currentColor">on(&apos;updateNewMessage&apos;)</text>
  <text x="550" y="41" fontSize="10.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" fillOpacity="0.55">具体类型</text>

  <rect x="460" y="70" width="180" height="44" rx="10" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
  <text x="550" y="88" fontSize="11" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" textAnchor="middle" dominantBaseline="central" fill="currentColor">on(&apos;update&apos;)</text>
  <text x="550" y="105" fontSize="10.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" fillOpacity="0.55">兜底通道</text>

  <path d="M190 38 L226 38" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" markerEnd="url(#evt-arrow)" />
  <path d="M410 28 L456 26" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" markerEnd="url(#evt-arrow)" />
  <path d="M410 48 L456 86" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" markerEnd="url(#evt-arrow)" />

  <rect x="40" y="120" width="150" height="44" rx="10" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
  <text x="115" y="142" fontSize="11" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" textAnchor="middle" dominantBaseline="central" fill="currentColor">emit(&apos;job_done&apos;)</text>

  <rect x="460" y="140" width="180" height="44" rx="10" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
  <text x="550" y="162" fontSize="11" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" textAnchor="middle" dominantBaseline="central" fill="currentColor">on(&apos;job_done&apos;)</text>

  <path d="M190 142 L456 162" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" markerEnd="url(#evt-arrow)" />

  <text x="40" y="192" fontSize="10.5" fill="currentColor" fillOpacity="0.5">自己 emit 的事件不走 @type 分发，直接送到同名订阅者——所以插件之间的通信不必绕 TDLib。</text>
</svg>

## `on` — 订阅事件 [#on--订阅事件]

```ts
on(event, handler, filter?)
```

| 参数 | 说明 |
| --- | --- |
| `event` | 事件名：更新的 `@type`、`"update"`（全部更新）或你自定义的名字 |
| `handler` | 回调函数，收到一个 `payload`（解析好的对象，直接取字段） |
| `filter` | 可选。只收负载里**指定字段等于指定值**的事件（点分路径写法，见下） |

同一个事件可以订阅多次，各带各的过滤器。

```ts
import { on, log, run } from "./fuyubot";

const onMessage = (update: any) => {
  log(`新消息 ${update.message.id}`);
};

on("updateNewMessage", onMessage);          // 全收
on("update", () => log("来了一条更新"));      // 兜底通道
run();
```

**过滤器**：`{ "点分路径": 期望值 }`，负载里那个字段**等于**期望值才触发：

```ts
// 只听某个群的消息
on("updateNewMessage", onMessage, { "message.chat_id": -1001234567890 });

// 只听 /hello 命令（文本内容匹配）
on("updateNewMessage", onHello, { "message.content.text.text": "/hello" });
```

## `invoke` — 调 TDLib 接口 [#invoke--调-tdlib-接口]

```ts
invoke(method, params?, onResponse?)
```

发一个 TDLib 请求。方法名与参数名**以 TDLib 为准**（不是 Bot API），查法见
[调用 TDLib](./tdlib.mdx)。给了 `onResponse` 时回调按 `request_id` **自动配对**，
不用自己记请求号。

```ts
import { invoke } from "./fuyubot";

const onMessage = (update: any) => {
  // 发一条文本消息（TDLib 的 sendMessage + inputMessageText）
  invoke("sendMessage", {
    chat_id: update.message.chat_id,
    input_message_content: {
      _: "inputMessageText",
      text: { _: "formattedText", text: "收到" },
    },
  });
};

// 要看结果就传第三个参数：响应回来自动调它
invoke("getMe", {}, (resp) => console.log("我是", resp));
```

<Callout type="info">
  **`_` 就是 `"@type"`**：`params` 里嵌的 TDLib 对象都可以把判别字段写成 `_`，
  薄 SDK 会在发往宿主之前**递归**换回 `"@type"`——嵌套多深、数组里的对象都算。
  两种写法等价，同时写了两个时以 `"@type"` 为准：

  ```ts
  invoke("sendMessage", {
    chat_id: chatId,
    input_message_content: {
      // 完全等价于 { _: "inputMessageText", text: { _: "formattedText", text: "hi" } }
      "@type": "inputMessageText",
      text: { "@type": "formattedText", text: "hi" },
    },
  });
  ```

  这一层只在 JS / TS 薄 SDK 里做（宿主不会替你补判别字段），而且只作用于要发给
  TDLib 的东西：`emit` 的自定义负载、`callTool` 的参数不过这一步，那里的 `_`
  就是个普通字段。
</Callout>

<Callout type="warn">
  `invoke` **不阻塞**、立即返回。响应回来时你的 `onResponse` 被调用。
  不传 `onResponse` 就是「发完不管」。
</Callout>

## `emit` — 发自定义事件 [#emit--发自定义事件]

```ts
emit(event, payload?)
```

给**自己 + 全局订阅者**发一条自定义事件（不是广播给所有插件，见 [订阅与事件](./events.mdx)）。
适合在自己内部做「任务完成」之类的信号：

```ts
on("job_done", (p) => log(`任务完成：${JSON.stringify(p)}`));
emit("job_done", { ok: true });
```

## `log` — 打日志 [#log--打日志]

```ts
log(message, level = "info")
```

`level`：`error` / `warn` / `info` / `debug` / `trace`。排查问题时把配置里
`[plugins].log_level` 调成 `"debug"`（见[配置文件](../usage/config.mdx)）。

```ts
log("普通信息");
log("要坏事了", "warn");
```

## `registerTool` — 登记工具 [#registertool--登记工具]

```ts
registerTool(name, description = "", inputSchema?)
```

只登记**元数据**（名字、说明、参数的 JSON Schema），让宿主知道有这个工具；
调用分发看 [工具与中间件](./tools.mdx)。

```ts
registerTool("weather", "查天气", {
  type: "object",
  properties: { city: { type: "string" } },
  required: ["city"],
});
```

## `useMiddleware` — 挂中间件 [#usemiddleware--挂中间件]

```ts
useMiddleware(stage, handler)
```

`handler(stage, payload)` 在更新流经管线时被调用，可以检查或改写负载。
`stage` 是阶段号；细节看 [工具与中间件](./tools.mdx)。

```ts
const audit = (stage: number, payload: any) => {
  log(`阶段 ${stage} 看到一条更新`);
};

useMiddleware(2, audit);
```

## `run` — 启动 [#run--启动]

```ts
run()
```

发就绪握手、开始收事件，**阻塞到进程结束**。**必须是最后一行**——它提前返回 = 插件加载失败。

## 完整示例 [#完整示例]

**Echo 机器人**——回声复读：

```ts
import { on, invoke, run } from "./fuyubot";

const echo = (update: any) => {
  const message = update.message;
  const text = message?.content?.text?.text ?? "";
  if (!text || message.is_outgoing) return;   // 别回自己发的，否则自激
  invoke("sendMessage", {
    chat_id: message.chat_id,
    input_message_content: {
      "@type": "inputMessageText",
      text: { "@type": "formattedText", text },
    },
  });
};

on("updateNewMessage", echo);
run();
```

**命令处理器**——不同命令各干各的：

```ts
import { on, invoke, run } from "./fuyubot";

const reply = (chatId: number, text: string) =>
  invoke("sendMessage", {
    chat_id: chatId,
    input_message_content: {
      "@type": "inputMessageText",
      text: { "@type": "formattedText", text },
    },
  });

on("updateNewMessage", (u: any) => reply(u.message.chat_id, "你好！"),
  { "message.content.text.text": "/hello" });
on("updateNewMessage", (u: any) => reply(u.message.chat_id, "pong"),
  { "message.content.text.text": "/ping" });
run();
```

**按聊天计数**——记住状态：

```ts
import { on, invoke, run } from "./fuyubot";

const counts = new Map<number, number>();

on("updateNewMessage", (update: any) => {
  const message = update.message;
  if (!message || message.is_outgoing) return;
  const chatId: number = message.chat_id;
  const count = (counts.get(chatId) ?? 0) + 1;
  counts.set(chatId, count);
  invoke("sendMessage", {
    chat_id: chatId,
    input_message_content: {
      "@type": "inputMessageText",
      text: { "@type": "formattedText", text: `本聊天第 ${count} 条消息` },
    },
  });
});

run();
```

## 发消息：手写 `sendMessage`（或者用 `simplify_invoke`） [#发消息手写-sendmessage或者用-simplify_invoke]

> ✅ **ABI v5 起，这一节只是「另一条路」，不再是唯一的路。** 宿主从 v5 开始自己跑
> 同一份 `fuyubot-simplify` 代码，经 `simplify_invoke` / `simplify_invoke_result` 暴露成一张
> **op 表**（`{"op":"send_message","args":{…}}`），所有语言都能用——发消息等结局、超时撤回、
> bot 与用户号挑不同反应方法、Markdown → entities、富消息本地块树，都不用手写。
> 见 [ABI › simplify 操作表](./abi.mdx#simplify-操作表)。
> ✅ **JS / TS 薄封装已经支持** `simplifyInvoke` / `simplifyInvokeAsync` /
> `simplifyInvokeResult`（见上表）——直接调用即可，不必手写下面这些字段。


先来一个能跑的：用 `simplifyInvokeAsync` 发消息——宿主替你把文本解析成 `formattedText`、
等到「真发出去」那条 `Message`、超时还会先撤回：

```ts
import { on, simplifyInvokeAsync, log } from "./fuyubot";

// 在事件回调里调用（回投通道在 run() 之后才握手）
on("updateNewMessage", async (update: any) => {
  const result = await simplifyInvokeAsync({
    op: "send_message",
    args: {
      chat_id: update.message.chat_id,
      input_message_content: {
        "@type": "inputMessageText",
        // 纯字符串即可，simplify 按纯文本处理；
        // 想要 Markdown/HTML 就写 { text, parse_mode: "markdown" | "markdown_v2" | "html" }
        text: "你好，这是用 simplify 发的",
      },
      timeout_ms: 30000,
    },
  });
  if (result.ok) {
    log(`已发出，最终消息 id=${result.result?.id ?? "?"}`);
  } else {
    log(`发送失败：${result.error.code} ${result.error.message}`);
  }
});
```

只想要同步拿结果（不碰网络的 op）就用 `simplifyInvokeResult`，回调里收整条 `simplifyResult`：
`parse_text_entities` / `rich_from_markdown` / `list_ops`。传需要等 TDLib 应答的异步 op
会拿到 `ok:false` / `code:"async_op"`。

手写 `sendMessage` 是**另一条路**——下面这些字段你都得自己拼对：

| 想要的效果 | 手写的关键字段 |
| --- | --- |
| 纯文本 | `input_message_content` = `inputMessageText`，里面 `text` 是 `formattedText`（`text` + `entities`） |
| Markdown / HTML | **不自己解析**：先 `tdExecute` 调 `parseTextEntities`（`version: 2` = MarkdownV2，`textParseModeHTML` = HTML），把返回的 `formattedText` 整个塞进去 |
| 回复某条 | `reply_to` = `{"@type": "inputMessageReplyToMessage", "message_id": N}` |
| 发到话题 | `topic_id` = `{"@type": "messageTopicForum", "forum_topic_id": N}`（论坛）；非论坛的评论串才是 `messageTopicThread` |
| 内联按钮 | `reply_markup` = `replyMarkupInlineKeyboard`；⚠️ callback 按钮的 `data` 是 **base64**（TDLib 里它是 `bytes`） |
| 静音 / 保护内容 | 都在 `options`（`messageSendOptions`）里，不是顶层字段 |
| 等到「真发出去」 | `onResponse` 只到**临时消息**；要最终那条 `Message` 得再等一条 `updateMessageSendSucceeded` |

```ts
import { invoke, tdExecute, log } from "./fuyubot";

/** 发一条 MarkdownV2 消息：先问 TDLib 要 entities，再发出去。 */
function sendMarkdown(chatId: number, markdown: string, replyTo?: number) {
  tdExecute({
    "@type": "parseTextEntities",
    text: markdown,
    parse_mode: { "@type": "textParseModeMarkdown", version: 2 },
  }, (result) => {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      input_message_content: {
        "@type": "inputMessageText",
        text: result ?? { "@type": "formattedText", text: markdown, entities: [] },
      },
    };
    if (replyTo) {
      body.reply_to = { "@type": "inputMessageReplyToMessage", message_id: replyTo };
    }
    invoke("sendMessage", body, (resp) => log(`已发：${JSON.stringify(resp)}`));
  });
}

/** 带一个回调按钮；data 在 TDLib 里是 bytes，JSON 里要写 base64。 */
function sendWithButton(chatId: number, label: string, payload: string) {
  invoke("sendMessage", {
    chat_id: chatId,
    input_message_content: {
      "@type": "inputMessageText",
      text: { "@type": "formattedText", text: label, entities: [] },
    },
    reply_markup: {
      "@type": "replyMarkupInlineKeyboard",
      rows: [[{
        "@type": "inlineKeyboardButton",
        text: "确认",
        type: {
          "@type": "inlineKeyboardButtonTypeCallback",
          data: Buffer.from(payload, "utf8").toString("base64"),
        },
      }]],
    },
  });
}
```

方法名拿不准就问 SDK，它读的是真 `td_api.tl`：`fuyubot-sdk td-method sendMessage`。

## 常见问题 [#常见问题]

- **原生桥**：薄 SDK 要加载原生桥（和托管插件同一份库）。查找顺序：脚本同目录 →
  环境变量 `FUYUBOT_NATIVE_LIB` → 当前工作目录。找不到会报
  「找不到 fuyubot 原生桥库」，排法见 [脚本插件常见问题](./scripts.mdx#常见问题)。
- **自检**：`bun fuyubot.ts` 验证 API 形状（不碰宿主），输出 `fuyubot: self-test ok`。
- **依赖工具**：要装 [bun](https://bun.sh)（机器人用 `bun install` 装依赖、`bun` 起脚本）。
- **payload 取字段**：JS 侧没有 schema，先判空或 `as any` 再取；
  `updateNewMessage` 的文本在 `message.content.text.text`。
