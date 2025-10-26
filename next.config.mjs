import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

// 仅在生产环境（或通过自定义 env）下启用 GitHub Pages 前缀
const isProd = process.env.NODE_ENV === "production";
// const isGhPages = process.env.GITHUB_PAGES === "true" || isProd;

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: "export",

  // 为 GitHub Pages 设置基础路径（仅生产环境生效）
  basePath: isProd ? "/FuyuBot-docs" : "",
  assetPrefix: isProd ? "/FuyuBot-docs/" : "",
  trailingSlash: true,

  // 静态导出时禁用 image 优化（可选，避免依赖服务器）
  images: {
    unoptimized: true,
  },
};

export default withMDX(config);
