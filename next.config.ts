import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN IPs to access dev server without being blocked by Next.js HMR protection
  allowedDevOrigins: [
    'localhost:3000',
    '127.0.0.1:3000',
    '192.168.2.9:3000',
    '192.168.2.14:3000',
    '192.168.2.9'
  ],
  async rewrites() {
    return [
      {
        source: '/supabase-proxy/:path*',
        destination: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/:path*`
      }
    ]
  }
} as NextConfig;

export default nextConfig;