import '@/app/global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
});

// 将 metadataBase 设为 GitHub Pages 地址
export const metadata = {
  metadataBase: new URL('https://catmoecircle.github.io/FuyuBot-docs/'),
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-cn" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
