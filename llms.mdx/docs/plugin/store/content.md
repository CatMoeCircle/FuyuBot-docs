# 插件商店 (/docs/plugin/store)

商店是 TUI 里的一个页面：拉一份静态 `index.json`（schema 2 的轻索引），搜索、看详情、
下载、校验、解压、安装、换版本、回滚、卸载。宿主和插件运行时不会联网。

不想开面板也可以先在浏览器里逛[插件目录页](https://catmoecircle.github.io/FuyuBot-plugins/)
（与商店同一份索引，按宿主 ABI / 平台筛选版本）。

## 配置并打开 [#配置并打开]

新建项目会在 `fuyubot.toml` 里默认写入官方商店：

```toml
[plugins]
registry_url = "https://catmoecircle.github.io/FuyuBot-plugins/index.json"
```

想换商店改这一行；删掉或留空则关闭商店。也可以用环境变量临时覆盖（优先级更高）：

```bash
export FUYUBOT_REGISTRY_URL="https://example.com/fuyubot/index.json"
```

然后：

```bash
fuyubot run --tui
```

在顶部导航切到「商店」页：

| 按键 | 作用 |
| --- | --- |
| `↑` `↓` / `k` `j` | 选择插件 |
| `PgUp` / `PgDn` | 翻页 |
| `Home` / `End` / `g` `G` | 跳到首尾 |
| `Enter` | 安装选中的版本（已装别的版本就是升级 / 降级） |
| `v` | 选历史版本（ABI / 平台不兼容的版本会标红，选不了） |
| `b` | 回滚到上一次换版本前的版本 |
| `x` | 卸载选中的已安装插件 |
| `/` | 输入过滤词（id / 名称 / 简介） |
| `r` | 重新拉索引 |
| `Esc` | 返回插件页 |

换版本会先把旧目录挪到 `plugins/.backup/<id>/`（脚本插件是
`plugins/.backup/scripts/<id>/`），新版本落位失败会自动还原；`b` 把备份换回来。
运行中的实例还持有 DLL，Windows 上必须先停实例：按 `Esc` 回插件页再按 `x`
（商店页里的 `x` 是卸载，不是停止）。

安装 / 换版本后需要重启实例（Windows 不能替换已加载的 DLL）。选中已安装的那个版本再按
`Enter` 只会提示「已经装好了」，不会重复下载。

商店选版本的规则（低版本宿主不会被迫装高 ABI 的新版本）：

1. `latest` 未下架、ABI ≤ 本宿主、且有本平台（或 `any`）的包 → 用它；
2. 否则按版本列表倒序找第一个同样条件的版本；
3. 都不满足就报原因：需要升级 fuyubot / 没有本平台包 / 全被下架。

想固定在某个历史版本，按 `v` 选它；想回到换版本之前，按 `b`。

列表**只显示本机能装的插件**：ABI 比本宿主新的、没有本平台包的、全被下架的都不出现，
被隐藏的数量显示在列表标题里（`索引 · 7（隐藏 2 个不兼容）`）。这样低版本宿主看到的就是
真正能跑的那一批，而不是一屏点进去全报错的条目。

没有配置索引地址时，商店页会显示「未配置」，不影响启动、加载和运行。

## 发布一个插件（给插件作者） [#发布一个插件给插件作者]

1. 按[插件分发包](./bundle.mdx)的格式打 zip：根上是 `plugin.json` + `bin/`。
2. 在插件仓库打 tag `v<版本>`（例如 `v1.2.0`），把各平台的 zip 作为 Release 资产上传。
3. 资产名与平台对应：

```text
weather-plugin-1.2.0-windows-x86_64.zip
weather-plugin-1.2.0-windows-aarch64.zip
weather-plugin-1.2.0-linux-x86_64.zip
weather-plugin-1.2.0-linux-aarch64.zip
weather-plugin-1.2.0-macos-aarch64.zip
weather-plugin-1.2.0-android-aarch64.zip
weather-plugin-1.2.0-android-x86_64.zip
```

纯脚本插件只需要一个 `-any.zip`。Android 必须单独交叉编译，不能复用 Linux 的 `.so`。

4. 把插件提交到索引（见下一节），或者直接把索引地址给用户。

## 维护一个索引（给商城 / 私有源） [#维护一个索引给商城--私有源]

索引是一个静态 JSON，可以放在 GitHub Pages、对象存储或任何支持 HTTPS 的地方。
**schema 2** 把索引拆成「主文件 + 每插件分片」：主文件只放列表字段，选中插件时再拉
`plugins/<id>.json` 拿描述和版本表。这样主文件不会随插件数量 / 版本数量膨胀。

主文件：

```json
{
  "schema": 2,
  "plugins": [
    {
      "id": "com.example.weather",
      "name": "Weather",
      "summary": "天气查询",
      "latest": "1.2.0",
      "detail": "plugins/com.example.weather.json",
      "repo": "owner/weather",
      "tags": ["weather"],
      "abis": [5, 6],
      "platform_min_abi": {
        "windows-x86_64": 5,
        "linux-x86_64": 5,
        "any": 5
      }
    }
  ]
}
```

`plugins/com.example.weather.json`：

```json
{
  "schema": 2,
  "plugin": {
    "id": "com.example.weather",
    "name": "Weather",
    "summary": "天气查询",
    "repo": "owner/weather",
    "license": "MIT",
    "homepage": "https://example.com",
    "latest": "1.2.0",
    "versions": [
      {
        "version": "1.1.0",
        "api": ">=0.1, <1.0",
        "abi": 5,
        "depends": [],
        "yanked": false,
        "assets": {
          "windows-x86_64": {
            "url": "https://github.com/owner/weather/releases/download/v1.1.0/weather-plugin-1.1.0-windows-x86_64.zip",
            "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "size": 123456
          }
        }
      },
      {
        "version": "1.2.0",
        "api": ">=0.1, <1.0",
        "abi": 6,
        "depends": [],
        "yanked": false,
        "assets": {
          "windows-x86_64": {
            "url": "https://github.com/owner/weather/releases/download/v1.2.0/weather-plugin-1.2.0-windows-x86_64.zip",
            "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "size": 123456
          }
        }
      }
    ]
  }
}
```

主文件字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `schema` | 是 | 固定 `2`（客户端仍兼容 schema 1 的全量索引） |
| `plugins[].id` | 是 | 插件 id，必须与分片、包内 `plugin.json` 一致 |
| `plugins[].name` | 是 | 展示名 |
| `plugins[].summary` | 否 | 列表里的一句话简介 |
| `plugins[].repo` | 否 | 源码仓库，`owner/repo` |
| `plugins[].tags` | 否 | 搜索标签 |
| `plugins[].latest` | 否 | 最新版本号；缺省时取分片里最大的非 yanked 版本 |
| `plugins[].detail` | 是 | 分片地址，相对索引地址解析，约定为 `plugins/<id>.json` |
| `plugins[].abis` | 否 | 摘要：非 yanked 版本出现过的 ABI（目录页筛选用，客户端可忽略） |
| `plugins[].platform_min_abi` | 否 | 摘要：平台 → 该平台**可用**版本里最低的 ABI（`0` = 版本没声明 ABI）。商店用它判断本机能不能装，**不兼容的插件不会出现在列表里**；没有这份摘要时宁多勿漏 |

分片字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `schema` | 是 | 固定 `2` |
| `plugin` | 是 | 完整条目：`description` / `license` / `homepage` / `tags` / `latest` / `versions` |
| `plugin.versions` | 是 | **按版本号升序**；客户端从后往前找最新的可用版本 |
| `versions[].version` | 是 | 版本号，与包内 `plugin.json` 一致 |
| `versions[].assets` | 是 | 平台 → 资产；平台键用 `windows-x86_64`、`android-aarch64` 这类写法，纯脚本用 `any` |
| `versions[].assets[].url` | 是 | 只允许 `https://` |
| `versions[].assets[].sha256` | 是 | 64 位小写十六进制；下载后必须匹配 |
| `versions[].assets[].size` | 是 | 字节数 |
| `versions[].api` | 否 | 兼容的宿主版本范围，仅展示 |
| `versions[].abi` | 否 | 需要的 ABI；高于宿主的版本不参与选择（会回退到旧版本） |
| `versions[].depends` | 否 | 依赖的服务名，仅展示 |
| `versions[].yanked` | 否 | `true` 表示撤回，不会再被选中 |

索引本身也要满足：

- 只通过 HTTPS 提供；主文件不超过 8MB，单个分片不超过 1MB；
- `detail` 只能是相对路径或 `https://`，不许带 `..`、不许明文 http；
- 资产 URL 必须直接指向 zip，不能是 HTML 页面或会变的 `latest` 链接；
- 每个版本的资产都要有正确的 `sha256`，否则商店会拒绝安装；
- 一个 zip 只放一个插件。

> 只认 schema 1 的旧宿主会把 schema 2 索引报成「schema 不支持」；升级宿主即可。
> 商店会带 `If-None-Match` 复用本地缓存，网络断掉时也能用上一次的列表。

## 收录到官方商城 [#收录到官方商城]

官方索引由 `CatMoeCircle/FuyuBot-plugins` 维护：在 `plugins/<id>.yml` 里填写插件信息、
Release tag 和资产名，提交 PR。CI 会下载资产、校验 `plugin.json` / sha256 / 平台 / zip
安全规则，合并后自动重建索引。

一个条目的写法：

```yaml
id: com.example.weather
name: Weather
summary: 天气查询
repo: owner/weather
license: MIT
homepage: https://github.com/owner/weather
tags: [weather]
api: ">=0.1, <1.0"
abi: 5
versions:
  - version: 1.2.0
    tag: v1.2.0
    assets:
      windows-x86_64: weather-plugin-1.2.0-windows-x86_64.zip
      linux-x86_64: weather-plugin-1.2.0-linux-x86_64.zip
      macos-aarch64: weather-plugin-1.2.0-macos-aarch64.zip
```

`assets` 里写文件名，CI 会拼出 `https://github.com/<repo>/releases/download/<tag>/<文件名>`
并计算 `sha256`。

## 安全与限制 [#安全与限制]

- 索引地址与资产 URL 只接受 HTTPS（http、`file://` 拒绝）；明细分片允许相对路径，但不许 `..`；
- 下载后强制校验 sha256，失败即停止，不会落盘；
- 解压时拒绝 `..`、绝对路径、符号链接、大小写冲突、Windows 保留名；
- 单包上限 50MB，解压后 200MB，最多 2000 个文件；
- 安装先落到 `plugins/.staging/<id>/`，校验通过后才改名到 `plugins/<id>/`
  或 `plugins/scripts/<id>/`；目标已存在时拒绝覆盖。
