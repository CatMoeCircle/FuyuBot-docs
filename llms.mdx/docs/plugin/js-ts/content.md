# JS 与 TypeScript 插件 (/docs/plugin/js-ts)

JS / TS 插件就是一个目录：manifest（`package.json`）里写身份，入口文件写逻辑，
`fuyubot.ts`（单文件薄 SDK）负责和宿主通信。三步上手见 [脚本插件](./scripts.mdx)，本页是 API 参考。

```text
my-plugin/
  package.json   ← 身份（插件叫什么、入口在哪）
  index.ts       ← 你写的逻辑（.js 也行）
  fuyubot.ts     ← 薄 SDK（单文件，拷进来就行；另有 fuyubot.d.ts 类型声明）
```

运行时是 [bun](https://bun.sh)（`bun install` 装依赖、`bun` 起进程），**TS 不需要 `tsc`**。

## manifest：`package.json` [#manifestpackagejson]

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "type": "module",
  "fuyubot": { "name": "mybot.my-plugin", "entry": "index.ts" }
}
```

`entry` 不写就默认 `index.ts`。

## API [#api]

`fuyubot.ts` 随 [FuyuBot-SDK](https://github.com/CatMoeCircle/FuyuBot-SDK) 提供
（`crates/fuyubot-sdk-native/` 下），拷进插件目录即可 `import { … } from "./fuyubot"`。
它只是原生桥的一层封装，协议细节（握手、订阅号、JSON 管道）作者看不见。

| 函数 | 签名 | 说明 |
| --- | --- | --- |
| `on` | `on(event, handler, filter?)` | 订阅事件；同一个事件可订阅多次 |
| `invoke` | `invoke(method, params?, onResponse?)` | 发 TDLib 请求；给了 `onResponse` 就按 `request_id` 自动配对 |
| `emit` | `emit(event, payload?)` | 发自定义事件（**只送自己 + 全局订阅者**，不是广播） |
| `log` | `log(message, level = "info")` | `level`：`error` / `warn` / `info` / `debug` / `trace` |
| `registerTool` | `registerTool(name, description = "", inputSchema?)` | 只登记元数据 |
| `useMiddleware` | `useMiddleware(stage, handler)` | 挂中间件，`handler(stage, payload)` |
| `run` | `run()` | 握手并开始收事件。**永远放最后一行** |

`on` 的 `filter` 是点分路径的字段相等匹配，比如只听 `/hello`：

```ts
import { on, invoke, log, run } from "./fuyubot";

on("updateNewMessage", (update) => {
  log(`收到新消息 ${update.message.id}`);
});

on("updateNewMessage", () => log("有人说 /hello"),
  { "message.content.text.text": "/hello" });

run(); // 最后一行，永远如此
```

- `payload` 是解析好的对象，直接取字段；JS 侧没有 schema，取字段前可以先窄化（`typeof` / `as`）。
- `invoke` 的参数形状以 TDLib 为准（方法名 ≠ Bot API），见 [调用 TDLib](./tdlib.mdx)。
- **`run()` 必须是最后一行**：它发就绪握手并阻塞收事件，脚本提前退出 = 插件加载失败。

一个稍完整的例子——按聊天计数然后回一条：

```ts
import { on, invoke, run } from "./fuyubot";

const counts = new Map<number, number>();

on("updateNewMessage", (payload: any) => {
  const message = payload?.message;
  if (!message || message.is_outgoing === true) return;   // 别回自己发的，否则自激

  const text = message.content?.["@type"] === "messageText"
    ? message.content.text?.text : "";
  if (!text) return;

  const chatId: number = message.chat_id;
  const count = (counts.get(chatId) ?? 0) + 1;
  counts.set(chatId, count);

  invoke("sendMessage", {
    chat_id: chatId,
    input_message_content: {
      "@type": "inputMessageText",
      text: { "@type": "formattedText", text: `本聊天第 ${count} 条消息`, entities: [] },
    },
  });
});

run();
```

## 类型声明 [#类型声明]

`fuyubot.d.ts` 与 `fuyubot.ts` 同目录放着，`import { … } from "./fuyubot"` 时编辑器自动补全
（无 `tsc` 也有类型提示，看编辑器支不支持裸 TS）。

## 原生桥 [#原生桥]

薄 SDK 要加载原生桥（和托管插件是同一份库）。查找顺序：**脚本同目录 → 环境变量
`FUYUBOT_NATIVE_LIB` → 当前工作目录**；找不到会报「找不到 fuyubot 原生桥库」，
排法见 [脚本插件的常见问题](./scripts.mdx#常见问题)。

## 调试 [#调试]

```bash
bun fuyubot.ts     # 薄 SDK 自检：验证 API 形状（不碰宿主、不调 run）
# fuyubot: self-test ok
```

- 日志不够细就把 `[plugins].log_level` 调成 `"debug"`（见[配置文件](../usage/config.mdx)）。
- JS / TS 侧要装 [bun](https://bun.sh)；缺了的话脚本起不来，日志里有提示，不影响机器人本身。
