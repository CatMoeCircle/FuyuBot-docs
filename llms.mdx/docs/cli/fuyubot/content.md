# fuyubot 命令参考 (/docs/cli/fuyubot)

跑框架的那个 CLI。它就是运行时包里的 `fuyubot(.exe)`（从源码跑时是 `target/{debug,release}/fuyubot`）。

```text
fuyubot <COMMAND>

Commands:
  init    初始化一个 fuyubot 项目（生成 fuyubot.toml 与插件目录）
  run     起框架、加载插件
  status  看这个目录上的实例在不在跑（读 .fuyubot/）
  stop    停掉这个目录上跑着的实例
  config  看配置：打印**生效值**（默认值 + 向上找到的那份文件）
  plugin  插件管理
```

## `init` [#init]

```text
fuyubot init [--dir <DIR>] [--name <NAME>] [--api-id <API_ID>]
```

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--dir` | `.` | 项目目录，生成 `<dir>/fuyubot.toml` 与 `<dir>/plugins/` |
| `--name` | `fuyubot` | 只影响配置里的 `name` |
| `--api-id` | `0` | TDLib api_id（不是秘密，可以写进配置）；`0` = 没配，`run` 会问 |

`init` **只写 `api_id`**：`api_hash` 这个命令连参数都不收（init 阶段手上不该有它）——`run` 首次会问，问完写回配置。
重复 `init` 会被挡住（不覆盖你改过的配置）。

```text
$ fuyubot init --dir demo --name mybot --api-id 12345
已生成 demo\fuyubot.toml
插件目录：demo\plugins
下一步：fuyubot-sdk init demo --lang rust（插件脚手架由开发 CLI 生成）
```

## `run` [#run]

```text
fuyubot run [--config <CONFIG>] [--plugin-dir <PLUGIN_DIR>] [--no-tdlib]
            [--no-login] [--background] [--replay <REPLAY>] [--replay-wait <MS>]
```

| 参数 | 作用 |
| --- | --- |
| `--config` | 配置文件，默认 `fuyubot.toml`（缺这个文件时 `run` 会按模板自动生成一份） |
| `--plugin-dir` | 覆盖 `[plugins].dir` |
| `--no-tdlib` | 不接 TDLib，只加载插件 |
| `--no-login` | 接 TDLib 但不走登录流程（已有 session 照样能用；CI / 容器用） |
| `--background` | 派生无终端的子进程，stdout/stderr 进 `logs/fuyubot.log`，父进程等状态发布后返回 |
| `--replay <文件>` | 把一批更新 JSON 灌进管线后退出：**不接 TDLib、不用账号** |
| `--replay-wait <MS>` | 回放后等插件的静默窗口；不填按插件形态自选（脚本插件 2000，原生 150） |

`run` 不带 `--replay` 的顺序：自动 init → 拿单实例锁 → 问/读凭据 → attach TDLib → 加载全部插件 →
发 `setTdlibParameters` 并登录 → `getMe` 打印账户 → 发布状态 → 才开始分发。
**登录这一步没有真账号端到端验过**，要立刻验插件就用 `--replay`。

```powershell
.\fuyubot.exe run --config demo\fuyubot.toml                 # 前台，可交互登录
.\fuyubot.exe run --config demo\fuyubot.toml --background    # 日志进 demo\logs\fuyubot.log
.\fuyubot.exe run --replay ping.json --plugin-dir demo\plugins
```

后台运行**没有 stdin**：没有 session 又没有 `TG_BOT_TOKEN` 时会直接失败并把日志尾巴打出来——
先用前台登录一次（session 落在 `data/`）。

## `status` / `stop` [#status--stop]

```powershell
.\fuyubot.exe status --config demo\fuyubot.toml
.\fuyubot.exe stop   --config demo\fuyubot.toml
```

```text
demo：运行中
  pid        64852
  已运行     0 秒
  版本       0.1.0
  名字       mybot
  插件       1 个
  日志       demo\logs\fuyubot.log
```

`status` 只读 `<项目根>/.fuyubot/`，三态：运行中 / 启动中 / 没有运行中的实例（顺带报「上次」的 pid）。
`stop` 是**优雅**的：写 `.fuyubot/stop` 请实例自己收摊（停接收循环 → 卸载插件 → 停内核 → 放锁），
8 秒不理会才硬杀。

```text
已停止 mybot（pid 64852，优雅退出：插件 stop 与内核都已收摊）
```

## `config` [#config]

```text
fuyubot config [--config <CONFIG>]
```

打印**生效值**：默认值填好之后每一项到底是什么，外加「向上找到的那份 `fuyubot.toml`」。
不加载插件、不接 TDLib、不建任何东西。

```text
$ fuyubot config --config demo\fuyubot.toml
配置文件  demo\fuyubot.toml
项目根    demo
[bot]       name         = mybot
[telegram]  account_type = bot
[telegram]  api_id       = 12345
[telegram]  api_hash     = 已保存在本文件（不回显）
[telegram]  data_dir     = demo\data
[plugins]   dir          = demo\plugins
[plugins]   log_level    = info（默认）
[tdlib]     path         = 自动（TDLIB_TDJSON_PATH → 自带 → exe 同级 → 系统库 → 裸库名）
[tdlib]     log_verbosity= 1
凭据        Bot Token / 手机号 / 密码不落盘（TG_BOT_TOKEN 或交互输入）
[plugin.fuyubot.manage] = { reply_prefix = "已安装插件：" }
```

- 文件不存在时第一行会写「（不存在，下面全是默认值）」——`run` 就是这样起的，不骗人。
- `account_type` 写错**不会**静默当 bot：那一行直接是 `⚠️ [telegram].account_type = "robot" 认不出来，只能写 "bot" 或 "user"`。
- 每个 `[plugin.<插件名>]` 段各占一行（插件名是点分的，所以显示成 `[plugin.fuyubot.manage]`）；没有插件段时写「无（没有 `[plugin.*]` 段）」。
- 没有 `get` / `set` / `path`：改配置用编辑器更直接，路径 `status` 第一行已经打了。**插件**读写配置走 ABI 的 `get_config` / `set_config`（见[插件 ABI](../plugin/abi.mdx)），不是这个子命令。

## `plugin` [#plugin]

| 命令 | 作用 |
| --- | --- |
| `fuyubot plugin list [--config …] [--plugin-dir <目录>]` | 列出插件；脚本插件会**展平到每个脚本** |
| `fuyubot plugin install <文件或目录> [--config …] [--plugin-dir <目录>]` | 装一个插件：传**目录**是脚本插件，传**文件**是原生插件 |
| `fuyubot plugin uninstall <名字> [--config …] [--plugin-dir <目录>]` | 卸载：脚本插件按**目录名**，原生插件按动态库名 |

```text
$ fuyubot plugin install ./my-plugin
已安装 plugins\scripts\my-plugin

$ fuyubot plugin list
fuyubot.js-host  ABI 4  plugins\fuyubot_js_host.dll
fuyubot.python-host  ABI 4  plugins\fuyubot_python_host.dll
脚本插件（1 个，由中间插件托管）：
  mybot.my-plugin  python  plugins\scripts\my-plugin\main.py

$ fuyubot plugin uninstall my-plugin
已卸载 plugins\scripts\my-plugin
```

- **脚本插件**（推荐，见 [脚本插件](../plugin/scripts.mdx)）：传的是**整个目录**
  （里面有 `pyproject.toml` / `package.json` 身份段），装到 `plugins/scripts/<目录名>/`。
  目标已存在会报错，要覆盖先 `uninstall` 再 `install`。
- **原生插件**：传编好的 `.dll` / `.so` / `.dylib`，或**工程目录**（去
  `<工程>/target/{release,debug}` 找产物）。产物连同旁边 / 工程根的 `.py` / `.js` /
  `.ts` / `.pyi` 同伴脚本一起拷进插件目录。workspace 成员的产物默认落在仓库根
  `target/` 下，这种情况加 `--target-dir` 或直接指着产物装。
- `list` 会**真的加载一次**动态库才知道名字，但**只发现不启动**脚本——不装依赖、
  不起进程，随时可以跑。脚本的名字取自 manifest（`name` 字段），路径是入口文件。
- `uninstall` 对**跑着的实例也安全**：文件删掉后目录 watch 会自动卸载对应脚本，
  不需要先 `stop`。

## 相关页面 [#相关页面]

- 脚本插件上手：[脚本插件](../plugin/scripts.mdx)
- 配置字段：[配置文件](../usage/config.mdx)
- 实例与后台运行：[运行与实例管理](../usage/run.mdx)
- 回放的输出与等待窗口：[离线回放](../usage/replay.mdx)
