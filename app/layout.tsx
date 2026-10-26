import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import type { Metadata, Viewport } from 'next';
import { ThemeColorPicker } from '@/components/theme-color-picker';

/**
 * 移动端浏览器 UI（地址栏 / 状态栏）跟着系统深浅色走。
 * 色值与 fumadocs neutral 主题的背景色一致：
 * light `hsl(0 0% 96%)` / dark `hsl(0 0% 7.04%)`（见 fumadocs-ui/css/lib/default-colors.css）。
 * 右下角的主题**色**只改强调色、不改背景，所以这里不需要跟着变。
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f5' },
    { media: '(prefers-color-scheme: dark)', color: '#121212' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'fuyubot 文档',
    template: '%s · fuyubot',
  },
  description: '基于 TDLib 的 Telegram bot / user 框架：Rust 内核 + C ABI 插件 + 多语言 SDK。',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-CN" data-color="blue" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen antialiased">
        <RootProvider
          search={{
            // 静态部署：检索在浏览器里做，索引是构建期写死的静态 JSON。
            options: { type: 'static' },
          }}
        >
          {children}
          <ThemeColorPicker />
        </RootProvider>
      </body>
    </html>
  );
}
