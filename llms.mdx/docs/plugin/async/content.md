# 异步等待（await） (/docs/plugin/async)

`wait_for_update` 是**阻塞**原语：调用线程停下来等。要 `async/await` 那种语义，
用下面这层**不阻塞**的封装——任务挂起，事件到了再唤醒。

<Callout type="info">
  本页只讲原生插件。脚本插件（Python / JS / TS）的 `invoke_async` / `wait_async` /
  `runAsync` 在[脚本插件](../script/index.mdx)板块。
</Callout>

## Rust：`ResponseRouter` [#rustresponserouter]

`fuyubot-abi` 重导出 `ResponseRouter` / `ResponseFuture` / `UpdateFuture`：

```rust
use fuyubot_abi::ResponseRouter;
use serde_json::json;
use std::time::Duration;

// 插件 start 里建一次，活到 stop
let router = ResponseRouter::new(self.host)?;

// 等一条请求自己的响应
let (_id, fut) = router.invoke_simplified("getMe", "{}")?;
let me = tokio::time::timeout(Duration::from_secs(5), fut).await??;

// 等一条任意更新（async 版 wait_for_update）
let fut = router.wait_for_update(json!({"@type": "updateNewMessage"}))?;
let update = tokio::time::timeout(Duration::from_secs(30), fut).await??;
```

要点：

- **必须在插件自己的 executor 上 await**，别在宿主事件回调里 await（那是接收线程）。
- `router.invoke*` 从插件自己的线程发请求时会用 scope service 把归属切回插件，
  响应不会丢；不需要手动 `scope_enter`。
- 取消 = `drop(fut)`；关闭 = drop router（所有 pending 立刻 `RouterClosed`）。
- 超时不内建，用 `tokio::time::timeout` 或你运行时的等价物。

## 哪些语言有 await [#哪些语言有-await]

| 语言 | 怎么写 |
| --- | --- |
| Rust | 本页的 `ResponseRouter`（要有自己的 executor） |
| C / C++ / Go | 没有 await：`on` 回调 + 状态机，或者用语言自己的协程包装同步等待 |
| Python / JS / TS | 不在这个板块——脚本侧见 [Python](../script/python.mdx) / [JS 与 TypeScript](../script/js-ts.mdx) |

## 工具结果 [#工具结果]

工具调用没有「等响应」这一层：ABI v4 的 `call_tool_result` / `callTool` 是**同步**返回结果的。
详见 [工具与中间件](./tools.mdx)。
