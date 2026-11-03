# 插件分发包 (/docs/plugin/bundle)

一个原生插件就是一个目录：根上放 `plugin.json`，入口和依赖放在 `bin/`。
脚本插件仍然是一个目录，放在 `plugins/scripts/` 下。

```text
plugins/
├── com.example.weather/          # 原生插件：目录名建议与 id 一致
│   ├── plugin.json               # 必需：静态元数据
│   └── bin/
│       └── weather.dll           # 入口；同目录可以放依赖库
└── scripts/
    └── weather-bot/              # 脚本插件
        ├── package.json 或 pyproject.toml
        └── main.py / index.ts
```

入口文件名不限，`plugin.json` 的 `entry` 指向哪个人就用哪个。Windows 是 `.dll`，
Linux 是 `.so`，macOS 是 `.dylib`。

## plugin.json [#pluginjson]

最小可用的原生插件清单：

```json
{
  "schema": 1,
  "id": "com.example.weather",
  "name": "Weather",
  "version": "1.2.0",
  "kind": "native",
  "entry": "bin/weather.dll",
  "abi": 5,
  "platforms": ["windows-x86_64", "linux-x86_64", "macos-aarch64", "android-aarch64"]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `schema` | 是 | 固定 `1` |
| `id` | 是 | 插件唯一标识，只能用字母、数字、`.`、`_`、`-`，最长 128；不能以点结尾 |
| `name` | 是 | 展示名 |
| `version` | 是 | 语义化版本，和发布 tag 一致 |
| `kind` | 是 | `native` / `python` / `js` |
| `entry` | 是 | 相对包根的入口路径，必须真的存在 |
| `abi` | 建议 | 编译时使用的宿主 ABI 版本；不写则加载后才知道 |
| `platforms` | 否 | 为空或 `["any"]` 表示全平台；否则必须包含当前平台 |
| `depends` | 否 | 硬依赖的服务名，例如 `["help.commands"]` |
| `optional_depends` | 否 | 软依赖的服务名 |
| `provides` | 否 | 本插件提供的服务名，供展示与依赖检查 |
| `config` | 否 | 默认配置文件的相对路径 |
| `description` | 否 | 一句话说明，显示在插件列表 / 商店 |
| `license` | 否 | 许可证标识 |
| `homepage` | 否 | 项目主页 |

`id` 也决定配置段：`[plugin.com.example.weather]`。

脚本插件的 `plugin.json` 可以只写身份，`entry` 指向脚本：

```json
{
  "schema": 1,
  "id": "weather-bot",
  "name": "Weather Bot",
  "version": "1.0.0",
  "kind": "python",
  "entry": "main.py",
  "platforms": ["any"]
}
```

## 打包成 zip [#打包成-zip]

发布时打一个 zip，**zip 根就是插件目录的内容**，不要套一层目录：

```text
weather.zip
├── plugin.json
└── bin/weather.dll
```

打包要求：

- 只放运行需要的东西：不要带 `node_modules/`、`.venv/`、`target/`、`.git/`；
- 不要放符号链接；
- 单个 zip 不超过 50MB，解压后不超过 200MB，文件数不超过 2000；
- 文件名不要以点或空格结尾，不要用 `CON`、`NUL`、`COM1` 这类 Windows 保留名
  （大小写也算冲突）；
- 资产名建议 `<id>-<version>-<平台>.zip`，例如
  `com.example.weather-1.2.0-windows-x86_64.zip`；纯脚本包用 `-any.zip`。
  Android 用 `android-aarch64` / `android-x86_64`，入口是 `.so`（例如
  `bin/libweather.so`），不能拿 Linux 的包代替。

商城按资产名和 `plugin.json` 校验，不符合上面的规则会被拒绝收录。

## 安装 [#安装]

### 从商店安装 [#从商店安装]

新建项目默认已配置官方商店（`fuyubot.toml` 的 `[plugins].registry_url`）。
换商店改那一行，删掉则关闭商店。

运行 `fuyubot run --tui`，进「商店」页搜索、选中、安装，然后重启实例。

### 本地目录安装 [#本地目录安装]

```bash
fuyubot plugin install ./weather
fuyubot plugin install ./weather-bot        # 脚本插件目录
```

原生包装进 `plugins/<id>/`，脚本包装进 `plugins/scripts/<目录名>/`。
也可以用 `fuyubot plugin install` 装单个 `.dll`（旧形态），但推荐目录包。

### 手动安装 [#手动安装]

把 zip 解压到 `plugins/<id>/`，或者把目录直接拷进去，然后重启：

```bash
fuyubot plugin list          # 确认能看到、版本 / 平台 / 依赖正确
fuyubot run --config fuyubot.toml
```

## 排查 [#排查]

| 现象 | 原因 / 处理 |
| --- | --- |
| `plugin list` 看不到 | 目录不在 `plugins/` 下，或 `plugin.json` 读不了；确认路径与权限 |
| 提示 `id` 与目录不一致 | 目录名和 `plugin.json` 的 `id` 不同会以 `id` 为准；改名保持一致 |
| 提示平台不匹配 | 压缩包不是给当前系统的；换对应平台的资产 |
| 提示入口不存在 | `entry` 写错，或打包时漏了 `bin/` 里的文件 |
| 启动时报 ABI 不匹配 | 插件编译时的 ABI 与宿主不一致；用与宿主同版本的 `fuyubot-abi` 重新编译 |
| 加载后名字对不上 | `plugin_init` 返回的名字必须等于 `plugin.json` 的 `id` |

## 卸载 [#卸载]

```bash
fuyubot plugin uninstall <id>          # 原生包
fuyubot plugin uninstall weather-bot   # 脚本插件（按目录名）
```

只删插件目录，`[plugin.<id>]` 配置和 `data/plugins/<id>/` 不会被删。
