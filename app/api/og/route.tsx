import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

const notoSans = fetch('https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf')
  .then(res => res.arrayBuffer());

function getAccentColor(percent: number): string {
  if (percent <= 10) return '#22c55e';
  if (percent <= 20) return '#38bdf8';
  if (percent <= 50) return '#f59e0b';
  return '#ef4444';
}

function cleanText(value: string, fallback: string, max = 48) {
  const cleaned = value.replace(/[<>]/g, '').trim();
  return (cleaned || fallback).slice(0, max);
}

function cleanId(value: string) {
  return value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 28) || 'VSPI-2026';
}

export async function GET(req: NextRequest) {
  const fontData = await notoSans;
  const { searchParams } = new URL(req.url);
  const percent = Math.min(100, Math.max(1, Number(searchParams.get('pct') ?? 50)));
  const higherThan = Math.max(0, 100 - percent);
  const job = cleanText(searchParams.get('job') ?? '', 'thị trường lao động Việt Nam', 52);
  const confidence = Math.min(100, Math.max(0, Number(searchParams.get('confidence') ?? 78)));
  const rank = cleanText(searchParams.get('rank') ?? '', '#26.650.000', 18);
  const vspiId = cleanId(searchParams.get('vspi') ?? 'VSPI-2026-SHARE');
  const accent = getAccentColor(percent);

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#07090d',
          color: '#f0ede8',
          fontFamily: 'NotoSans',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 78% 18%, rgba(232,184,75,0.16), transparent 34%), radial-gradient(circle at 18% 82%, rgba(56,189,248,0.10), transparent 30%)',
          }}
        />

        <div
          style={{
            width: 1040,
            height: 500,
            borderRadius: 30,
            border: '2px solid rgba(232,184,75,0.52)',
            background: 'linear-gradient(180deg, rgba(18,23,32,0.96), rgba(9,12,18,0.96))',
            boxShadow: '0 32px 100px rgba(0,0,0,0.55)',
            display: 'flex',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 38,
              left: 44,
              right: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div
                style={{
                  width: 116,
                  height: 32,
                  borderRadius: 999,
                  background: '#e8b84b',
                  color: '#0a0c10',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  fontWeight: 900,
                }}
              >
                VSPI
              </div>
              <div style={{ color: 'rgba(240,237,232,0.58)', fontSize: 14, fontWeight: 800 }}>
                Vietnam Salary Percentile Index 2026
              </div>
            </div>
            <div style={{ color: '#e8b84b', fontSize: 16, fontWeight: 900 }}>topluong.com</div>
          </div>

          <div
            style={{
              position: 'absolute',
              left: 52,
              top: 128,
              width: 560,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ fontSize: 46, fontWeight: 900, lineHeight: 1.08 }}>
              Tôi đang ở
            </div>
            <div style={{ marginTop: 4, color: '#e8b84b', fontSize: 76, fontWeight: 900, lineHeight: 1 }}>
              {`Top ${percent}%`}
            </div>
            <div style={{ marginTop: 20, color: 'rgba(240,237,232,0.78)', fontSize: 28, fontWeight: 800, lineHeight: 1.25 }}>
              {`Cao hơn ${higherThan}% người lao động trong nhóm ngành này.`}
            </div>
            <div style={{ marginTop: 12, color: 'rgba(240,237,232,0.54)', fontSize: 18, lineHeight: 1.2 }}>
              Không hiển thị lương cá nhân.
            </div>
          </div>

          <div
            style={{
              position: 'absolute',
              right: 54,
              top: 132,
              width: 300,
              height: 300,
              borderRadius: 999,
              border: '18px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: -18,
                borderRadius: 999,
                border: `18px solid ${accent}`,
                clipPath: 'polygon(50% 0, 100% 0, 100% 100%, 50% 100%)',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ color: 'rgba(240,237,232,0.65)', fontSize: 26, fontWeight: 900 }}>Top</div>
              <div style={{ color: '#f8f5ee', fontSize: 76, fontWeight: 900, lineHeight: 1 }}>{`${percent}%`}</div>
            </div>
          </div>

          <div
            style={{
              position: 'absolute',
              left: 52,
              right: 52,
              bottom: 38,
              display: 'flex',
              gap: 14,
              alignItems: 'stretch',
            }}
          >
            {[
              ['Ngành', job],
              ['Độ tin cậy', `${confidence}/100`],
              ['Xếp hạng ước tính', rank],
              ['Mã kết quả', vspiId],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 58,
                  borderRadius: 16,
                  border: '1px solid rgba(255,255,255,0.11)',
                  background: 'rgba(8,12,18,0.74)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  padding: '0 16px',
                }}
              >
                <div style={{ color: 'rgba(240,237,232,0.42)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>{label}</div>
                <div style={{ marginTop: 3, color: label === 'Độ tin cậy' ? '#e8b84b' : '#f8f5ee', fontSize: 16, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'NotoSans',
          data: fontData,
          style: 'normal',
        },
      ],
    }
  );
}
