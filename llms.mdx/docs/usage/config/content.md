# 配置文件 (/docs/usage/config)

`fuyubot run` 读 `fuyubot.toml`，**所有键都有默认值**。缺这个文件时 `run` 会按模板自动生成一份（等价于先跑一次 `fuyubot init`）——`--replay` 是例外，它不会为了回放在你的目录里留配置。

一个项目目录长这样：

```text
demo/
  fuyubot.toml        ← 配置
  plugins/            ← [plugins].dir，run 从这里加载插件
  plugins/scripts/    ← 脚本插件住这里（fuyubot plugin install 的落点）
  data/               ← [telegram].data_dir，TDLib 的 database 与 files 都指它
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
| `[plugins].log_level` | `info` | 插件日志的最低级别：error / warn / info / debug / trace。排查插件时调成 `"debug"`；**写错级别名会报错** |
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
api_key = "……"      # 密钥这类东西别写进全局配置——它会被 `set_config` 回写、也会随仓库走
```

插件在**运行时**读它、写它，走的是 ABI 接口（不是 `plugin_start` 的那个 `config_json`）：

- **读**：`get_config(section, key)` —— 读任意段（自己的 + 别人的）。`section` 空串读顶层
  （`[bot]` / `[telegram]` 等），`key` 空串读整段，`key` 是点路径（`nested.k`）。
- **写**：`set_config(key, value_json)` —— **只能写自己名下的段**（没有 section 参数，宿主按调用者身份判定，插件无法伪造）。成功会写内存并回写 `fuyubot.toml`。

各语言的写法：[Rust 插件](../plugin/rust.mdx)、[C / C++ 插件](../plugin/native.mdx)、
[Python 插件](../plugin/python.mdx)、[JS / TS 插件](../plugin/js-ts.mdx)（每页都有「读 / 写配置」一节），
函数签名在[插件 ABI](../plugin/abi.mdx)。脚本插件读**自己**那段还有个同步入口
（`plugin_config()` / `pluginConfig()`），`run()` 之前就能用。

<Callout type="warn">
  **`set_config` 回写是「全量重写」**：`fuyubot.toml` 里你手写的注释、空白会被 `toml` 序列化丢掉。插件写配置属于程序化修改，这是简单且可预期的一步；要保注释就把插件要写的值也手工维护进文件、别让插件运行时去改。
</Callout>

模板（`fuyubot init` 生成的就是它）：

```toml
[bot]
name = "mybot"

[telegram]
account_type = "bot"
api_id = 12345
data_dir = "data"

[plugins]
dir = "plugins"
log_level = "info"   # 排查插件时调成 "debug" / "trace"

[tdlib]
path = ""          # 留空 = 按加载优先级自动找 tdjson
log_verbosity = 1
```

<Callout type="warn">
  **凭据一律不落盘**：`api_hash`、Bot Token、手机号、验证码、两步验证密码都不许写进配置文件（连日志也不行）。`api_hash` 在配置里**根本没有字段**，写了也会被 serde 忽略——它只认环境变量 `TG_API_HASH` 或 `fuyubot run` 的交互式输入。session 由 TDLib 自己落在 `data_dir`，配置里不记任何登录态。
</Callout>

## 几条约定 [#几条约定]

- **相对路径相对配置文件所在目录**（也就是项目根）：`plugins`、`data`、日志目录都按它解析。
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
