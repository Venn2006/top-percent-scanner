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
} satisfies NextConfig;

export default nextConfig;
