# 配置文件 (/docs/usage/config)

`fuyubot run` 读 `fuyubot.toml`，**所有键都有默认值**。缺这个文件时 `run` 会按模板自动生成一份（等价于先跑一次 `fuyubot init`）——`--replay` 是例外，它不会为了回放在你的目录里留配置。

> `run --tui` 的**配置页**可以直接改核心项：`↑↓` 选中、`Enter` / `e` 编辑，写回时保留注释与 CRLF。
> 运行中改完需重启实例；`api_hash`、Bot Token / 手机号 / 密码和 `[plugin.*]` 段只读。

一个项目目录长这样：

```text
demo/
  fuyubot.toml        ← 配置（你写的；运行时不会被插件改写）
  plugins/            ← [plugins].dir，run 从这里加载插件
  plugins/scripts/    ← 脚本插件住这里（fuyubot plugin install 的落点）
  data/               ← [telegram].data_dir，TDLib 的 database 与 files 都指它
  plugin-config/      ← 插件自己记的配置（set_config 写的，删掉 = 让插件忘掉）
  logs/fuyubot.log    ← --background 的日志
  .fuyubot/           ← 实例状态（lock / status / stop），别手工编辑
```

## 字段 [#字段]

| 键 | 默认值 | 它决定什么 |
| --- | --- | --- |
| `[bot].name` | `fuyubot` | 显示名（启动那行、`status` 里的「名字」） |
| `[bot].api_id` | `0` | **旧位置**；`[telegram].api_id` 优先。新配置写进 `[telegram]` |
| `[telegram].account_type` | `bot` | 登录走哪条路：`bot` → Bot Token；`user` → 手机号 / 扫码。**写错报错**，不会静默当 bot |
| `[telegram].api_id` | `0` | TDLib api_id（到 [my.telegram.org](https://my.telegram.org) 申请）。不是秘密；`0` = 没配，`run` 会问 |
| `[telegram].data_dir` | `data` | TDLib 的数据目录：database 与 files **都**指它。相对项目根 |
| `[plugins].dir` | `plugins` | `run` 从这里加载插件（动态库 + `scripts/` 下的脚本插件）；`--plugin-dir` 覆盖它 |
| `[plugins].log_level` | `info` | 插件日志的最低级别：error / warn / info / debug / trace。排查插件时调成 `"debug"`；**写错级别名会报错**。运行中也可以在 `run --tui` 的日志页按 `Tab` 聚焦工作区后按 `l` 临时调整（只对本次运行生效） |
| `[tdlib].path` | 空 | 留空 = 按四级优先级自动找 tdjson；指定时给 tdjson 的**目录**或文件路径 |
| `[tdlib].log_verbosity` | `1` | TDLib 日志详细度。TDLib 自己的默认更啰嗦（每轮 `td_receive` 的超时都打到 stderr）；负数按 0 处理 |
| `[plugin.<插件名>]` | 无 | 插件自己的配置段（见下） |

## 插件自己的配置段 [#插件自己的配置段]

每个插件在 `[plugin.<插件名>]` 下可以有自己的配置，键值任意、可嵌套。插件名是点分的
（`define_plugin!` / 脚手架里登记的那个名字，如 `fuyubot.manage`），所以在 TOML 里自然写成
嵌套表——`[plugin.fuyubot.manage]` 就代表插件 `fuyubot.manage` 那段：

```toml
[plugin.fuyubot.manage]
reply_prefix = "已安装插件："

[plugin.my.weather]
city = "上海"
```

### 三层：包默认 / 运行时落盘 / 你写的 [#三层包默认--运行时落盘--你写的]

插件读到的配置是三层叠出来的，**后面的只填前面的缺失键**：

| 层 | 在哪 | 谁写 |
| --- | --- | --- |
| 包默认 | 插件包里的 `config.default.toml`（`plugin.json` 的 `config` 指向它） | 插件作者，随包升级 |
| 运行时落盘 | `<项目根>/plugin-config/<插件名>.toml` | 插件 `set_config` |
| 用户配置 | `fuyubot.toml` 的 `[plugin.<名>]` | **你** |

也就是说：**你在 `fuyubot.toml` 里写了的键，优先级最高**，插件改不动它（`set_config`
会直接返回错误，而不是「这次改成功、下次启动又被你盖回去」）。想让插件自己管某个键，
就别在 `fuyubot.toml` 里写它。

### 读写 [#读写]

插件在**运行时**读它、写它，走的是 ABI 接口（不是 `plugin_start` 的那个 `config_json`）：

- **读**：`get_config(section, key)` —— 读任意段（自己的 + 别人的）。`section` 空串读顶层
  （`[bot]` / `[telegram]` 等），`key` 空串读整段，`key` 是点路径（`nested.k`）。
- **写**：`set_config(key, value_json)` —— **只能写自己名下的段**（没有 section 参数，宿主按调用者身份判定，插件无法伪造）。成功 = 写内存 + 落盘到 `plugin-config/<插件名>.toml`；宿主这次启动没有配置文件、或这个键被用户配置钉住时**直接报错**。

`fuyubot.toml` **运行时永远不会被插件改写**：你手写的注释、顺序、`api_hash` 都不会被卷走。

各语言的写法：[Rust 插件](../plugin/rust.mdx)、[C / C++ 插件](../plugin/native.mdx)，
函数签名在[插件 ABI](../plugin/abi.mdx)。**脚本插件的薄 SDK 目前还没有读写配置的接口**——
脚本要参数只能写在脚本目录里（跟着目录一起装），配置段暂时读不到。

<Callout type="info">
  `plugin-config/<插件名>.toml` 是**插件自己的记忆**：文件内容就是那一段配置本身（不带
  `[plugin.x]` 头），插件名里的特殊字符按 `%XX` 编码。删掉这个文件 = 让插件忘掉它自己存过的东西
  （包默认和 `fuyubot.toml` 不受影响）。写入是先写 `.toml.tmp` 再 `rename`，掉电不会留半截文件。
</Callout>

<Callout type="warn">
  **从旧版本升级**：以前插件把状态直接写进 `fuyubot.toml` 的 `[plugin.<名>]`。升级后那些键算
  「用户配置」，优先级最高——插件再写它们会被拒绝。把想交还给插件管的键从 `fuyubot.toml`
  删掉即可（值会转到 `plugin-config/` 那一层继续用）。
</Callout>

模板（`fuyubot init` 生成的就是它）：

```toml
[bot]
name = "mybot"

[telegram]
account_type = "bot"
api_id = 12345
data_dir = "data"
api_hash = ""      # run 首次问过之后会把明文写回这里（见下）

[plugins]
dir = "plugins"
log_level = "info"   # 排查插件时调成 "debug" / "trace"

[tdlib]
path = ""          # 留空 = 按加载优先级自动找 tdjson
log_verbosity = 1
```

<Callout type="warn">
  **凭据的边界**：`api_id` 与 `api_hash` 是**例外**——它们**每次冷启动**都要随 `setTdlibParameters` 发给 TDLib（session 还有效也一样），不记住就得每次手输，所以 `fuyubot run` 交互式问过之后会把它们**明文写回** `[telegram]` 段。这意味着这份文件从此带着你的应用密钥：**别提交进版本库、别整份发给别人**。不想落盘就设 `TG_API_ID` / `TG_API_HASH`（环境变量优先，且不会被写回）。Bot Token、手机号、验证码、两步验证密码仍然**一律不落盘**，只认环境变量或交互输入（连日志也不许出现）。session 由 TDLib 自己落在 `data_dir`，配置里不记任何登录态。
</Callout>

## 几条约定 [#几条约定]

- **相对路径相对配置文件所在目录**（也就是项目根）：`plugins`、`data`、日志目录都按它解析。
  插件也吃这一条：`fuyubot run` 在加载插件之前会把**进程工作目录切到项目根**，所以插件配置里的相对路径（如 `cache` / `Cache`）和插件起的子进程，都落在 `fuyubot.toml` 旁边，而不是「你在哪个目录敲的命令」。
- **自动 init 只认默认文件名**：缺 `fuyubot.toml` 时 `run` 会生成一份；但用 `--config 别的名字` 时不会凭空造，直接报错。
- `status` / `stop` **不替你造配置**：找不到 `fuyubot.toml` 就报「先 `fuyubot init` 建一个」——面对的是已经存在的实例，凭空建一个只会更迷惑。
- `--plugin-dir` 覆盖 `[plugins].dir`，`--config` 换配置文件本身。
- 想知道**某一行到底生效成了什么**（含默认值）：`fuyubot config` 直接打出来，见 [`fuyubot` 命令参考](../cli/fuyubot.mdx)。
- 字段读出来后，运行参数（凭据来源、加载顺序）见 [运行与实例管理](./run.mdx)；`account_type` 之外没有别的自定义登录入口。

## 改了配置怎么生效 [#改了配置怎么生效]

配置在 `run` 启动时读一次。改完要重启实例：

```powershell
.\fuyubot.exe stop   --config demo\fuyubot.toml
.\fuyubot.exe run    --config demo\fuyubot.toml --background
```

`--replay` 不占单实例锁，所以它可以和跑着的实例并存、跑完就退，适合改插件期间反复试。

改完先别急着重启：`fuyubot config --config demo\fuyubot.toml` 会打印生效值，`account_type` 之类写错时当场就能看出来（那一行是 `⚠️` 开头，而 `run` 要走到登录才报）。
