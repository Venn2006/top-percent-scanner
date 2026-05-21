/**
 * Dynamic OG Image API — dùng khi user share kết quả cá nhân.
 *
 * URL: /api/og?pct=12&job=Marketing&name=Nguyen+Van+A
 *
 * Cách dùng trong ShareButton (TopPercentScanner.tsx):
 *   const shareUrl = `https://top-percent-scanner.vercel.app?utm_source=share&pct=${percent}&job=${encodeURIComponent(job)}`;
 *   // Facebook/Zalo crawler sẽ đọc og:image từ meta tag của trang chủ,
 *   // nhưng nếu muốn ảnh cá nhân hóa, trỏ og:image thẳng vào route này:
 *   const ogImageUrl = `https://top-percent-scanner.vercel.app/api/og?pct=${percent}&job=${encodeURIComponent(job)}`;
 */
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// Màu ring theo percent — giống getRingColor() ở client
function getRingColor(p: number): string {
  if (p <= 5)  return '#FFD700';
  if (p <= 10) return '#00E676';
  if (p <= 20) return '#40C4FF';
  if (p <= 50) return '#FF9100';
  return '#FF5252';
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const pct  = Math.min(100, Math.max(1, Number(searchParams.get('pct')  ?? 50)));
  const job  = (searchParams.get('job')  ?? 'Việt Nam').slice(0, 40);
  const name = (searchParams.get('name') ?? '').slice(0, 30);

  const ringColor  = getRingColor(pct);
  const isElite    = pct <= 10;
  const badgeText  = isElite ? '🏆 Elite' : `Top ${pct}%`;

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
        {/* Glow màu theo ring */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '500px',
            height: '350px',
            background: `radial-gradient(ellipse, ${ringColor}22 0%, transparent 70%)`,
          }}
        />

        {/* Viền */}
        <div
          style={{
            position: 'absolute',
            inset: '20px',
            border: `2px solid ${ringColor}40`,
            borderRadius: '24px',
          }}
        />

        {/* Brand */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '28px',
          }}
        >
          <div
            style={{
              background: '#e8b84b',
              color: '#0a0c10',
              fontWeight: 900,
              fontSize: '13px',
              padding: '5px 12px',
              borderRadius: '999px',
            }}
          >
            VSPI SCANNER
          </div>
          <span style={{ color: 'rgba(240,237,232,0.3)', fontSize: '13px' }}>
            Vietnam Salary Percentile Index 2026
          </span>
        </div>

        {/* Big percent */}
        <div
          style={{
            fontSize: '120px',
            fontWeight: 900,
            color: ringColor,
            lineHeight: 1,
            marginBottom: '8px',
            textShadow: `0 0 60px ${ringColor}55`,
          }}
        >
          Top {pct}%
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '28px',
            color: 'rgba(240,237,232,0.7)',
            marginBottom: '6px',
            textAlign: 'center',
          }}
        >
          thu nhập ngành{' '}
          <span style={{ color: '#f0ede8', fontWeight: 700 }}>{job}</span>
          {' '}tại Việt Nam
        </div>

        {/* Name nếu có */}
        {name && (
          <div
            style={{
              fontSize: '20px',
              color: '#e8b84b',
              fontWeight: 700,
              marginBottom: '4px',
            }}
          >
            {name}
          </div>
        )}

        {/* Elite badge */}
        {isElite && (
          <div
            style={{
              marginTop: '12px',
              background: 'rgba(232,184,75,0.12)',
              border: '1px solid rgba(232,184,75,0.4)',
              color: '#e8b84b',
              fontSize: '16px',
              fontWeight: 700,
              padding: '6px 18px',
              borderRadius: '999px',
            }}
          >
            {badgeText} — Nhóm dẫn đầu thị trường
          </div>
        )}

        {/* CTA */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <div
            style={{
              background: '#e8b84b',
              color: '#0a0c10',
              fontWeight: 900,
              fontSize: '16px',
              padding: '8px 24px',
              borderRadius: '999px',
            }}
          >
            Kiểm tra vị trí của bạn — Miễn phí
          </div>
          <div
            style={{
              color: 'rgba(240,237,232,0.25)',
              fontSize: '13px',
              fontFamily: 'monospace',
            }}
          >
            top-percent-scanner.vercel.app
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
