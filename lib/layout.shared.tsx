import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

// 静态导出 + 项目页：站点挂在 /FuyuBot-docs/ 下，所以图片路径要自己带 basePath
// （public/ 里的资源不会被 Next 自动加前缀；app/icon.png 这类元数据路由会，但路径带 hash）。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

// 四个分类不在这里列：它们由 docs 布局的 root folder 渲染成侧栏顶部的下拉（见 app/docs/layout.tsx）。
// 这里只放首页也会用到的品牌、导航与 GitHub 入口。
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2 font-semibold">
          {/* 组织头像，与标签页图标同一张（app/icon.png，构建后落在 out/icon.png） */}
          <img
            src={`${basePath}/icon.png`}
            alt=""
            width={24}
            height={24}
            className="size-6 rounded-full object-cover ring-1 ring-fd-border"
          />
          {appName}
        </span>
      ),
    },
    links: [{ text: '文档', url: '/docs/' }],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
