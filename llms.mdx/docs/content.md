# fuyubot 文档 (/docs)

**fuyubot** 是一个基于 TDLib 的 Telegram bot / user 框架：Rust 内核 + C ABI 插件 + 多语言 SDK。
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
    description="Rust / C / C++ / Python / JS / TS 插件、事件、TDLib 调用与 ABI"
  />
  <Card
    title="开发文档"
    href="/docs/dev/"
    description="改框架本身：架构、构建测试、常见陷阱、发布"
  />
  <Card
    title="CLI 文档"
    href="/docs/cli/"
    description="fuyubot 与 fuyubot-sdk 的完整命令参考"
  />
</Cards>

## 两个 CLI，职责严格分离 [#两个-cli职责严格分离]

| CLI | 干什么 | 子命令 |
| --- | --- | --- |
| `fuyubot` | 跑框架 | `init` / `run` / `status` / `stop` / `plugin` |
| `fuyubot-sdk` | 写插件 | `init` / `codegen` / `check` / `abi-version` / `td-methods` / `td-method` |

两个都**不编译、不打包插件**——编译是插件作者用自己语言工具链（`cargo build`、`cl /LD`、`gcc -shared`）完成的事，
`fuyubot plugin install` 只负责把编好的产物**复制**进插件目录。

## 下一步 [#下一步]

- **普通用户**：到 [Releases](https://github.com/CatMoeCircle/Fuyu-Bot/releases) 下对应平台的包，解压就跑 ——
  见 [下载与安装](./usage/index.mdx)
- 要自己编：见 [从源码构建](./usage/build.mdx)
- 要写插件：看 [插件总览](./plugin/index.mdx)
- 想改框架：看 [开发文档](./dev/index.mdx)
- 卡住了：看 [常见问题](./usage/troubleshooting.mdx)
