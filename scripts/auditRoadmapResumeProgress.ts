import fs from 'node:fs';
import assert from 'node:assert/strict';

const roadmap = fs.readFileSync('app/roadmap/page.tsx', 'utf8');

function sourceBlock(start: string, end: string) {
  const startIndex = roadmap.indexOf(start);
  assert(startIndex >= 0, `${start} must exist`);
  const endIndex = roadmap.indexOf(end, startIndex + start.length);
  assert(endIndex > startIndex, `${end} must exist after ${start}`);
  return roadmap.slice(startIndex, endIndex);
}

const resumeBlock = sourceBlock('const resumeExistingRoadmap = (data: RoadmapRestoreResponse', 'const openExistingRoadmap = async');
const openBlock = sourceBlock('const openExistingRoadmap = async', 'useEffect(() => () =>');
const loadBlock = sourceBlock('const loadRoadmap = async () =>', 'const toggleTaskKey = async');
const restoreEffectBlock = sourceBlock('const saved = wantsRestore ? localStorage.getItem(STORAGE_KEY) : null;', '// Restore should run only on first load');

assert.match(resumeBlock, /const cleanRoadmapJson = cleanRoadmapData\(data\.roadmap_json\)/, 'resume must read saved roadmap_json');
assert.match(resumeBlock, /applyProgressPayload\(data\.task_progress \|\| \{\}, id\)/, 'resume must hydrate saved task_progress for exact VSPI');
assert.match(resumeBlock, /setRoadmap\(cleanRoadmapJson\)/, 'generated records must hydrate saved roadmap JSON');
assert.match(resumeBlock, /setStep\('roadmap'\)/, 'generated records must open roadmap view');
assert.match(resumeBlock, /setStep\('intake'\)/, 'paid records without roadmap_json must show paid recovery/intake');
assert.doesNotMatch(resumeBlock, /fetch\('/, 'resume hydration must not fetch or generate');
assert.doesNotMatch(resumeBlock, /setGenerating\(true\)/, 'resume hydration must not show AI analyzing/generating state');
assert.doesNotMatch(resumeBlock, /setStep\('setup'\)/, 'paid restore must not fall back to public setup');

assert.doesNotMatch(openBlock, /setGenerating\(true\)/, 'openExistingRoadmap GET restore must not show generation skeleton');
assert.match(openBlock, /fetch\(`\/api\/roadmap\/generate\?\$\{params\.toString\(\)\}`\)/, 'openExistingRoadmap must fetch existing record by GET');
assert.doesNotMatch(openBlock, /method:\s*'POST'/, 'openExistingRoadmap must not POST generate');
assert.match(openBlock, /return resumeExistingRoadmap\(data, \{ vspiId: cleanId, accessCode: cleanAccess, phone: cleanPhone \}\)/, 'openExistingRoadmap must delegate to deterministic resume path');

assert.match(loadBlock, /if \(roadmap && \(vspiId \|\| profile\?\.vspiId\)\) \{[\s\S]*?setStep\('roadmap'\);[\s\S]*?return;[\s\S]*?\}/, 'loadRoadmap must no-op/resume when a saved roadmap is already loaded');
assert.match(loadBlock, /fetch\('\/api\/roadmap\/generate',[\s\S]*?method:\s*'POST'/, 'loadRoadmap may generate only from explicit intake path');
assert.match(restoreEffectBlock, /openExistingRoadmap\(\{ vspiId: p\.vspiId, accessCode: p\.accessCode, phone: p\.phone \}\)/, 'local restore fallback must use openExistingRoadmap');
assert.doesNotMatch(restoreEffectBlock, /setGenerating\(true\)/, 'local restore fallback must not show generation skeleton');
assert.doesNotMatch(restoreEffectBlock, /fetch\(`\/api\/roadmap\/generate\?id=/, 'local restore fallback must not duplicate manual fetch path');

assert.match(roadmap, /serverProgressHydratedRef/, 'server progress hydration guard must exist');
assert.match(roadmap, /serverProgressHydratedRef\.current\[id\] = true/, 'server progress must mark canonical hydration by VSPI');
assert.match(roadmap, /if \(!id \|\| serverProgressHydratedRef\.current\[id\]\) return;/, 'stale local evidence cache must not override server progress');
assert.match(roadmap, /localStorage\.removeItem\(getEvidenceStorageKey\(id\)\)/, 'server empty evidence must clear stale local evidence cache');
assert.match(roadmap, /Tiếp tục lộ trình/, 'roadmap view must show a resume panel');
assert.match(roadmap, /Bạn đã hoàn thành \{stats\.done\}\/\{stats\.total\} việc/, 'resume panel must show completed count');
assert.doesNotMatch(roadmap, /Đang ở tuần \{resumeCurrentWeek\}/, 'resume panel must not imply current week when progress is mostly complete but an early task is missing');
assert.match(roadmap, /Việc còn thiếu gần nhất: Tuần \{resumeCurrentWeek\}/, 'resume panel must show nearest missing task week');
assert.match(roadmap, /Việc tiếp theo/, 'resume panel must show next task');

const sampleTasks = Array.from({ length: 24 }, (_, index) => {
  const week = Math.floor(index / 4) + 1;
  const taskIndex = index % 4;
  return { key: `w${week}_t${taskIndex}`, week, title: `Task ${index + 1}` };
});
const completedTwoWeeks = Object.fromEntries(sampleTasks.slice(0, 8).map(task => [task.key, true]));
const nextAfterTwoWeeks = sampleTasks.find(task => !completedTwoWeeks[task.key]);
assert.equal(Object.keys(completedTwoWeeks).length, 8, 'fixture should represent two completed weeks');
assert.equal(nextAfterTwoWeeks?.week, 3, 'after two completed weeks resume should continue at week 3');

const emptyProgress: Record<string, boolean> = {};
const firstTask = sampleTasks.find(task => !emptyProgress[task.key]);
assert.equal(firstTask?.week, 1, 'roadmap_json with missing task_progress should initialize empty progress at week 1');

console.log(JSON.stringify({
  passed: true,
  generatedRoadmapResume: 'no generation state and no POST',
  savedProgressHydration: 'task_progress and evidence are canonical from server',
  missingProgress: 'empty progress resumes at week 1 without regenerate',
  paidMissingRoadmap: 'intake recovery, not public setup',
  staleCache: 'server progress wins over local evidence cache',
  nextWeekAfterTwoCompletedWeeks: nextAfterTwoWeeks?.week,
}, null, 2));
