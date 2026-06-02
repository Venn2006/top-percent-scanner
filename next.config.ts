import type { NextConfig } from "next";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://*.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://us.i.posthog.com https://*.posthog.com https://vitals.vercel-insights.com https://*.vercel-insights.com",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join('; ');

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },

  // Cho phép LAN IP truy cập dev server (chỉ có tác dụng trong development)
  allowedDevOrigins: [
    'localhost:3000',
    '127.0.0.1:3000',
    '192.168.2.9:3000',
    '192.168.2.14:3000',
    '192.168.2.9',
  ],

  // ?? X?A: rewrite proxy /supabase-proxy ? t?o attack surface kh?ng c?n thi?t.
  // Tất cả query Supabase đều đi qua API routes server-side.
  async headers() {
    const securityHeaders = [
      {
        key: 'Content-Security-Policy',
        value: csp,
      },
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
