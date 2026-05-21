/**
 * Static OG image cho trang chủ (default fallback).
 * Next.js tự động serve file này tại /opengraph-image
 * và inject vào <meta property="og:image"> của trang /.
 *
 * Kích thước chuẩn: 1200×630 (Facebook, Zalo, Twitter đều dùng được).
 */
import { ImageResponse } from 'next/og';

export const runtime = 'edge'; // Edge runtime — render nhanh, không cold start
export const alt    = 'VSPI Scanner — Bạn đang ở Top mấy % thu nhập Việt Nam?';
export const size   = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0c10',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow vàng nền */}
        <div
          style={{
            position: 'absolute',
            top: '-80px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '600px',
            height: '400px',
            background: 'radial-gradient(ellipse, rgba(232,184,75,0.18) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Viền vàng */}
        <div
          style={{
            position: 'absolute',
            inset: '20px',
            border: '2px solid rgba(232,184,75,0.25)',
            borderRadius: '24px',
          }}
        />

        {/* Logo / Brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              background: '#e8b84b',
              color: '#0a0c10',
              fontWeight: 900,
              fontSize: '14px',
              padding: '6px 14px',
              borderRadius: '999px',
              letterSpacing: '0.08em',
            }}
          >
            VSPI SCANNER
          </div>
          <span style={{ color: 'rgba(240,237,232,0.35)', fontSize: '13px' }}>
            Vietnam Salary Percentile Index 2026
          </span>
        </div>

        {/* Headline chính */}
        <div
          style={{
            fontSize: '72px',
            fontWeight: 900,
            color: '#f0ede8',
            textAlign: 'center',
            lineHeight: 1.1,
            marginBottom: '16px',
            maxWidth: '900px',
          }}
        >
          Lương bạn đang ở{' '}
          <span style={{ color: '#e8b84b', fontStyle: 'italic' }}>Top mấy %</span>
          ?
        </div>

        {/* Sub-headline */}
        <div
          style={{
            fontSize: '26px',
            color: 'rgba(240,237,232,0.55)',
            textAlign: 'center',
            maxWidth: '780px',
            lineHeight: 1.4,
            marginBottom: '40px',
          }}
        >
          Đối chiếu với 53.3 triệu người lao động Việt Nam · Miễn phí · 30 giây
        </div>

        {/* Data source badges */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {['Adecco 2026', 'ITviec', 'VietnamWorks', 'GSO'].map((src) => (
            <div
              key={src}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(240,237,232,0.6)',
                fontSize: '14px',
                fontWeight: 600,
                padding: '6px 14px',
                borderRadius: '999px',
              }}
            >
              {src}
            </div>
          ))}
        </div>

        {/* URL footer */}
        <div
          style={{
            position: 'absolute',
            bottom: '36px',
            color: 'rgba(240,237,232,0.2)',
            fontSize: '14px',
            fontFamily: 'monospace',
            letterSpacing: '0.05em',
          }}
        >
          top-percent-scanner.vercel.app
        </div>
      </div>
    ),
    {
      ...size,
      // Không cần load font ngoài — dùng system-ui để tránh lỗi edge runtime
    }
  );
}
