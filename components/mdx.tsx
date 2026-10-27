import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Mermaid } from '@/components/mdx/mermaid';
import { CodePre } from '@/components/mdx/code-block';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    // 代码块：自动带上语言图标 + 语言名（见 components/mdx/code-block.tsx）
    pre: CodePre,
    Mermaid,
    // `<TypeTable type={{ … }} />`：写参数表用，不写 markdown 表格也行
    // （fumadocs 的 TypeTable 会把每个字段渲染成可折叠的一行，长描述更好读）。
    TypeTable,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
