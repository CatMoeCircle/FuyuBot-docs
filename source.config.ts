import {
  rehypeCodeDefaultOptions,
  remarkMdxMermaid,
} from 'fumadocs-core/mdx-plugins';
import { defineConfig } from 'fumadocs-mdx/config';
import { CODE_ICON_EXTEND } from './lib/code-icons';

// 全局 MDX 配置：集合仍由 lib/source.ts 的 `defineDocs` 宏声明，
// 这里只挂全局插件。`remarkMdxMermaid` 把 ```mermaid 代码块自动
// 转成 <Mermaid chart="..." /> 组件（组件注册见 components/mdx.tsx）。
export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
    rehypeCodeOptions: {
      // 默认值铺开再覆盖：`rehypeCode` 内部本来也会做这个浅合并，但它的选项类型是
      // 「完整的一份配置」（带 `theme` 那种），不铺开的话 TS 不给过。
      // 顺带保证默认的 transformers（`// [!code highlight]` 那套注释语法）还在。
      ...rehypeCodeDefaultOptions,
      // 把 `language-xxx` class 打到 <code> 上：组件层靠它认语言
      // （components/mdx/code-block.tsx 用它选标题栏与语言名）。
      addLanguageClass: true,
      // 语言图标。**不要**自己 new 一个 `transformerIcon` 塞进 `transformers`：
      // `rehypeCode` 会在 transformers 之后自己再追加一个 `transformerIcon(options.icon)`，
      // 那样写会被它覆盖回默认的「文件」图标。
      icon: { extend: CODE_ICON_EXTEND },
    },
  },
});
