# JS 与 TypeScript 插件 (/docs/script/js-ts)

JS / TS 脚本插件同样是一个目录：`package.json` 写身份，`index.ts` 写逻辑，
`fuyubot` 是从 npm 装的薄 SDK。宿主插件与安装流程见 [脚本插件](./index.mdx)。

```text
weather/
  package.json     ← "fuyubot": { name, entry }
  index.ts         ← 你写的逻辑
  bun.lock         ← bun install 生成
  node_modules/    ← 依赖，不进版本库
```

要求 **bun ≥ 1.3.1**（SDK 用的是 `bun:ffi`，旧版本的 `cstring` 参数行为不一样）。
TS 不需要额外配置，bun 直接跑 `.ts`。

```bash
bun add fuyubot
bun install        # 机器人启动时也会跑这一步
```

## 方法一览 [#方法一览]

| 方法 | 干什么 |
| --- | --- |
| `on(event, handler, filter?)` | 订阅一条事件；返回回调对象，可交给 `off` |
| `off(callback)` | 退订 `on` 返回的那个对象 |
| `invoke(method, params?, onResponse?)` | 发一条 TDLib 请求；给了回调就按请求配对 |
| `invokeAsync(method, params?)` | `invoke` 的 Promise 版，只能在 `runAsync` 里用 |
| `waitAsync(filter?, timeoutMs?)` | 等一条匹配的更新；超时/取消返回 `null` |
| `emit(event, payload?)` | 发一条自定义事件（自己 + 全局订阅者收得到） |
| `log(message, level?)` | 打日志；level：`error` / `warn` / `info` / `debug` / `trace` |
| `registerTool(name, description?, inputSchema?)` | 登记工具的**元数据**（没有执行回调） |
| `useMiddleware(stage, handler)` | 挂中间件，`handler(stage, payload)`，`stage` 是 0..5 |
| `run()` | 发 `ready` 握手，然后阻塞收事件——**最后一行** |
| `runAsync(main?)` | Promise 版：原生桥在后台读 stdin，JS 事件循环继续跑 |

和 Python 一样的两条：**不是装饰器**（`on` 是个普通函数）、**`run()` / `runAsync()`
都阻塞到进程结束**，写在文件最后。

## 事件 [#事件]

事件名就是 TDLib 更新的 `@type`，另外每条更新还会落到兜底的 `"update"` 通道。
自己 `emit()` 的事件只送自己 + 全局订阅者。

```ts
import { on, log, run } from "fuyubot";

on("updateNewMessage", (u) => log(`新消息 ${u.message.id}`));
on("update", (u) => log(`来了一条更新：${u["@type"]}`));
run();
```

过滤器是「点分路径 = 期望值」，所有条件都相等才触发：

```ts
on("updateNewMessage", handler, { "message.chat_id": -1001234567890 });
on("updateNewMessage", onHello, { "message.content.text.text": "/hello" });
```

## 写 TDLib 参数：`_` 就是 `@type` [#写-tdlib-参数_-就是-type]

TDLib 的每个对象都要带判别字段 `@type`，写起来啰嗦。JS / TS 的 SDK 允许你写 `_`，
发送前会**递归**换成 `@type`（`vector<T>` 里的对象也一样）；两个都写时以 `@type` 为准。

```ts
invoke("sendMessage", {
  chat_id,
  input_message_content: {
    _: "inputMessageText",
    text: { _: "formattedText", text: "你好", entities: [] },
  },
});
```

这层规整只在 JS / TS 侧有，Python 侧要老老实实写 `"@type"`。

## 调 TDLib [#调-tdlib]

```ts
invoke("sendMessage", {
  chat_id,
  input_message_content: {
    _: "inputMessageText",
    text: { _: "formattedText", text: "收到", entities: [] },
  },
}, (resp) => log(`发送结果：${resp["@type"]}`));
```

`invoke` 不阻塞、立刻返回；请求号由 SDK 配对。方法名与字段以 TDLib 为准（不是 Bot API），
发送一律是 `sendMessage` + `input_message_content`。

## 异步：`runAsync` / `invokeAsync` / `waitAsync` [#异步runasync--invokeasync--waitasync]

```ts
import { invokeAsync, log, runAsync, waitAsync } from "fuyubot";

async function main() {
  const me = await invokeAsync("getMe", {});
  log(`我是 ${me.first_name ?? "?"}`);

  const update = await waitAsync({ "@type": "updateNewMessage" }, 30_000);
  if (update === null) {
    log("30 秒内没有新消息");
  } else {
    log(`等到了 ${update.message.id}`);
  }
}

await runAsync(main);
```

- `runAsync` 在后台线程读 stdin，但**回调在主线程的 `step()` 循环里分发**
  （bun 的 JSCallback 不能跨线程调）；`main` 与 step 循环并行跑，直到宿主关掉管道。
- `invokeAsync` 的 **TDLib 业务错误也会 resolve**（返回 `@type: "error"` 的对象），
  只有宿主拒绝请求才 reject。
- `waitAsync` 是一次性订阅：命中或超时后自动退订；`timeoutMs=0` 表示一直等。
- 不用 `main` 也行：`await runAsync()` 只跑事件循环，`on` 回调里自己起异步任务。

## 日志、工具与中间件 [#日志工具与中间件]

```ts
import { log, registerTool, useMiddleware } from "fuyubot";

log("普通信息");
log("要坏事了", "warn");

// 只登记元数据：宿主知道有这个工具，但调用不会路由回脚本
registerTool("weather.now", "查天气", {
  type: "object",
  properties: { city: { type: "string" } },
  required: ["city"],
});

useMiddleware(2, (stage, payload) => log(`阶段 ${stage} 看到一条更新`));
```

中间件的六阶段与原生插件一致，见 [工具与中间件](../plugin/tools.mdx)。

## 完整示例 [#完整示例]

**回声机器人**：

```ts
import { invoke, on, run } from "fuyubot";

on("updateNewMessage", (update) => {
  const message = update.message ?? {};
  if (message.is_outgoing) return;              // 别回自己发的，否则自激
  const text = message.content?.text?.text ?? "";
  if (!text) return;

  invoke("sendMessage", {
    chat_id: message.chat_id,
    input_message_content: {
      _: "inputMessageText",
      text: { _: "formattedText", text, entities: [] },
    },
  });
});

run();
```

**命令处理器**：

```ts
import { invoke, on, run } from "fuyubot";

function reply(chatId: number, text: string) {
  invoke("sendMessage", {
    chat_id: chatId,
    input_message_content: {
      _: "inputMessageText",
      text: { _: "formattedText", text, entities: [] },
    },
  });
}

on("updateNewMessage", (u) => reply(u.message.chat_id, "你好！"),
   { "message.content.text.text": "/hello" });
on("updateNewMessage", (u) => reply(u.message.chat_id, "pong"),
   { "message.content.text.text": "/ping" });

run();
```

## 现在还没有的能力 [#现在还没有的能力]

薄 SDK 只覆盖「收事件、发请求、打日志、登记工具、挂中间件」。下面这些宿主的 ABI
有、但 JS / TS 侧**还没暴露**：

- 读写 `[plugin.<名字>]` 配置段
- 调用其它插件注册的工具 / 共享服务
- `simplify` 操作表（发消息等结局、Markdown → entities 之类）

原生插件不受这个限制，见 [插件 ABI](../plugin/abi.mdx)。

## 常见问题 [#常见问题]

- **`Cannot find package 'fuyubot'`**：依赖没装进脚本目录。`bun add fuyubot`，
  再重启机器人（或先手动 `bun install`）。
- **`bun:ffi` 报错 / 回调收不到**：先确认 bun ≥ 1.3.1；再确认 `FUYUBOT_NATIVE_LIB`
  指到了 `plugins/fuyubot.script/` 里的那份 dll（宿主起脚本时会自动设）。
- **自检**：`bun node_modules/fuyubot/fuyubot.ts` 只验证 API 形状、不碰宿主，
  输出 `fuyubot: self-test ok`；它仍要能加载原生桥（宿主起脚本时会设 `FUYUBOT_NATIVE_LIB`，
  手动跑就自己指到 `fuyubot_script` 那份 dll）。
- **类型**：`fuyubot` 自带 `fuyubot.d.ts`，不需要手写声明；TDLib 负载是 `any`，
  `update.message` 之类记得判空。
