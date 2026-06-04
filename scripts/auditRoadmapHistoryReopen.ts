import fs from 'node:fs';
import assert from 'node:assert/strict';

const roadmap = fs.readFileSync('app/roadmap/page.tsx', 'utf8');
const progress = fs.readFileSync('app/my-progress/page.tsx', 'utf8');

assert.match(progress, /const getRoadmapRestoreHref = \(vspiId: string, accessCode: string, phone\?: string\)/, 'my-progress must build canonical restore URLs');
assert.match(progress, /id: vspiId/, 'restore URL must include vspiId');
assert.match(progress, /accessCode: cleanRoadmapAccessCode\(accessCode\)/, 'restore URL must include a cleaned accessCode');
assert.match(progress, /params\.set\('phone', cleanPhone\)/, 'restore URL should carry phone when available');
assert.doesNotMatch(progress, /href="\/roadmap\?restore=1"/, 'history cards must not use generic restore links');
assert.match(progress, /cacheVersion: CLIENT_REPORT_CACHE_VERSION/, 'saved roadmap cache must be versioned');
assert.match(progress, /selectedRoleId: verifiedRoadmap\.roleId \|\| undefined/, 'saved roadmap cache must preserve role_id from recovery summary');
assert.match(progress, /recoveries\.map\(item => \([\s\S]*<RecoveryCard key=\{item\.id\}/, 'history lookup must render all recoverable report/roadmap records');
assert.match(progress, /item\.progressDone[\s\S]*item\.progressTotal/, 'history lookup must distinguish generated roadmap progress records');
assert.doesNotMatch(progress, /fetch\([^)]*\/api\/roadmap\/generate/, 'my-progress must not call roadmap generate while listing recovery cards');

assert.match(roadmap, /interface RoadmapRestoreResponse/, 'roadmap page must type the restore response');
assert.match(roadmap, /const resumeExistingRoadmap = \(data: RoadmapRestoreResponse/, 'roadmap page must hydrate paid access records through one path');
assert.match(roadmap, /const openExistingRoadmap = async/, 'roadmap page must expose one deterministic openExistingRoadmap path');
assert.match(roadmap, /queryRestoreId = params\.get\('id'\)/, 'restore query must read id');
assert.match(roadmap, /params\.get\('vspiId'\)/, 'restore query must also accept vspiId');
assert.match(roadmap, /queryRestoreAccessCode = cleanRoadmapAccessCode\(params\.get\('accessCode'\)/, 'restore query must read accessCode');
assert.match(roadmap, /params\.get\('code'\)/, 'restore query must also accept code');
assert.match(roadmap, /queryRestorePhone = cleanSharedPhone\(params\.get\('phone'\)/, 'restore query must read phone');
assert.match(roadmap, /openExistingRoadmap\(\{[\s\S]*vspiId: queryRestoreId,[\s\S]*accessCode: queryRestoreAccessCode,[\s\S]*phone: queryRestorePhone,[\s\S]*\}\)/, 'restore query must open the existing roadmap before setup reset logic');
assert.match(roadmap, /openExistingRoadmap\(\{ vspiId: p\.vspiId, accessCode: p\.accessCode, phone: p\.phone \}\)/, 'generic local restore fallback must fetch the saved server roadmap');
assert.match(roadmap, /await openExistingRoadmap\(\{ phone: clean, accessCode: code \}\)/, 'manual phone/access restore must use openExistingRoadmap');

const resumeBlock = roadmap.slice(
  roadmap.indexOf('const resumeExistingRoadmap'),
  roadmap.indexOf('const openExistingRoadmap')
);
assert(resumeBlock.length > 1000, 'resumeExistingRoadmap block must be found');
assert.match(resumeBlock, /setProfile\(restoredProfile\)/, 'reopen must hydrate profile');
assert.match(resumeBlock, /persistRoadmapProfile\(restoredProfile\)/, 'reopen must persist a versioned profile');
assert.match(resumeBlock, /setJob\(restoredJob\)/, 'reopen must hydrate job from saved record');
assert.match(resumeBlock, /setCurrentSalary\(restoredSalary > 0/, 'reopen must hydrate salary from saved record');
assert.match(resumeBlock, /applyProgressPayload\(data\.task_progress \|\| \{\}, id\)/, 'reopen must hydrate progress/evidence for the exact VSPI');
assert.match(resumeBlock, /setRoadmap\(cleanRoadmapJson\)/, 'generated paid records must load saved roadmap_json');
assert.match(resumeBlock, /setStep\('roadmap'\)/, 'generated paid records must open the roadmap view');
assert.match(resumeBlock, /setRoadmap\(null\)/, 'paid records without roadmap_json must not show stale roadmap content');
assert.match(resumeBlock, /setStep\('intake'\)/, 'paid records without roadmap_json must show paid recovery/intake state');
assert.doesNotMatch(resumeBlock, /setStep\('setup'\)/, 'reopen must not drop paid records to blank public create setup');
assert.doesNotMatch(resumeBlock, /clearRoadmapSession\(/, 'reopen must not clear identifiers while opening an existing roadmap');

console.log(JSON.stringify({
  passed: true,
  canonicalRestoreLinks: true,
  versionedCache: true,
  generatedRoadmapOpensSavedView: true,
  paidMissingRoadmapUsesIntakeRecovery: true,
}, null, 2));
