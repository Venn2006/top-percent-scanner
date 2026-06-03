import fs from 'node:fs';
import assert from 'node:assert/strict';

const roadmap = fs.readFileSync('app/roadmap/page.tsx', 'utf8');
const scanner = fs.readFileSync('app/components/TopPercentScanner.tsx', 'utf8');
const premium = fs.readFileSync('app/components/PremiumSection.tsx', 'utf8');

const roadmapCertificateBlock = roadmap.slice(
  roadmap.indexOf('function RoadmapCompletionReward'),
  roadmap.indexOf('function EvidenceVaultCard')
);
assert(roadmapCertificateBlock.length > 1000, 'roadmap certificate block must be found');

assert.match(roadmap, /const CERT_EXPORT_WIDTH\s*=\s*1080/, '79K certificate export width must be fixed at 1080');
assert.match(roadmap, /const CERT_EXPORT_HEIGHT\s*=\s*1350/, '79K certificate export height must be fixed at 1350');
assert.match(roadmapCertificateBlock, /canvas\.width\s*=\s*CERT_EXPORT_WIDTH/, '79K canvas must use fixed export width');
assert.match(roadmapCertificateBlock, /canvas\.height\s*=\s*CERT_EXPORT_HEIGHT/, '79K canvas must use fixed export height');
assert.doesNotMatch(roadmapCertificateBlock, /html2canvas\(/, '79K certificate download must not depend on responsive DOM capture');
assert.doesNotMatch(roadmapCertificateBlock, /ctx\.font\s*=\s*['"](?:[0-9]|1[0-4])px/, 'exported certificate font must not be tiny');
assert.doesNotMatch(roadmapCertificateBlock, /ctx\.font\s*=\s*['"][^'"]* 1[0-4]px/, 'exported certificate font must not use unreadable 10-14px text');
assert.match(roadmapCertificateBlock, /wrapText\(isComplete \? 'Chứng nhận hoàn thành lộ trình' : 'Chứng nhận năng lực tăng lương'/, 'certificate title must be wrapped, not truncated');
assert.doesNotMatch(roadmapCertificateBlock, /truncate/, 'certificate preview must not truncate title or evidence text');
assert.doesNotMatch(roadmapCertificateBlock, /break-all/, 'certificate preview must not use break-all causing vertical text');
assert.match(roadmapCertificateBlock, /md:grid-cols-2/, 'evidence/next-move layout must use balanced columns, not a narrow fixed evidence rail');
assert.doesNotMatch(roadmapCertificateBlock, /lg:grid-cols-\[minmax\(0,1fr\)_16rem\]/, 'evidence log must not reserve a narrow fixed 16rem column');
assert.match(roadmapCertificateBlock, /certificateEvidenceItems/, 'certificate must render submitted evidence items or a clean placeholder');
assert.match(roadmapCertificateBlock, /submittedEvidenceItems/, 'certificate must collect actual submitted evidence notes/files');
assert.match(roadmapCertificateBlock, /Chưa có bằng chứng đã nộp/, 'certificate must show a clean placeholder when no evidence exists');

const gluedTerms = ['Cỡxay', 'thời gianchiết', 'sữacà', 'bòsữa', 'Cá»¡xay', 'thá»i gianchiáº¿t', 'sá»¯acÃ ', 'bÃ²sá»¯a'];
const gluedHits = gluedTerms.filter(term => roadmap.includes(term));
assert.equal(gluedHits.length, 0, `roadmap certificate/layout contains glued terms: ${gluedHits.join(', ')}`);
assert(roadmap.includes(".replace(/\\s*\\/\\s*/g, ' / ')") || roadmap.includes(".replace(/\\s*\\\\/\\s*/g, ' / '),"), 'humanizeWorkCopy must add spaces around slash-separated skills');

const mojibakeMarkers = ['Ãƒ', 'Ã‚', 'Ã„', 'Ã†', 'Ã¡Â»', 'Ã¡Âº', 'Ã¢â‚¬', 'ï¿½'];
const mojibakeHits = mojibakeMarkers.filter(marker => roadmapCertificateBlock.includes(marker));
assert.equal(mojibakeHits.length, 0, `79K certificate block contains mojibake markers: ${mojibakeHits.join(', ')}`);

// Keep the existing 29K certificate smoke covered as a regression, but the 79K roadmap certificate is the owner-reported bug.
assert.match(scanner, /CERT_EXPORT_WIDTH\s*=\s*1080/, '29K certificate export width must remain fixed at 1080');
assert.match(scanner, /CERT_EXPORT_HEIGHT\s*=\s*1350/, '29K certificate export height must remain fixed at 1350');
assert.match(premium, /id="vspi-certificate"/, 'in-app 29K certificate node must still exist for preview');

console.log(JSON.stringify({
  passed: true,
  roadmapCertificate: {
    dimensions: '1080x1350',
    html2canvasCapture: false,
    evidenceContent: 'submitted evidence or clean placeholder',
    narrowEvidenceRail: false,
    mojibakeHits,
    gluedHits,
  },
}, null, 2));
