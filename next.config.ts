import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cho phép LAN IP truy cập dev server (chỉ có tác dụng trong development)
  allowedDevOrigins: [
    'localhost:3000',
    '127.0.0.1:3000',
    '192.168.2.9:3000',
    '192.168.2.14:3000',
    '192.168.2.9',
  ],

  // ĐÃ XÓA: rewrite proxy /supabase-proxy → tạo attack surface không cần thiết.
  // Tất cả query Supabase đều đi qua API routes server-side.
  async headers() {
    const securityHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
    ];
    const noStoreHeaders = [
      {
        key: 'Cache-Control',
        value: 'no-store, no-cache, must-revalidate, max-age=0',
      },
    ];
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/', headers: noStoreHeaders },
      { source: '/roadmap', headers: noStoreHeaders },
    ];
  },
} satisfies NextConfig;

export default nextConfig;
