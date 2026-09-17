/** @type {import('next').NextConfig} */

// STATIC_EXPORT=1 时走纯静态导出（EdgeOne Pages / Cloudflare Pages 等 CI 环境）：
// - output: 'export'，产物在 out/
// - pageExtensions 去掉 .ts/.js，使 src/app/api 下的 route.ts 不注册为接口
//   （静态导出不支持服务端 API，否则报 Failed to collect page data）
// 本地开发/普通构建不带该变量，留言板 API（next dev / next start）正常工作。
const isStatic = process.env.STATIC_EXPORT === '1'

const nextConfig = {
  ...(isStatic ? { output: 'export' } : {}),
  pageExtensions: isStatic ? ['tsx', 'jsx'] : ['tsx', 'ts', 'jsx', 'js'],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
