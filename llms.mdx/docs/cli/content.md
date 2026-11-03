# CLI 总览 (/docs/cli)

`fuyubot` 是运行时唯一的命令行程序：跑框架、管实例、装卸插件。它**不编译、也不打包插件**——
编译归插件作者自己的工具链（`cargo build`、`cl /LD`、`gcc -shared`）。

| CLI | 干什么 | 二进制 |
| --- | --- | --- |
| [`fuyubot`](./fuyubot.mdx) | 跑框架：`init` / `run` / `login` / `logout` / `status` / `stop` / `config` / `plugin` | `fuyubot(.exe)` |

它就在运行时发行包里（旁边带着 `tdjson` 和内置插件目录 `plugins/`）。从源码跑的等价写法是把子命令接在 `--` 之后：

```bash
cargo run -q -p fuyubot-cli -- run --replay examples/replay/new_message.json
```

## 共同约定 [#共同约定]

| 项 | 约定 |
| --- | --- |
| `--config <文件>` | 默认 `fuyubot.toml`；项目根 = 配置文件所在目录，`plugins/`、`data/`、`.fuyubot/` 都相对它 |
| `--plugin-dir <目录>` | 覆盖配置里的 `[plugins].dir` |
| 退出码 | `0` 成功；非零是失败 |
| 凭据 | **只走环境变量或交互式输入**，任何命令都不把它们写进文件（`TG_API_ID` / `TG_API_HASH` / `TG_BOT_TOKEN`） |
| 输出语言 | 中文；`status` / `stop` 是给人看的，不要拿去解析（没有 `--json`） |

## 命令速查 [#命令速查]

```text
fuyubot init [--dir .] [--name 名字] [--api-id N]      生成项目
fuyubot run  [--config …] [--plugin-dir …] [--api-id N] [--background] [--replay 文件]
fuyubot login | logout [--config …]                    只登录 / 清本地会话（logout 要 --yes）
fuyubot status | stop [--config …]                     实例状态 / 优雅停止
fuyubot config [--config …]                            打印生效配置（含默认值）
fuyubot plugin list | install <路径> | uninstall <名字> 插件目录管理
fuyubot plugin migrate [--dry-run]                     旧形态插件 → 插件包
```

<Cards>
  <Card title="fuyubot 命令参考" href="/docs/cli/fuyubot/" />
  <Card title="插件开发（怎么写插件）" href="/docs/plugin/" />
</Cards>
