import fs from 'node:fs';
import assert from 'node:assert/strict';

const scanner = fs.readFileSync('app/components/TopPercentScanner.tsx', 'utf8');
const premium = fs.readFileSync('app/components/PremiumSection.tsx', 'utf8');

assert.match(scanner, /CERT_EXPORT_WIDTH\s*=\s*1080/, 'certificate export width must be fixed at 1080');
assert.match(scanner, /CERT_EXPORT_HEIGHT\s*=\s*1350/, 'certificate export height must be fixed at 1350');
assert.match(scanner, /canvas\.width\s*=\s*CERT_EXPORT_WIDTH/, 'download canvas must use fixed export width');
assert.match(scanner, /canvas\.height\s*=\s*CERT_EXPORT_HEIGHT/, 'download canvas must use fixed export height');
assert.match(scanner, /ctx\.fillRect\(0, 0, 900, 1400\)/, 'fallback drawing must fill the full design background');
assert.match(scanner, /ctx\.scale\(CERT_EXPORT_WIDTH \/ 900, CERT_EXPORT_HEIGHT \/ 1400\)/, 'fixed export must scale the full certificate drawing to canvas');
assert.doesNotMatch(scanner, /html2canvas\(el/, 'certificate download must not depend on responsive DOM capture');
assert.match(scanner, /Top Luong Verified/, 'export must include Top Luong Verified title');
assert.match(scanner, /VSPI ID/, 'export must include VSPI ID');
assert.match(premium, /id="vspi-certificate"/, 'in-app certificate node must still exist for preview');

const mojibakeMarkers = ['Ã', 'Â', 'Ä', 'Æ', 'á»', 'áº', 'â€', '�'];
const exportBlock = scanner.slice(scanner.indexOf('const handleDownloadCertificate'), scanner.indexOf('// Combobox State'));
const mojibakeHits = mojibakeMarkers.filter(marker => exportBlock.includes(marker));
assert.equal(mojibakeHits.length, 0, `certificate export block contains mojibake markers: ${mojibakeHits.join(', ')}`);

console.log(JSON.stringify({
  passed: true,
  dimensions: '1080x1350',
  html2canvasCapture: false,
  mojibakeHits,
}, null, 2));
