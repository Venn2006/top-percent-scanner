import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

function getRingColor(percent: number): string {
  if (percent <= 5) return '#FFD700';
  if (percent <= 10) return '#00E676';
  if (percent <= 20) return '#40C4FF';
  if (percent <= 50) return '#FF9100';
  return '#FF5252';
}

function cleanText(value: string, fallback: string, max = 42) {
  const cleaned = value.replace(/[<>]/g, '').trim();
  return (cleaned || fallback).slice(0, max);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const percent = Math.min(100, Math.max(1, Number(searchParams.get('pct') ?? 50)));
  const job = cleanText(searchParams.get('job') ?? '', 'thi truong lao dong Viet Nam');
  const confidence = Math.min(100, Math.max(0, Number(searchParams.get('confidence') ?? 0)));
  const ringColor = getRingColor(percent);

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
          fontFamily: 'Arial, sans-serif',
          position: 'relative',
          overflow: 'hidden',
          color: '#f0ede8',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 8,
            background: '#e8b84b',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 28,
            border: `2px solid ${ringColor}55`,
            borderRadius: 28,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 34 }}>
          <div
            style={{
              background: '#e8b84b',
              color: '#0a0c10',
              fontWeight: 900,
              fontSize: 18,
              padding: '8px 18px',
              borderRadius: 999,
            }}
          >
          {'VSPI SCANNER'}
          </div>
          <div style={{ color: 'rgba(240,237,232,0.45)', fontSize: 18 }}>
            Vietnam Salary Percentile Index
          </div>
        </div>
        <div
          style={{
            fontSize: 138,
            fontWeight: 900,
            lineHeight: 1,
            color: ringColor,
            textShadow: `0 0 52px ${ringColor}55`,
          }}
        >
          {`Top ${percent}%`}
        </div>
        <div
          style={{
            marginTop: 22,
            maxWidth: 900,
            textAlign: 'center',
            fontSize: 34,
            fontWeight: 700,
            color: '#f0ede8',
          }}
        >
          {`Nganh ${job}`}
        </div>
        <div
          style={{
            marginTop: 18,
            display: 'flex',
            gap: 14,
            fontSize: 18,
            color: 'rgba(240,237,232,0.68)',
          }}
        >
          <div
            style={{
              border: '1px solid rgba(232,184,75,0.35)',
              borderRadius: 999,
              padding: '8px 18px',
              background: 'rgba(232,184,75,0.08)',
              color: '#e8b84b',
              fontWeight: 800,
            }}
          >
            {confidence > 0 ? `Confidence ${confidence}/100` : 'Confidence shown in app'}
          </div>
          <div
            style={{
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 999,
              padding: '8px 18px',
              background: 'rgba(255,255,255,0.04)',
            }}
          >
            {'Khong hien thi luong ca nhan'}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 44,
            fontSize: 22,
            fontWeight: 900,
            color: '#e8b84b',
          }}
        >
          {'top-percent-scanner.vercel.app'}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
