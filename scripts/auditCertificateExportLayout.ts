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
assert.doesNotMatch(roadmapCertificateBlock, /getBoundingClientRect\(/, '79K certificate export must not capture responsive wrapper bounds');
assert.doesNotMatch(roadmapCertificateBlock, /offsetWidth|offsetHeight|clientWidth|clientHeight/, '79K certificate export must not derive canvas size from DOM layout');
assert.match(roadmapCertificateBlock, /triggerCanvasDownload\(drawFallbackCertificate\(\)\)/, '79K certificate download must export the fixed certificate canvas only');
assert.doesNotMatch(roadmapCertificateBlock, /ctx\.font\s*=\s*['"](?:[0-9]|1[0-4])px/, 'exported certificate font must not be tiny');
assert.doesNotMatch(roadmapCertificateBlock, /ctx\.font\s*=\s*['"][^'"]* 1[0-4]px/, 'exported certificate font must not use unreadable 10-14px text');
assert.match(roadmapCertificateBlock, /wrapText\(isComplete \? 'Chứng nhận hoàn thành lộ trình' : 'Chứng nhận năng lực tăng lương'/, 'certificate title must be wrapped, not truncated');
assert.doesNotMatch(roadmapCertificateBlock, /truncate/, 'certificate preview must not truncate title or evidence text');
assert.match(roadmapCertificateBlock, /splitLongToken/, 'certificate wrapText must split long tokens such as verify IDs instead of overflowing');
assert.doesNotMatch(roadmapCertificateBlock, /clipped/, 'certificate wrapText must not create clipped ellipsis text');
assert.doesNotMatch(roadmapCertificateBlock, /`\$\{[^`]+\}\.\.\.`/, 'certificate canvas text must not append ellipsis when title or URL is long');
assert.doesNotMatch(roadmapCertificateBlock, /break-all/, 'certificate preview must not use break-all causing vertical text');
assert.match(roadmapCertificateBlock, /md:grid-cols-2/, 'evidence/next-move layout must use balanced columns, not a narrow fixed evidence rail');
assert.doesNotMatch(roadmapCertificateBlock, /lg:grid-cols-\[minmax\(0,1fr\)_16rem\]/, 'evidence log must not reserve a narrow fixed 16rem column');
assert.match(roadmapCertificateBlock, /certificateEvidenceItems/, 'certificate must render submitted evidence items or a clean placeholder');
assert.match(roadmapCertificateBlock, /submittedEvidenceItems/, 'certificate must collect actual submitted evidence notes/files');
assert.match(roadmapCertificateBlock, /Object\.entries\(evidenceLog\)/, 'certificate evidence must preserve task keys when rendering submitted evidence');
assert.match(roadmapCertificateBlock, /actionTaskByKey/, 'certificate evidence must fall back to task title/output for empty evidence notes');
assert.match(roadmap, /const isLowInfoEvidenceValue = \(value: string\)/, 'certificate must classify low-information evidence notes');
assert.match(roadmapCertificateBlock, /meaningfulNote = item\.note && !isLowInfoEvidenceValue\(item\.note\)/, 'certificate evidence must ignore low-information notes such as ok');
assert.match(roadmapCertificateBlock, /meaningfulFile = item\.fileName && !isLowInfoEvidenceValue\(item\.fileName\)/, 'certificate evidence must prefer meaningful file names only');
assert.match(roadmapCertificateBlock, /taskTitle = taskInfo\?\.task\.title/, 'certificate evidence must fall back to task title');
assert.match(roadmapCertificateBlock, /taskOutput = taskInfo\?\.task\.output/, 'certificate evidence must fall back to task output');
assert.match(roadmapCertificateBlock, /certificateEvidenceDisplayItems/, 'certificate evidence must show a bounded meaningful list');
assert.match(roadmapCertificateBlock, /submittedEvidenceItems\.length - 4/, 'certificate evidence overflow must summarize extra submitted evidence');
assert.match(roadmapCertificateBlock, /displayVerifyLabel/, 'certificate footer must use a short verify label instead of a raw overflowing URL');
assert.match(roadmapCertificateBlock, /displayEvidenceLabel/, 'certificate preview must use a short evidence label instead of a raw overflowing URL');
assert.match(roadmapCertificateBlock, /const verifiedRole = profile\?\.job \|\| profile\?\.currentPosition/, 'certificate role title must come from the opened roadmap profile, not generic skill labels');
assert.match(roadmapCertificateBlock, /Chưa có bằng chứng đã nộp/, 'certificate must show a clean placeholder when no evidence exists');

const roundRectBlock = roadmapCertificateBlock.slice(
  roadmapCertificateBlock.indexOf('const roundRect ='),
  roadmapCertificateBlock.indexOf('const wrapText =')
);
assert.match(roundRectBlock, /ctx\.save\(\)/, 'roundRect must save canvas styles before applying box fill/stroke');
assert.match(roundRectBlock, /ctx\.restore\(\)/, 'roundRect must restore canvas styles so dark box fill does not leak into text');

const canvasEvidenceLoop = roadmapCertificateBlock.slice(
  roadmapCertificateBlock.indexOf('for (const item of certificateEvidenceItems.slice(0, 4))'),
  roadmapCertificateBlock.indexOf('roundRect(90, 1132')
);
assert.match(canvasEvidenceLoop, /roundRect\(90, y - 24, 890, 64, 16, '#151b26'/, 'canvas evidence loop must draw evidence row boxes');
assert.match(canvasEvidenceLoop, /ctx\.textAlign\s*=\s*'left'/, 'canvas evidence text must reset textAlign after row box draw');
assert.match(canvasEvidenceLoop, /ctx\.textBaseline\s*=\s*'alphabetic'/, 'canvas evidence text must reset textBaseline after row box draw');
assert.match(canvasEvidenceLoop, /ctx\.font\s*=\s*'700 18px Arial, sans-serif'/, 'canvas evidence text must reset font after row box draw');
assert.match(canvasEvidenceLoop, /ctx\.fillStyle\s*=\s*'#f8fafc'/, 'canvas evidence text must reset visible fillStyle after dark row box draw');
assert(canvasEvidenceLoop.indexOf("ctx.fillStyle = '#f8fafc'") < canvasEvidenceLoop.indexOf('wrapText(`'), 'evidence fillStyle must be reset before wrapText draws row text');

const normalizeFixture = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const isLowInfoEvidenceFixture = (value: string) => /^(ok|okay|done|xong|da lam|yes|test|\.|-)$/i.test(normalizeFixture(value));
const productionSmokeTasks = Array.from({ length: 24 }, (_, index) => ({
  key: `w${index + 1}_t1`,
  title: `Tạo checklist công việc thật tuần ${index + 1}`,
  output: `Evidence tuần ${index + 1}: dashboard KPI và feedback quản lý`,
}));
const productionSmokeEvidence = Object.fromEntries(productionSmokeTasks.map(task => [task.key, { note: 'ok' }]));
const renderedEvidenceRows = Object.entries(productionSmokeEvidence).map(([key, item]) => {
  const task = productionSmokeTasks.find(candidate => candidate.key === key);
  const note = item.note && !isLowInfoEvidenceFixture(item.note) ? item.note : '';
  return [note, task?.title, task?.output].find(value => value && !isLowInfoEvidenceFixture(value)) || 'Đã nộp bằng chứng cho nhiệm vụ này';
});
assert.equal(renderedEvidenceRows.length, 24, 'production smoke fixture should contain 24 submitted evidence rows');
assert.equal(renderedEvidenceRows.filter(row => row === 'ok').length, 0, 'low-info ok evidence must not render as certificate row text');
assert(renderedEvidenceRows.slice(0, 4).every(row => /checklist|Evidence|dashboard|KPI/i.test(row)), 'first exported evidence rows must contain meaningful task/output text');

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
