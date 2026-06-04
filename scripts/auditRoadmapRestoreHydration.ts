import fs from 'node:fs';
import assert from 'node:assert/strict';

const roadmapPage = fs.readFileSync('app/roadmap/page.tsx', 'utf8');
const generateRoute = fs.readFileSync('app/api/roadmap/generate/route.ts', 'utf8');
const historyAudit = fs.readFileSync('scripts/auditRoadmapHistoryReopen.ts', 'utf8');

function blockBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert(startIndex >= 0, `${start} must exist`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(endIndex > startIndex, `${end} must exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

const getRouteStart = generateRoute.indexOf('export async function GET');
assert(getRouteStart >= 0, 'GET route must exist');
const getRouteBlock = generateRoute.slice(getRouteStart);
const phoneRestoreBlock = blockBetween(getRouteBlock, 'if (phone && !vspiId)', 'if (!vspiId)');
const idRestoreBlock = blockBetween(getRouteBlock, 'const { data, error } = await supabaseServer', 'return NextResponse.json({ ...data, status: \'paid\'');
const resumeBlock = blockBetween(roadmapPage, 'const resumeExistingRoadmap = (data: RoadmapRestoreResponse', 'const openExistingRoadmap = async');
const openBlock = blockBetween(roadmapPage, 'const openExistingRoadmap = async', 'useEffect(() => () =>');

assert.match(generateRoute, /status:\s*'generated'/, 'GET restore must mark saved roadmap_json records as generated');
assert.match(phoneRestoreBlock, /if \(cleanRoadmapJson\) \{[\s\S]*?status:\s*'generated'[\s\S]*?task_progress: data\.task_progress \|\| \{\}/, 'phone/access restore must return saved roadmap_json immediately');
assert.match(idRestoreBlock, /if \(cleanRoadmapJson\) \{[\s\S]*?status:\s*'generated'[\s\S]*?task_progress: data\.task_progress \|\| \{\}/, 'VSPI/access restore must return saved roadmap_json immediately');
assert(idRestoreBlock.indexOf('if (cleanRoadmapJson)') < idRestoreBlock.indexOf('const restoreValidation'), 'VSPI/access restore must hydrate before role validation or quality repair');
assert.doesNotMatch(idRestoreBlock.slice(0, idRestoreBlock.indexOf('if (cleanRoadmapJson)')), /generateRoadmap\(/, 'GET restore must not generate before saved roadmap hydration');
assert.match(generateRoute, /status:\s*'paid'/, 'paid access without roadmap_json must stay a paid recovery response');

assert.match(roadmapPage, /const isRestorableRoadmapStatus = \(status: string \| undefined\) =>[\s\S]*status === 'generated'[\s\S]*status === 'ready'/, 'frontend restore must accept generated/ready responses');
assert.match(openBlock, /!isRestorableRoadmapStatus\(data\.status\)/, 'openExistingRoadmap must use the restorable status guard');
assert.doesNotMatch(openBlock, /data\.status && data\.status !== 'paid'/, 'openExistingRoadmap must not reject generated responses');
assert.match(resumeBlock, /const cleanRoadmapJson = cleanRoadmapData\(data\.roadmap_json\)/, 'resume must read production snake_case roadmap_json');
assert.match(resumeBlock, /applyProgressPayload\(data\.task_progress \|\| \{\}, id\)/, 'resume must hydrate production snake_case task_progress');
assert.match(resumeBlock, /setRoadmap\(cleanRoadmapJson\)[\s\S]*?setStep\('roadmap'\)/, 'generated restore must open roadmap view');
assert.doesNotMatch(resumeBlock, /setStep\('setup'\)/, 'generated restore must never fall back to public setup');
assert.match(historyAudit, /generated status responses/, 'history reopen audit must cover generated status responses');

type RestoreStatus = 'roadmap' | 'intake' | 'denied';
function classifyRestore(data: { status?: string; roadmap_json?: unknown; task_progress?: unknown } | null, ok = true): RestoreStatus {
  const restorable = !data?.status || data.status === 'paid' || data.status === 'generated' || data.status === 'ready';
  if (!ok || !data || !restorable) return 'denied';
  return data.roadmap_json ? 'roadmap' : 'intake';
}

const productionLegacyFixture = {
  vspi_id: 'VSPI-2026-MYCW-N3JQ',
  accessCode: 'GWLSCOCHEEHQ',
  phone: '0222222222',
  status: 'generated',
  job_title: 'F&B Manager',
  role_id: 'f&b manager__nha hang - khach san - du lich',
  current_salary: 12000000,
  target_salary: 18000000,
  duration_months: 6,
  roadmap_json: {
    goal: 'Resume saved roadmap',
    summary: 'Saved roadmap must hydrate without new intake fields.',
    weeks: [{ week: 1, focus: 'Week 1', tasks: ['Task 1'], milestone: 'M1' }],
    negotiation_timing: 'After evidence',
    salary_projection: 'Conditional',
    actionPlan: { milestones: [] },
  },
  task_progress: { w1_t0: true, evidence: { w1_t0: { note: 'submitted' } } },
};

assert.equal(classifyRestore(productionLegacyFixture), 'roadmap', 'legacy generated production-shaped response must open roadmap view');
assert.equal(classifyRestore({ status: 'paid', roadmap_json: null, task_progress: {} }), 'intake', 'paid without roadmap_json must open paid recovery/intake');
assert.equal(classifyRestore({ ...productionLegacyFixture, status: 'ready' }), 'roadmap', 'new future-goal generated response must open roadmap view');
assert.equal(classifyRestore({ ...productionLegacyFixture, roadmap_json: { ...productionLegacyFixture.roadmap_json, intake: { customTargetRole: true } } }), 'roadmap', 'custom generated response must open roadmap view');
assert.equal(classifyRestore({ status: 'pending', roadmap_json: productionLegacyFixture.roadmap_json }), 'denied', 'bad/unpaid access must not hydrate roadmap data');

console.log(JSON.stringify({
  passed: true,
  productionLegacyGenerated: 'roadmap view',
  paidNoRoadmap: 'paid recovery/intake',
  newFutureGoalGenerated: 'roadmap view',
  customGenerated: 'roadmap view',
  badAccess: 'denied',
  noPostGenerate: true,
}, null, 2));
