import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'fuyubot';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

/**
 * **本仓**（文档站）：每篇文档的 MDX 原文都在 `content/docs/**` 里。
 *
 * ⚠️ 文档页右下角那个「Open in GitHub」拼的是 `<repo>/blob/<branch>/content/docs/<path>`，
 * 所以这里必须是**这一个**仓库——以前写的是运行时本体，点过去是另一个仓库的同名路径，
 * 一律 404。
 */
export const gitConfig = {
  user: 'CatMoeCircle',
  repo: 'FuyuBot-docs',
  branch: 'main',
};

/**
 * **运行时本体**（框架源码）。导航栏右上角那个 GitHub 按钮指向它。
 *
 * 它和 [`gitConfig`] 不是同一个仓库，**别合并成一个常量**：一个是「这篇文档在哪改」，
 * 一个是「这个项目源码在哪」，混起来必然有一边错。
 */
export const runtimeGitConfig = {
  user: 'CatMoeCircle',
  repo: 'Fuyu-Bot',
};

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'image.png'];

  return { segments, url: getImageUrl(segments, page.locale) };
}
