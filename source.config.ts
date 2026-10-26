import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { defineConfig } from 'fumadocs-mdx/config';

// 全局 MDX 配置：集合仍由 lib/source.ts 的 `defineDocs` 宏声明，
// 这里只挂全局插件。`remarkMdxMermaid` 把 ```mermaid 代码块自动
// 转成 <Mermaid chart="..." /> 组件（组件注册见 components/mdx.tsx）。
export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
  },
});
