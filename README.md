# fuyubot 文档站

**fuyubot** 是一个基于 TDLib 的 Telegram bot / user 框架：Rust 内核 + C ABI 插件 + 多语言 SDK。
插件就是一个动态库（`.dll` / `.so` / `.dylib`）或一个脚本目录，装上就能跑。
在线文档：<https://catmoecircle.github.io/FuyuBot-docs/>

本仓库用 [Fumadocs](https://fumadocs.dev)（Next.js + MDX）搭的文档站，**静态导出**（`out/`），不需要 Node 运行时。
本仓库只放文档站源码；运行时本体在 [Fuyu-Bot](https://github.com/CatMoeCircle/Fuyu-Bot)，
插件 SDK 在 [FuyuBot-SDK](https://github.com/CatMoeCircle/FuyuBot-SDK)。

## 本地开发

```powershell
pnpm install     # 一次就够
pnpm dev         # 本地写文档：http://localhost:3000
pnpm build       # 静态产物：out/
```

## 部署

当前发布位置是 GitHub Pages（<https://catmoecircle.github.io/FuyuBot-docs/>）：
`main` 一有推送，`.github/workflows/pages.yml` 就会构建并把 `out/` 发布到 `gh-pages` 分支，不用手动操作。
项目页挂在 `/FuyuBot-docs/` 下，构建所需的 `NEXT_PUBLIC_BASE_PATH` / `NEXT_PUBLIC_SITE_URL` 已写在 workflow 的环境变量里。
