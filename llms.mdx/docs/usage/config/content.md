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
| `[command].prefix` | bot `["/"]`<br/>user `["."]` | 命令头**数组**，可配多个（每项单个字符，不能是字母 / 数字 / 空白）。不写按账号默认：bot 认 `/`、user 认 `.`。写了就**整套替换**（bot 不再自动保留 `/`）。user 账户下 `/` 即使写进数组也始终不生效 |
| `[command].whitelist` | `[]` | 额外允许触发命令的用户 id（数字）。user 账户自己发的始终触发；bot 账户非空时只响应表里的用户。**主人 / 全局管理员不受它影响** |
| `[command].whitelist_only` | `true` | user 账户的**白名单模式**：只响应自己与 `whitelist` 里的用户。改成 `false` 可关，但 **⚠️ 不建议**——关掉后任何人都能触发插件；bot 不受它影响 |
| `[roles].owners` | `[]` | 主人用户 id。最高权限；列表为空时 user 账户默认自己是主人，配置后按列表来（可换成别人）。bot 账户必须显式配置。主人绕过 `[command].whitelist` |
| `[roles].admins` | `[]` | 全局管理员用户 id。能用 `admin` 级命令，但不能用 `owner` 级；群里的 Telegram 管理员**不**自动成为全局管理员 |
| `[cache].enabled` | `true` | 是否启用宿主 TDLib 对象缓存；关掉后 `Simplify` 直连 TDLib，连接状态判断仍保留 |
| `[cache].capacity` | `100` | **每种类型**（chat / user / basic_group / supergroup / chat_member / community / community_full_info）的条数上限，LRU 淘汰 |
| `[plugins].dir` | `plugins` | `run` 从这里加载插件（动态库 + `scripts/` 下的脚本插件）；`--plugin-dir` 覆盖它 |
| `[plugins].log_level` | `info` | 插件日志的最低级别：error / warn / info / debug / trace。排查插件时调成 `"debug"`；**写错级别名会报错**。运行中也可以在 `run --tui` 的日志页按 `Tab` 聚焦工作区后按 `l` 临时调整（只对本次运行生效） |
| `[tdlib].path` | 空 | 留空 = 按四级优先级自动找 tdjson；指定时给 tdjson 的**目录**或文件路径 |
| `[tdlib].log_verbosity` | `1` | TDLib 日志详细度。TDLib 自己的默认更啰嗦（每轮 `td_receive` 的超时都打到 stderr）；负数按 0 处理 |
| `[plugin.<插件名>]` | 无 | 插件自己的配置段（见下） |

## 命令头与白名单 [#命令头与白名单]

`[command].prefix` 是**数组**，可以配多个命令头：

```toml
[command]
prefix = [".", "!", "。"]   # 每项必须是单个字符（不能是字母 / 数字 / 空白）
```

不写时按账号类型取默认值：**bot 认 `/`**（`/start`、`/help`…），**user 认 `.`**（`.help`）。
配了就是**整套替换**——bot 不会额外保留 `/`，要用就把它写进数组；
而 user 账户下 `/xxx` **始终**不交给插件（Telegram 客户端占用 `/`），即使写进数组。
放行的非 `/` 命令头会被宿主归一化成 `/xxx`，插件拿到的仍然是 `/cmd`。
写错的那一项会告警并跳过；一个能用的都没有时回退到账号默认值。

**user 账户默认白名单模式**：只有账号自己发出的消息，或在 `[command].whitelist` 里的
用户 id，才能触发它的命令；别人发的命令一律不触发。

这个模式可以在配置里关掉：

```toml
[command]
whitelist_only = false   # ⚠️ 不建议：关掉后任何人都能触发插件
```

`whitelist_only = false` 之后，user 账户不再按 `whitelist` 过滤（自己发的仍然按“自己触发”
处理，回复走编辑）。**不建议关闭**：任何人发来的命令都会进插件，user 账户尤其容易被滥用。
bot 账户不受这个开关影响；`whitelist` 非空时 bot 仍只响应表里的用户。

**主人 / 全局管理员始终放行**：在 `[roles].owners` / `.admins` 里的人不受
`[command].whitelist` 或 `whitelist_only` 影响——即使不在白名单里、即使白名单模式开着，
他们发命令也能进插件。bot 账户额外排除自己的出站消息，这一条对主人也成立。

插件回复命令统一走 `Command::reply` / `Command::reply_then`（其它语言走
`fuyubot.host.command` service）：宿主决定发新消息还是编辑原命令消息——bot 账户 / user 账户里
白名单用户触发 → `sendMessage` + `reply_to`；user 账户**自己**触发 → 编辑原命令消息。

## 角色：主人与管理员 [#角色主人与管理员]

`[command].whitelist` 决定**能不能触发**；`[roles]` 决定**触发后能做什么**。两者分开：

```toml
[roles]
owners = [123456789]   # 主人：最高权限
admins = [987654321]   # 全局管理员
```

- 主人 / 管理员**绕过** `whitelist`，始终能触发；
- bot 账户没有隐式主人，`owners` 为空就是没有主人；
- user 账户在 `owners` 为空时默认自己是主人；一旦配置了 `owners`，就完全按列表来——
  自己不在列表里就不再是主人，可以换成别人；
- 群里的 Telegram 管理员是**会话角色**，由宿主现查，不会因为写进这里就变成全局管理员。

> 改 `owners` 时先把自己 id 写进去：一旦列表非空，user 账户自己就不再自动是主人；
> 忘记写自己会丢失 `owner` 级命令，普通命令不受影响。

命令的 `role` / `scopes` 元数据见[命令表与 /help](../plugin/command-table.mdx)。

## TDLib 对象缓存 [#tdlib-对象缓存]

宿主会缓存 chat / user / 群 / 社区 / 成员，`Simplify` 默认缓存优先：

```toml
[cache]
enabled = true
capacity = 100   # 每种类型，不是总数
```

- LRU 淘汰；chat list 是独立索引，不占这 100 条配额；
- `chat_member` 带 30 秒 TTL；
- 离线且缓存未命中时直接返回，不再等 TDLib 超时；
- 关掉 `enabled` 只是不读写缓存，不会改变命令 / 权限语义。

详见 [TDLib 对象缓存](../plugin/cache.mdx)。

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

- **读**：`get_config(section, key)` —— `section` 就是**配置文件里的段名**：
  `plugin.fuyubot.music`、`[plugin.fuyubot.music]`、裸插件名 `fuyubot.music` 都认，
  顶层写 `[bot]` / `[telegram]` 也行；**空串 = 读自己那段**（与写同一个默认）。
  `key` 空串读整段，`key` 是点路径（`nested.k`）。
- **写**：`set_config(key, value_json)` —— **只能写自己名下的段**（没有 section 参数，宿主按执行者身份判定，插件无法伪造）。成功 = 写内存 + 落盘到 `plugin-config/<插件名>.toml`；宿主这次启动没有配置文件、或这个键被用户配置钉住时**直接报错**。
- **写别人的段**：`set_config_section(section, key, value_json)` —— 段名写法同上，
  显式点名目标插件，给协作插件同步设置用。**只接受 `plugin.*`**（顶层归你，写了会被拒），
  其余规则完全一样（用户钉住的键照样拒绝、只落目标那个文件），宿主会记一行「谁改了谁的配置」。

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
api_hash = ""       # 首次 run 后自动写入

[roles]
owners = []         # 主人 id；为空时 user 账户默认自己是主人
admins = []         # 全局管理员 id

[cache]
enabled = true
capacity = 100      # 每种类型，不是总数

[command]
# prefix = ["/"]    # 不写按账号默认；写了整套替换
whitelist = []      # 额外允许触发命令的用户 id
whitelist_only = true   # ⚠️ 不建议关闭；false = 任何人都能触发

[plugins]
dir = "plugins"
log_level = "info"
registry_url = "https://catmoecircle.github.io/FuyuBot-plugins/index.json"

[tdlib]
path = ""           # 留空自动找 tdjson
log_verbosity = 1
```

<Callout type="warn">
  **凭据**：`api_id` / `api_hash` 每次冷启动都要随 `setTdlibParameters` 发出；`fuyubot run` 问过之后会把 `api_hash` **明文写回** `[telegram]`。不想落盘就用 `TG_API_ID` / `TG_API_HASH`。Bot Token、手机号、验证码、两步验证密码仍然只走环境变量或交互输入。session 由 TDLib 落在 `data_dir`。
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
