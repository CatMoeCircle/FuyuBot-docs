import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: "export",

  // 为 GitHub Pages 设置基础路径
  basePath: "/FuyuBot-docs",
  assetPrefix: "/FuyuBot-docs/",
  trailingSlash: true,

  // 静态导出时禁用 image 优化（可选，避免依赖服务器）
  images: {
    unoptimized: true,
  },
};

export default withMDX(config);
