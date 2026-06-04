import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('app/my-progress/page.tsx', 'utf8');
const historyRoute = fs.readFileSync('app/api/history/route.ts', 'utf8');
const reportPage = fs.readFileSync('app/report/page.tsx', 'utf8');
const roadmapPage = fs.readFileSync('app/roadmap/page.tsx', 'utf8');

const checks = {
  recoverySummary: false,
  multipleCards: false,
  noAutoOpenFirst: false,
  maskedAccess: false,
  exactAccessOnly: false,
  noGenerateFromMyProgress: false,
  paidNoRoadmapState: false,
  roadmapProgress: false,
  reportRestore: false,
  roadmapResumeRegression: false,
  certificateAction: false,
};

assert.match(historyRoute, /type RecoveryItem/, 'history API must expose a typed recovery summary');
assert.match(historyRoute, /product:\s*'report29' \| 'roadmap79'/, 'recovery summary must include both 29K and 79K products');
assert.match(historyRoute, /from\('purchases'\)[\s\S]*from\('roadmaps'\)/, 'phone lookup must include purchases and roadmaps');
checks.recoverySummary = true;

assert.match(page, /recoveries\.map\(item => \([\s\S]*<RecoveryCard key=\{item\.id\}/, 'my-progress must render all recovery cards, not only first record');
assert.doesNotMatch(page, /recoveries\[0\][\s\S]{0,120}(window\.location|router\.push|href)/, 'my-progress must not auto-open the first recovery record');
checks.multipleCards = true;
checks.noAutoOpenFirst = true;

assert.match(historyRoute, /function maskAccessCode/, 'phone-only summary must mask access codes');
assert.match(historyRoute, /maskedAccessCode: maskAccessCode\(/, 'recovery items must carry masked access code');
assert.match(historyRoute, /id: `report29:\$\{maskAccessCode\(vspiId\)\}/, '29K phone-only recovery id must not expose full VSPI');
assert.match(historyRoute, /id: `roadmap79:\$\{maskAccessCode\(fullAccessCode\)\}/, '79K phone-only recovery id must not expose full access code');
assert.doesNotMatch(page, /\{item\.accessCode\}/, 'phone-only card must not render full accessCode directly');
checks.maskedAccess = true;

assert.match(historyRoute, /reportAccessMatches\(vspiId, accessCode\)/, '29K full report access must require matching VSPI/access');
assert.match(historyRoute, /roadmapAccessCodeMatches\(vspiId, accessCode\)/, '79K full roadmap access must require matching access code');
assert.match(historyRoute, /\.\.\.\(verified \? \{ vspiId, accessCode/, 'full open identifiers must only be returned after verified access');
checks.exactAccessOnly = true;

assert.doesNotMatch(page, /fetch\([^)]*\/api\/roadmap\/generate/, 'my-progress must not call roadmap generation/recovery API directly');
assert.doesNotMatch(page, /method:\s*['"]POST['"][\s\S]{0,120}\/api\/roadmap\/generate/, 'my-progress must never POST roadmap generate');
checks.noGenerateFromMyProgress = true;

assert.match(historyRoute, /Đã mở khóa — tạo lộ trình/, 'paid 79K without roadmap_json must show paid recovery/generate state');
assert.match(page, /Chưa tạo roadmap/, 'my-progress card must distinguish paid no-roadmap state from generated progress');
checks.paidNoRoadmapState = true;

assert.match(historyRoute, /countActionTasks/, 'history API must count roadmap tasks from roadmap_json');
assert.match(historyRoute, /countCompletedTasks/, 'history API must count completed task_progress');
assert.match(page, /\$\{item\.progressDone\}\/\$\{item\.progressTotal\} việc/, 'my-progress must render X/Y progress for generated roadmaps');
checks.roadmapProgress = true;

assert.match(reportPage, /new URLSearchParams\(window\.location\.search\)/, 'report page must support query restore from verified recovery card');
assert.match(reportPage, /\/api\/report-lookup/, 'report restore must still use protected report lookup API');
checks.reportRestore = true;

assert.match(roadmapPage, /openExistingRoadmap\(\{[\s\S]*phone: queryRestorePhone[\s\S]*\}\)/, 'existing roadmap restore by phone/access must remain wired');
assert.match(roadmapPage, /return resumeExistingRoadmap/, 'existing roadmap reopen must resume, not regenerate');
checks.roadmapResumeRegression = true;

assert.match(page, /Tải chứng nhận/, 'eligible roadmap cards must offer certificate action');
checks.certificateAction = true;

console.log(JSON.stringify({ passed: true, checks }, null, 2));
