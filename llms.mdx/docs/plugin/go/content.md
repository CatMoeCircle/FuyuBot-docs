# Go 插件 (/docs/plugin/go)

Go 也能写插件：`go build -buildmode=c-shared` 出来的就是标准动态库，宿主只要看到七个导出符号
就认它。完整可跑的示例在 [`examples/go-ping`](https://github.com/CatMoeCircle/FuyuBot-SDK/tree/main/examples/go-ping)。

<Callout type="info">
  目前**没有** `fuyubot-sdk init --lang go` 模板——Go 这条路线是「自己搭工程」：
  抄 `examples/go-ping`，或者照下面这两段写。C 头文件仍然用
  `fuyubot-sdk codegen --lang c --dir <工程目录>` 生成，不要手抄。
</Callout>

## 结构：Go 写逻辑，C 写壳 [#结构go-写逻辑c-写壳]

| 文件 | 作用 |
| --- | --- |
| `main.go` | 逻辑：解析更新 JSON、拼 `sendMessage`、打日志 |
| `plugin.c` | 四个 ABI 符号：`plugin_init` / `plugin_start` / `plugin_stop` / `plugin_free_string` |
| `fuyubot_plugin.h` | 生成物（`codegen --lang c` 落的），**不提交** |

为什么不直接 `//export plugin_init`：`PluginHandle` 是**按值返回**的结构体，由 C 侧构造最稳；
也避免把宿主 VTable 的函数指针搬进 Go。C 侧只做转发：

```c
static int32_t on_update(void *user_data, const char *payload) {
    return (int32_t)go_on_update(user_data, (char *)payload);
}

FUYUBOT_EXPORT PluginHandle plugin_init(const HostApiVTable *host) {
    PluginHandle failed = {0, 0, NULL, NULL};
    if (host == NULL || host->version != ABI_VERSION) return failed;
    g_host = host;
    return (PluginHandle){ABI_VERSION, (uint32_t)sizeof(PluginHandle), &g_state,
                          "fuyubot.example.go-ping"};
}
```

Go 侧通过两个 C 小桥访问宿主（这样 Go 里不用碰函数指针）：

```go
//export go_on_update
func go_on_update(_ unsafe.Pointer, payload *C.char) C.int {
    var u update                      // updateNewMessage → message.content.text.text
    if json.Unmarshal([]byte(C.GoString(payload)), &u) != nil { return 0 }
    if u.Message.IsOutgoing || u.Message.Content.Text.Text != "/ping" { return 0 }
    // …拼 sendMessage（input_message_content!）→ C.fy_invoke("sendMessage", body)
    return 0
}
```

`fy_log` / `fy_invoke` 在 `plugin.c` 里实现，就是 `g_host->log` / `g_host->td_invoke_simplified` 的转发。

## 常用 ABI 怎么调：在 `plugin.c` 里加桥 [#常用-abi-怎么调在-pluginc-里加桥]

`examples/go-ping` 只带了两个桥（`fy_log` / `fy_invoke`）。要用别的 ABI 函数就照同样形状加——
**每个桥一行转发**，Go 侧不碰函数指针：

```c
/* plugin.c —— 想多用一个 ABI 函数，就照这个样子加一个桥 */
void fy_log(const char *message) { g_host->log(g_host->host_ctx, 3, message); }

long long fy_invoke(const char *method, const char *params) {
    return (long long)g_host->td_invoke_simplified(g_host->host_ctx, method, params).id;
}

void fy_emit(const char *event, const char *payload) {
    g_host->emit(g_host->host_ctx, event, payload);
}

/* 下面这几个返回的是**宿主线程局部缓冲**：Go 侧必须当场拷成字符串 */
const char *fy_execute(const char *request) { return g_host->td_execute(g_host->host_ctx, request); }
const char *fy_get_config(const char *section, const char *key) {
    return g_host->get_config(g_host->host_ctx, section, key);
}
const char *fy_call_tool(const char *name, const char *input) {
    return g_host->call_tool_result(g_host->host_ctx, name, input);
}
const char *fy_list_tools(void) { return g_host->list_tools(g_host->host_ctx); }

int fy_set_config(const char *key, const char *value) {
    return g_host->set_config(g_host->host_ctx, key, value);
}
void fy_register_tool_meta(const char *descriptor) {
    g_host->register_tool(g_host->host_ctx, descriptor, NULL, NULL);
}
/* 订阅留在 plugin_start 里（句柄要活着），不必给 Go 开口子 */
```

Go 侧声明 + 包一层：

```go
/*
#include <stdlib.h>
extern void fy_log(const char *message);
extern long long fy_invoke(const char *method, const char *params);
extern void fy_emit(const char *event, const char *payload);
extern const char *fy_execute(const char *request);
extern const char *fy_get_config(const char *section, const char *key);
extern int fy_set_config(const char *key, const char *value);
extern const char *fy_call_tool(const char *name, const char *input);
extern const char *fy_list_tools(void);
*/
import "C"
import "unsafe"

func log(msg string) {
    cmsg := C.CString(msg)
    defer C.free(unsafe.Pointer(cmsg))
    C.fy_log(cmsg)
}

// 发请求：只拿请求号，响应走 "response" 通道
func invoke(method string, params string) int64 {
    cm, cp := C.CString(method), C.CString(params)
    defer C.free(unsafe.Pointer(cm))
    defer C.free(unsafe.Pointer(cp))
    return int64(C.fy_invoke(cm, cp))
}

// 发自定义事件：自己 + 全局订阅者收得到
func emit(event string, payload string) {
    ce, cp := C.CString(event), C.CString(payload)
    defer C.free(unsafe.Pointer(ce))
    defer C.free(unsafe.Pointer(cp))
    C.fy_emit(ce, cp)
}

// 同步执行不碰网络的方法（parseTextEntities 之类）
func execute(request string) string {
    cr := C.CString(request)
    defer C.free(unsafe.Pointer(cr))
    // ⚠️ 返回的是宿主缓冲：C.GoString 当场拷走，别存那个指针
    return C.GoString(C.fy_execute(cr))
}

// 读任意配置段（找不到时空串）
func getConfig(section, key string) string {
    cs, ck := C.CString(section), C.CString(key)
    defer C.free(unsafe.Pointer(cs))
    defer C.free(unsafe.Pointer(ck))
    return C.GoString(C.fy_get_config(cs, ck))
}
```

三条 cgo 侧的硬规则：

- 传给 C 的字符串用 `C.CString` + `defer C.free`；漏了就是泄漏。
- 桥返回的 `const char *` 是**宿主缓冲**：`C.GoString` 立刻拷贝，**不要**把 `*C.char` 存下来，
  也**不要** free 它。
- 订阅句柄留在 C 侧（`plugin_start` 里 `g_host->on(...)` 存进静态变量），Go 侧不持有——
  drop 即退订，交到 Go 手里容易漏。

## 手写 `sendMessage`（或者用 `simplify_invoke`） [#手写-sendmessage或者用-simplify_invoke]

> ✅ **ABI v5 起，这一节只是「另一条路」，不再是唯一的路。** 宿主从 v5 开始自己跑
> 同一份 `fuyubot-simplify` 代码，经 `simplify_invoke` / `simplify_invoke_result` 暴露成一张
> **op 表**（`{"op":"send_message","args":{…}}`），所有语言都能用——发消息等结局、超时撤回、
> bot 与用户号挑不同反应方法、Markdown → entities、富消息本地块树，都不用手写。
> 见 [ABI › simplify 操作表](./abi.mdx#simplify-操作表)。
> ⚠️ 本语言的 SDK 薄封装还没跟上（SDK 仓库待更新）；在那之前可以直接调 VTable 上那两个函数，
> 或者照下面手写。


| 想要的效果 | 手写的关键字段 |
| --- | --- |
| 纯文本 | `input_message_content` = `inputMessageText`，`text` 是 `formattedText` |
| Markdown / HTML | 先 `fy_execute` 调 `parseTextEntities`（`version: 2` = MarkdownV2），把返回的 `formattedText` 塞进去 |
| 回复某条 | `reply_to` = `{"@type": "inputMessageReplyToMessage", "message_id": N}` |
| 发到话题 | `topic_id` = `{"@type": "messageTopicForum", "forum_topic_id": N}` |
| 内联按钮 | `reply_markup` = `replyMarkupInlineKeyboard`；callback 的 `data` 是 **base64** |
| 等到「真发出去」 | 请求号只到**临时消息**；要最终 `Message` 得再等 `updateMessageSendSucceeded` |

```go
func sendText(chatID int64, text string) int64 {
    body, _ := json.Marshal(map[string]any{
        "chat_id": chatID,
        "input_message_content": map[string]any{
            "@type": "inputMessageText",
            "text":  map[string]any{"@type": "formattedText", "text": text, "entities": []any{}},
        },
    })
    return invoke("sendMessage", string(body))
}
```

方法名拿不准就查：`fuyubot-sdk td-method sendMessage`。

## 编译 [#编译]

cgo 需要 C 编译器：Linux / macOS 用 `cc`，Windows 用 mingw-w64（如
[w64devkit](https://github.com/skeeto/w64devkit)）。

```powershell
fuyubot-sdk codegen --lang c --dir examples\go-ping   # 先落 ABI 头

$env:CGO_ENABLED = "1"
$env:CC = "gcc"                                       # Linux/macOS：cc
go build -buildmode=c-shared -o ping.dll .             # Linux: ping.so / macOS: ping.dylib
fuyubot plugin install ping.dll --plugin-dir demo\plugins
```

<Callout type="warn">
  Windows 上没装 mingw 时报 `gcc: executable file not found` 或
  `cannot open file 'mingwex.lib'`——那是缺 C 工具链，不是插件代码的问题。
  MSVC 的 `cl` 不能直接给 cgo 用（Go 的 Windows 外部链接器要 GCC 那一套）。
</Callout>

## 一个宿主行为要记住：Go 库不会被卸载 [#一个宿主行为要记住go-库不会被卸载]

Go 的 `c-shared` 运行时有线程与信号处理器，`FreeLibrary` / `dlclose` 之后进程会直接
access violation（`0xC0000005`）。

所以 `fuyubot-loader` 会识别 Go 产物（文件里的 `\xff Go buildinf:` 魔数），
**故意不卸载**这类库：`plugin_stop` 照跑、注册照回滚，只是那几 MB 库内存留到进程退出。
普通 Rust / C / C++ 插件不受影响，仍是 drop 即卸载。

这也意味着：**别在同一个进程里反复加载同一个 Go 插件**（热重载路径别指望它）。
先 `fuyubot stop` 再 `run`，行为是干净的。

## 验证 [#验证]

```powershell
fuyubot-sdk check ping.dll                                   # 静态读导出符号
fuyubot run --replay examples/replay/new_message.json --plugin-dir <插件目录>
```

回放输出里应能看到 `go-ping 插件：回了 pong` 和一条
`sendMessage {"chat_id":…,"input_message_content":{"@type":"inputMessageText",…}}`。

## 相关 [#相关]

- ABI 细节（2 个 u32 + `host_ctx` + 19 个函数指针、内存所有权、版本协商）：[ABI 契约](./abi.mdx)
- C / C++ 的写法（同一份头文件）：[C 与 C++ 插件](./native.mdx)
- 订阅与过滤器：[订阅与事件](./events.mdx)
