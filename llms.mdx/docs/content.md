# fuyubot 文档 (/docs)

**fuyubot** 是一个基于 TDLib 的 Telegram bot / user 框架：Rust 内核 + C ABI 插件 + 可选的脚本插件。
插件就是一个动态库（`.dll` / `.so` / `.dylib`），一个 cdylib 就是一个插件。

<Cards>
  <Card
    title="使用文档"
    href="/docs/usage/"
    description="下载安装、配置文件、运行、回放、实例管理与排错"
  />
  <Card
    title="插件开发"
    href="/docs/plugin/"
    description="用 Rust / C / C++ / Go 写原生插件：导出符号、事件、TDLib 调用与 ABI"
  />
  <Card
    title="开发文档"
    href="/docs/dev/"
    description="改框架本身：架构、构建测试、常见陷阱、发布"
  />
  <Card
    title="脚本插件"
    href="/docs/script/"
    description="Python / JS / TS：由独立的 fuyubot.script 插件托管，不编译、装上就跑"
  />
  <Card
    title="CLI 文档"
    href="/docs/cli/"
    description="fuyubot 的完整命令参考"
  />
</Cards>

## 两条插件路线 [#两条插件路线]

| 路线 | 写什么 | 要编译吗 |
| --- | --- | --- |
| 原生插件（[插件开发](./plugin/index.mdx)） | Rust / C / C++ / Go，一个 cdylib | 要（`cargo build` / `cl /LD` / `gcc -shared`） |
| 脚本插件（[脚本插件](./script/index.mdx)） | Python / JS / TS，一个目录 | 不要 |

脚本能力**不在运行时本体里**：它由独立仓库的 `fuyubot.script` 插件提供，装上才有。
想要 Python / JS / TS 脚本支持，到
[FuyuBot-Script Releases](https://github.com/CatMoeCircle/FuyuBot-Script/releases) 下载
`fuyubot-script-<OS>-<平台>.zip`，把里面的 `plugins/fuyubot.script/` 放进插件目录；
**同时要先装好 [uv](https://docs.astral.sh/uv/)（Python）和 [bun](https://bun.sh)（JS / TS）**——
这两个运行时不在任何安装包里。
`fuyubot` 自己**只跑不编译**——`fuyubot plugin install` 只负责把编好的产物**复制**进插件目录。

## 下一步 [#下一步]

- **普通用户（桌面）**：到 [Releases](https://github.com/CatMoeCircle/Fuyu-Bot/releases) 下对应平台的包，
  解压后直接运行 `fuyubot` 开**终端操作面板**（登录 / 启停 / 日志 / 配置都在里面）——
  见 [下载与安装](./usage/index.mdx)
- **Android 用户**：推荐官方图形客户端
  [FuyuBot-for-Android](https://github.com/CatMoeCircle/FuyuBot-for-Android/releases)（APK），不用在 Termux 里手敲 CLI
- 要自己编：见 [从源码构建](./usage/build.mdx)
- 要写插件：看 [插件总览](./plugin/index.mdx)
- 想改框架：看 [开发文档](./dev/index.mdx)
- 卡住了：看 [常见问题](./usage/troubleshooting.mdx)
