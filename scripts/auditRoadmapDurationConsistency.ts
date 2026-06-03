import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildDeterministicRoadmapFallback } from '../lib/buildDeterministicRoadmapFallback';
import { getRoleProfileById } from '../lib/roleProfiles';

const files = {
  page: fs.readFileSync('app/roadmap/page.tsx', 'utf8'),
  checkout: fs.readFileSync('app/api/roadmap/checkout/route.ts', 'utf8'),
  generate: fs.readFileSync('app/api/roadmap/generate/route.ts', 'utf8'),
  fallback: fs.readFileSync('lib/buildDeterministicRoadmapFallback.ts', 'utf8'),
};

function countTasks(roadmap: any) {
  return (roadmap.actionPlan?.milestones || []).reduce((total: number, milestone: any) => (
    total + (milestone.weeks || []).reduce((weekTotal: number, week: any) => weekTotal + (week.tasks || []).length, 0)
  ), 0);
}

function assertFallbackDuration(durationMonths: 3 | 6 | 9) {
  const roleProfile = getRoleProfileById('barista (pha che ca phe)__nha hang - khach san - du lich');
  assert(roleProfile, 'Barista role profile must exist');

  const roadmap = buildDeterministicRoadmapFallback({
    roleProfile,
    canonicalRoleTitle: roleProfile.title,
    canonicalRoleId: roleProfile.key,
    userInputs: {
      durationMonths,
      currentPosition: roleProfile.title,
      weeklyTime: '3-5 giờ/tuần',
    },
  }) as any;

  const expectedWeeks = durationMonths * 4;
  const milestones = roadmap.actionPlan?.milestones || [];
  const actionWeeks = milestones.flatMap((milestone: any) => milestone.weeks || []);

  assert.equal(roadmap.actionPlan.standardWeeks, expectedWeeks, `${durationMonths}m fallback standardWeeks mismatch`);
  assert.equal(milestones.length, durationMonths, `${durationMonths}m fallback must expose one milestone per month`);
  assert.equal(actionWeeks.length, expectedWeeks, `${durationMonths}m fallback must expose 4 weeks per month`);
  assert(countTasks(roadmap) >= expectedWeeks, `${durationMonths}m fallback must have at least one task per week`);
  assert.deepEqual(milestones.map((m: any) => m.month), Array.from({ length: durationMonths }, (_, index) => index + 1), `${durationMonths}m months must be sequential`);
  assert(JSON.stringify(roadmap).includes(`${durationMonths} tháng`) || durationMonths === 3, `${durationMonths}m fallback should carry duration copy`);
  return { durationMonths, expectedWeeks, milestones: milestones.length, actionWeeks: actionWeeks.length, tasks: countTasks(roadmap) };
}

assert.match(files.page, /duration_months:\s*duration/, 'roadmap setup must send selected duration to checkout');
assert.match(files.page, /duration:\s*data\.duration_months \|\| 6/, 'restore profile must hydrate duration from generate response');
assert.match(files.page, /formatDurationLabel\(duration\)/, 'UI must derive labels from selected duration');
assert.match(files.checkout, /const duration = normalizeRoadmapDuration\(duration_months\)/, 'checkout must normalize selected duration');
assert.match(files.checkout, /duration_months:\s*duration/, 'checkout insert must persist normalized duration');
assert.match(files.generate, /roadmap\.duration_months/, 'generate route must read persisted duration');
assert.match(files.generate, /getCompactPlanWeeks\(durationMonths\)/, 'generate route must use duration to size weekly plan');
assert.match(files.generate, /hasDurationMismatch\(roadmap, expectedDurationMonths\)/, 'saved roadmap quality must reject duration mismatches');
assert.match(files.generate, /isLowQualityRoadmap\(cleanExisting, authoritativeJobTitle, roadmap\.duration_months\)/, 'POST must compare existing roadmap against DB duration');
assert.match(files.generate, /isLowQualityRoadmap\(cleanRoadmapJson, restoreJobTitle, data\.duration_months\)/, 'GET restore must compare existing roadmap against DB duration');
assert.match(files.fallback, /expandWeeksForDuration/, 'deterministic fallback must expand weeks by duration');
assert.match(files.fallback, /monthIndex \* weeksPerMonth/, 'deterministic fallback must group weeks into monthly milestones');

const cases = [3, 6, 9].map(months => assertFallbackDuration(months as 3 | 6 | 9));
const sixMonth = cases.find(item => item.durationMonths === 6)!;
assert.equal(sixMonth.milestones, 6, '6-month plan must not render only Month 1');
assert.equal(sixMonth.actionWeeks, 24, '6-month plan must not render only 4 weeks');

console.log(JSON.stringify({
  passed: true,
  cases,
  checkoutPayload: 'duration_months persisted',
  generateInput: 'duration_months drives fallback/actionPlan and saved roadmap quality',
}, null, 2));
