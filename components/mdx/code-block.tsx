import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import { LANGUAGE_LABELS } from '@/lib/code-icons';

/**
 * MDX 里 ``` 代码块最终会走到这个组件（在 `components/mdx.tsx` 里注册成 `pre`）。
 *
 * 它做两件事：
 *
 * 1. **认语言**：`source.config.ts` 开了 `addLanguageClass`，所以内层 `<code>` 的
 *    className 里带着 `language-xxx`——从这儿把它抠出来；
 * 2. **挂标题栏**：把 `transformerIcon` 注入的 `icon`（一段 SVG HTML）交给 `CodeBlock`。
 *
 * 为什么要这一步：fumadocs 的 `CodeBlock` **只有在传了 `title` 时才渲染图标**
 * （图标就是标题栏左半边），所以「要看到语言图标」=「必须给标题」。这里的标题就是语言名，
 * 算是把这个限制变成「代码块自带语言标识」。
 *
 * 没配语言名的语言（`text` / `plaintext` 之类）走原样渲染：不加标题栏也不加图标，
 * 那种块本来就不是「代码」，套一层壳只会变吵。
 */
type CodePreProps = Omit<ComponentProps<'pre'>, 'title'> & {
  /** `transformerIcon` 注入的整段图标 HTML（只有 registered 的语言才有）。 */
  icon?: string;
  /** 作者用 ```ts title="文件名" 显式指定的标题；给了就优先用它。 */
  title?: ReactNode;
};

function languageOf(children: ReactNode): string | undefined {
  let language: string | undefined;

  Children.forEach(children, (child) => {
    if (language || !isValidElement(child)) return;
    const className = (child.props as { className?: unknown }).className;
    if (typeof className !== 'string') return;
    language = className.match(/language-([\w+#.-]+)/)?.[1];
  });

  return language;
}

export function CodePre({ children, icon, title, ...props }: CodePreProps) {
  const language = languageOf(children);
  const label = language ? LANGUAGE_LABELS[language.toLowerCase()] : undefined;
  const resolved = title ?? label;

  return (
    <CodeBlock {...props} icon={icon} title={resolved}>
      <Pre>{children}</Pre>
    </CodeBlock>
  );
}
