import { readFileSync } from 'node:fs';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readPngSize(filePath: string) {
  const buffer = readFileSync(filePath);
  assert(buffer.toString('ascii', 1, 4) === 'PNG', `${filePath} is not a PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bytes: buffer.length,
  };
}

const staticImages = ['public/og-image.png', 'public/roadmap-og-image.png'].map((filePath) => ({
  filePath,
  ...readPngSize(filePath),
}));

for (const image of staticImages) {
  assert(image.width === 1200 && image.height === 630, `${image.filePath} must be 1200x630, got ${image.width}x${image.height}`);
  assert(image.bytes < 8 * 1024 * 1024, `${image.filePath} is over Facebook OG size limit`);
}

const ogRoute = readFileSync('app/api/og/route.tsx', 'utf8');
assert(/width:\s*1200/.test(ogRoute), 'dynamic OG route must render 1200 width');
assert(/height:\s*630/.test(ogRoute), 'dynamic OG route must render 630 height');
assert(/width:\s*900/.test(ogRoute), 'dynamic OG content card should stay inside horizontal safe area');
assert(/height:\s*460/.test(ogRoute), 'dynamic OG content card should stay inside vertical safe area');
assert(/left:\s*72/.test(ogRoute), 'dynamic OG primary copy should be inset from card edge');
assert(/right:\s*66/.test(ogRoute), 'dynamic OG Top badge should be inset from card edge');

console.log(JSON.stringify({
  staticImages,
  dynamicRoute: {
    size: '1200x630',
    contentCard: '900x460',
    safeArea: true,
  },
  passed: true,
}, null, 2));

