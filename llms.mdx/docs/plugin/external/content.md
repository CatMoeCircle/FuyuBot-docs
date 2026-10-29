# 外部仓库插件 (/docs/plugin/external)

内置插件（`/start`、`/help`、`/plugins`）跟着发布包走，**第三方插件不必**：
它们自己一个仓库、`cargo build` 出一个 cdylib，用 `fuyubot plugin install` 装进项目。

形态和[内置插件](./rust.mdx)完全一样（同一个 `define_plugin!`、同一张 `HostApiVTable`），
差别只在三件事：**依赖怎么接**、**插件目录在哪**、**运行时库能不能从 crates.io 拿**。

## 依赖：只能走 path [#依赖只能走-path]

运行时仓库只往 crates.io 发两个 crate：`fuyubot-abi` 和 `fuyubot-tdlib-sys`。
**`fuyubot-simplify` 是 `publish = false`**——它不在 crates.io 上。

```toml
[workspace.dependencies]
fuyubot-abi      = { path = "<你的 Fuyu-Bot 检出>/crates/fuyubot-abi" }
fuyubot-simplify = { path = "<你的 Fuyu-Bot 检出>/crates/fuyubot-simplify" }
```

把它写成 `fuyubot-simplify = "0.1"` 会**编不过**（crates.io 上没有这个版本）。
等它发版之后换成一行版本号就行。

<Callout type="info">
  `fuyubot-simplify` 在这里只当「人话参数 → TDLib 请求体」的构造器库用：
  `SendMessageParams` / `Media` / `Text` / `send_params` / `album_params` / `edit_*_params`。
  「发出去并等结局」那一步走 [ABI v5 的 op JSON 分发](./abi.mdx)——
  和 Python / JS / Go 插件同一条路。
</Callout>

## 插件目录：别自己算 [#插件目录别自己算]

插件是宿主进程 `dlopen` 出来的动态库，`std::env::current_exe()` 拿到的是 **`fuyubot.exe`**，
不是插件自己的目录——插件算不出自己旁边有什么文件。

要读同目录的静态资源（cookie、词表、模板），让宿主告诉你：
`plugin_start` 的 `config_json` 里带着 `plugins_dir`（绝对路径）。

```rust
fn start(&mut self, config_json: &str) -> Result<(), String> {
    let plugins_dir: std::path::PathBuf =
        serde_json::from_str::<serde_json::Value>(config_json)
            .ok()
            .and_then(|c| c.get("plugins_dir")?.as_str().map(PathBuf::from))
            .unwrap_or_else(|| PathBuf::from("plugins"));
    // plugins_dir/douyin/cookies.json …
    Ok(())
}
```

内置 `manage` 插件就是这么写的，可以照抄。

## 线程：回调里不能做慢事 [#线程回调里不能做慢事]

`updateNewMessage` 的回调跑在**宿主的接收循环线程**上。解析网页、调外部 API、
等 TDLib 应答——任何一件在这里同步做，都会把整个宿主堵死（同进程所有插件一起卡）。

```rust
// ✅ 回调里 spawn，重活挪到工作线程
let handle = std::thread::spawn(move || {
    let info = blocking_parse(&link);          // 阻塞没关系：这是新线程
    if let Err(e) = send(host, &info) { /* … */ }
});
```

⚠️ 那个 `JoinHandle` **必须存进插件状态并在 `stop()` 里 join 掉**：
宿主卸载动态库之后，线程还在跑库里的代码就是**未定义行为**。

```rust
fn stop(&mut self) {
    self.subscription = None;                 // 守卫 drop 就退订
    let mut working = self.working.lock().unwrap_or_else(|e| e.into_inner());
    for handle in working.drain(..) {
        let _ = handle.join();
    }
}
```

## 装与验 [#装与验]

```bash
cargo build --release
fuyubot plugin install target/release/my_plugin.dll

# 不用账号也能验：plugin list 会真 dlopen 它，把 ABI 版本与 manifest 版本打出来
fuyubot plugin list --plugin-dir plugins
fuyubot run --replay replay.json --plugin-dir plugins --replay-wait 3000
```

`--replay-wait` 给插件的静默窗口：要发慢速网络请求时调大，否则进程可能在请求发出前就退了
（默认原生插件只有 150 ms）。见 [离线回放](../usage/replay.mdx)。

## 一个真实例子 [#一个真实例子]

[FuyuBot-Douyin](https://github.com/CatMoeCircle/FuyuBot-Douyin)——抖音解析插件，
`/dy <链接>` + 消息里自动识别抖音链接。它演示了本文全部三件事：
path 依赖、靠 `plugins_dir` 读 cookie、回调里 spawn 工作线程。

同类做法另见 `XQAnimeBot-Rust`（把 MongoDB / qBittorrent / ffmpeg 各自拆成一个插件，
业务插件按服务名取用）。

## 下一步 [#下一步]

<Cards>
  <Card title="Rust 插件" href="/docs/plugin/rust/" />
  <Card title="ABI 契约" href="/docs/plugin/abi/" />
  <Card title="离线回放" href="/docs/usage/replay/" />
</Cards>
