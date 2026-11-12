# 运行与实例管理 (/docs/usage/run)

> **桌面用户推荐先看[操作面板](#操作面板tui)**：直接运行 `fuyubot`（不带子命令）或
> `run --tui`，登录、启停、日志、配置、商店都在一个界面里。本页的 `run` 主要给
> 服务器 / CI / 无终端场景。

## 一个目录一个实例 [#一个目录一个实例]

实例状态与运行期控制放在 `<项目根>/.fuyubot/` 下，**每件事各占一个文件**：

| 文件 | 作用 |
| --- | --- |
| `.fuyubot/lock` | **只用来独占**（`try_lock`，进程死即释放）。里面不存内容——Windows 的文件锁是强制的，别的进程读不到被锁的字节 |
| `.fuyubot/status` | `key=value`：pid / started / version / log_level / plugins / name。**启动完成之后**才发布（拿上锁只说明进程活着） |
| `.fuyubot/stop` | 停止请求，内容是 PID。`fuyubot stop` 先写它，让实例自己收摊 |
| `.fuyubot/log-level` | **可选的运行期控制**：面板在日志页按 `l` 写它，实例每 500ms 读一次并切换插件日志级别；新实例拿锁时清掉，不会带到下一轮 |

- 第二次 `run`（前台后台都算）会被拒，报错里带上在跑的那个 PID。
- 陈旧的 `lock` **不用手工清理**：拿锁时会顺手删掉上一个实例的 `status` / `stop` / `log-level`。
- `--replay` **不占锁、不发布状态**：离线开发路径不该和跑着的实例互斥。

## 无终端：前台运行 [#无终端前台运行]

```powershell
.\fuyubot.exe run --config demo\fuyubot.toml
```

顺序是固定的：自动 init → 拿单实例锁 → attach TDLib → 问/读凭据 → **加载全部插件** → 发 `setTdlibParameters` 并登录 → `getMe` 打印账户 → 发布状态 → 最后才开分发。插件先于登录加载，是为了不漏掉登录窗口里的更新。

| 参数 | 作用 |
| --- | --- |
| `--config <路径>` | 配置文件，默认 `fuyubot.toml` |
| `--plugin-dir <目录>` | 覆盖配置里的插件目录 |
| `--api-id <ID>` | 覆盖配置里的 `api_id`（**不是**秘密）。优先级：`--api-id` → `TG_API_ID` → 配置 → 交互提问；`api_hash` 没有对应参数 |
| `--no-login` | 只起框架、不走登录流程（CI / 容器；已有 session 仍会被 TDLib 打开） |
| `--no-tdlib` | 不接 TDLib，只加载插件 |
| `--background` | 放到后台跑 |
| `--tui`（短写 `-t`） | 打开终端操作面板（见下节）；与 `--background` / `--replay` 互斥 |
| `--replay <JSON>` / `--replay-wait <MS>` | 见 [离线回放](./replay.mdx) |

凭据来源（按序）：`TG_API_ID` / `TG_API_HASH` → 配置里已保存的 `[telegram].api_id` / `.api_hash` → 交互式提问。**交互问出来的会被写回配置文件**，下次冷启动不用再输（这两个值每次都要随 `setTdlibParameters` 发出去，session 有效也一样）。Bot Token 仍只认 `TG_BOT_TOKEN` 或交互输入、不落盘，详见 [环境变量](./env.mdx)。

## 后台运行 [#后台运行]

```powershell
.\fuyubot.exe run --config demo\fuyubot.toml --no-login --background
```

```text
已在后台运行：pid 64852，日志 demo\logs\fuyubot.log
`fuyubot status` 看状态，`fuyubot stop` 停掉它
```

它派生一个没有终端的自己，stdout/stderr 写进 `<目录>logs\fuyubot.log`（每次新启动先清空旧日志）；父进程等子进程**真起来**（`.fuyubot/status` 发布）才返回。

<Callout type="warn">
  后台跑**没有 stdin**。要交互式登录的场合（还没有 session、也没给 `TG_BOT_TOKEN`）会直接失败，并把日志尾巴打出来指路——先用前台 `run` 或 `fuyubot login` 登一次，session 会落在 `data/`。首次连 `api_id` / `api_hash` 也问不了：先在前台跑一次让它写回配置，或设好 `TG_API_ID` / `TG_API_HASH`。
</Callout>

想单独把登录走完而不起框架，用 [`fuyubot login`](../cli/fuyubot.mdx#login)；要退出登录（清掉本地会话）用 `fuyubot logout`。

## 操作面板（`--tui`） [#操作面板--tui]

```powershell
.\fuyubot.exe                 # 不带子命令 = 直接开面板（双击 exe 就是它）
.\fuyubot.exe run --tui --config demo\fuyubot.toml
```

两个入口是同一个面板：**不带子命令**时全走默认值（配置文件默认 `fuyubot.toml`），
需要自定配置 / 参数才用 `run --tui`。面板需要真终端，非 TTY 下会报错而不是画出半屏。

首次缺 `api_id` / `api_hash` 时，按 `s`（启动）或 `L`（只登录）会先弹两步输入框；
填完明文写回 `[telegram]`，再继续登录 / 启动。已经在配置或环境变量里的不会重复问。

打开的是**操作面板**，不是前台 bot：顶部版本栏（`[fuyubot - v…]`；实例运行中才显示状态，
没跑时只显示刷新时间）、左侧导航、中央工作区、底部两行（当前可用操作 / 资源占用）。
顶部和底部不铺背景色，当前焦点靠窗口边框高亮 + 底栏的 `[导航]` / `[工作区]` 标记。

底部资源行：`CPU · 内存 · 运行时长 · 插件数 · 日志级别 · PID`，采的是**运行中实例的 PID**
（`sysinfo`）。实例没跑时 CPU / 内存 / 运行 / PID 显示 `—`、插件数为 0，日志级别显示
面板下次启动会用哪一档；第一个采样点的 CPU 是 `0.0%`，下一秒才有真实值。

| 按键 | 作用 |
| --- | --- |
| `Tab` / `Shift+Tab` | 切换焦点：导航 ↔ 工作区（边框高亮） |
| `Enter` / `Esc` | 导航 → 工作区 / 工作区 → 导航（在导航上按 `Esc` 才退出） |
| `↑` / `↓`、`j` / `k` | 导航焦点：切页；工作区焦点：滚动日志 / 选择配置项 / 移动日志选择 |
| `←` / `→` | 切换顶部标签页（窄屏横向导航；工作区焦点也生效） |
| `h` / `l` | 导航焦点：上一页 / 下一页 |
| `1`–`6` | 直接跳到概览 / 日志 / 配置 / 插件 / 商店 / 帮助 |
| `Enter` | 日志页：进入日志选择模式；配置页：编辑选中的配置项（`e` 同）；插件页：开关选中项 |
| `Space` | 插件页 + 工作区焦点：启用 / 禁用选中项（目录挪进 `plugins/.disabled/`，旧形态 dll 加 `.disable` 后缀） |
| `y` | 日志选择模式：复制选中行（TDLib Update 复制完整 JSON） |
| `s` | 启动 bot：先自动检查登录，缺登录会弹登录框，成功后自动继续（派生 `run --background`，带上面板拿到的 `--api-id` / `--log-level` 等参数） |
| `L`（大写） | 显式登录：只走登录、不启动实例；通常直接按 `s` 即可 |
| `x` → `y` | 停止 bot（`y` 是确认；`.fuyubot/stop` 走插件的 `plugin_stop`） |
| `r` | 立刻刷新状态 / 插件 / 日志 / 配置 |
| `l` | 日志页 + 工作区焦点：调整运行中实例的日志级别（下一圈生效） |
| `F` | 日志页 + 工作区焦点：按级别 / 来源过滤日志 |
| `c` | 日志页 + 工作区焦点：清空当前日志文件（要确认） |
| `f` | 日志页 + 工作区焦点：跟随末尾开关 |
| `PgUp` / `PgDn`、`Home` / `End` | 工作区焦点：日志 / 帮助翻页、首尾；配置页、插件页选择翻页、首尾 |
| `q`、`Ctrl+C` | 退出面板（不会停掉已启动的实例） |

插件页的开关分两种形态：

- **目录**（原生插件包、`plugins/scripts/<名字>/` 下的脚本目录）：整个挪进 `plugins/.disabled/`，
  再按一次挪回原来的位置；
- **旧形态平铺 dll**：改名 `foo.dll` ↔ `foo.dll.disable`。

改完**重启实例**才生效：运行中的实例已经把插件映射进进程了，改名 / 挪目录不会让它当场卸载
（Windows 上库被占用时改名还会直接失败，面板会报错；先 `x` 停止再按 `Space`）。
加载器只扫启用态的路径，所以没有第二份「禁用清单」要跟插件目录同步。

面板**不占实例锁、不加载插件**；平时也不接 TDLib——TDLib 的数据库同一时刻只能一个进程打开。
唯一例外是 `s` / `L` 的登录探测：它跑完立刻关掉，再派生子进程。
面板读 `.fuyubot/status`、配置、插件目录与 `logs/fuyubot.log`；启停都派生子进程，
和手敲命令走同一条路，所以看到的就是真正在跑的那个实例。

日志级别是**运行期**的：配置里的 `[plugins].log_level` 决定启动值，日志页按 `l` 选的值只对
**本次运行**生效（写 `.fuyubot/log-level`，实例下一圈读并切换），重启后回到配置值。
`fuyubot status`、面板的日志页与概览都会显示当前生效的级别。

日志过滤（`F`）：级别是下限（`info+` = error / warn / info，排除 debug / trace），来源分
**插件 / 宿主 / 管道 / 更新 / TDLib / 其他**。新日志格式按「插件行 / source 词」归类（旧四列
也兼容）：`TDLib Update` 追踪归**更新**（级别 trace），TDLib C 库的 `[ N][t …]` 原样行归
**TDLib**；认不出级别的启动提示按 info 对待。应用后底栏显示 `过滤 info+ · 全部` 与
`x/y 行`，`c` 在弹框里一键重置。日志字段不按固定列补空格，长行按显示宽度折行
（续行缩进两格）。

TDLib Update 行只显示 `@type`（如 `updateNewMessage`），不铺整段 JSON。日志页按 `Enter`
进入选择模式，`↑↓` 选行，`y` / `Enter` 复制：TDLib Update 复制**完整 JSON**，其它行复制整行；
`Esc` 退出选择。

后台实例每次新启动都会先清空 `logs/fuyubot.log`；日志页按 `c` 可手动清空当前日志
（确认后清空并回到跟随末尾，运行中的实例继续写新行）。

窄终端（手机 / Termux）会自动收缩：宽度 < 60 列时导航移到工作区上方，变成一行
横向标签，用 `←` / `→`（工作区焦点也生效）或 `h` / `l`（导航焦点）切换；更窄时标签
退化成单字。底栏窄屏只留 `CPU / 内存 / 级别`，不显示运行时长、插件数量和 PID；
配置项窄屏改成「完整键 + 值」两行，帮助页可 `↑↓` / `PgUp` / `PgDn` 滚动；日志窄屏只留
`HH:MM:SS`、插件名最后一段和级别。复制优先 `termux-clipboard-set`（`termux-api`），
否则 OSC 52。

配置页是**可编辑表格**：段 / 键 / 生效值 / 来源，`↑↓` 选中、`Enter` / `e` 编辑。
文本、整数和枚举（`account_type` / `log_level`）先校验再写回；写回只替换那一段值，
保留注释、顺序和 CRLF。值跨行写（多行数组 / 内联表）也能改：整段折叠成一行，值里的
注释原样搬到新值下面，不会把后面的段弄坏。运行中保存的配置**重启后生效**；`api_hash`、
Bot Token / 手机号 / 密码和 `[plugin.*]` 段只读。配置读不出来时页面显示错误原文，
改好按 `r` 重读。

## 看状态 [#看状态]

```powershell
.\fuyubot.exe status --config demo\fuyubot.toml
```

```text
demo：运行中
  pid        64852
  已运行     0 秒
  版本       0.1.0
  名字       mybot
  日志级别   info
  插件       0 个
  日志       demo\logs\fuyubot.log
```

`status` 只读 `.fuyubot/`，**不加载插件、不接 TDLib**。三种结果：运行中 / 陈旧（没人在跑，附上次的 pid 与启动时间）/ 没有运行中的实例。还有一种是「有实例在跑、但状态还没发布」，也就是卡在启动里。

登录成功之后还会多一行「账户」（`名字 @用户名（id=…） [bot]`）：`getMe` 拿到就写进 status，
之后 TDLib 用 `updateUser` 改名字 / 用户名时实例跟着刷新并重发——面板的概览页读的是同一份。

## 停掉 [#停掉]

```powershell
.\fuyubot.exe stop --config demo\fuyubot.toml
```

```text
已停止 mybot（pid 64852，优雅退出：插件 stop 与内核都已收摊）
```

```powershell
.\fuyubot.exe status --config demo\fuyubot.toml
```

```text
demo：没有运行中的实例
```

`stop` 的机制：写 `.fuyubot/stop` → 实例每 500 ms 看一次 → 停接收循环 → 卸载插件（跑 `plugin_stop`）→ 停内核 → 放锁；**8 秒不理会才硬杀兜底**。硬杀跑不到插件的 `plugin_stop`，所以别一上来就 `taskkill`。

<Callout type="warn">
  **Ctrl-C 仍是硬杀**：捕获它要开 tokio 的 `signal` feature（会带进 `mio` + `signal-hook-registry` + `errno`，依赖白名单没放行）。要优雅退出就用 `fuyubot stop`，别按 Ctrl-C。
</Callout>

## 常见情形 [#常见情形]

| 现象 | 处理 |
| --- | --- |
| 重复 `run` 报「已经有实例在跑」，带 PID | 先 `status`，再 `stop`；不要手工删 `lock` |
| `status` 说陈旧 | 正常，陈旧状态不用清理，下次 `run` 自己接管 |
| 后台启动后立刻 `status` 报「启动中」 | 状态是在插件加载 + 登录之后才发布的，等一会儿再看 |
| 进程活着但没更新 | 没登录就收不到任何更新；先用 `--replay` 验插件 |
