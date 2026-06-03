import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDeterministicRoadmapFallback } from '../lib/buildDeterministicRoadmapFallback';
import { repairRoadmapAfterRoleGuardFail } from '../lib/repairRoadmapAfterRoleGuardFail';
import { validateFinalRoadmapBeforePersist } from '../lib/roadmapFinalRoleGuard';
import { getRoleProfileById } from '../lib/roleProfiles';

const roleId = 'bartender__nha hang - khach san - du lich';
const profile = getRoleProfileById(roleId);
assert.ok(profile, 'Bartender role profile must exist');

const userInputs = {
  currentPosition: 'Bartender moi vao nghe, phu trach quay bar ca toi',
  mainWeakness: 'Muon tang toc do phuc vu va chuan hoa recipe cocktail/mocktail',
  twoYearGoal: 'Tro thanh bartender chinh hoac bar supervisor',
  educationLevel: 'Trung cap/Cao dang',
  educationDetail: 'Co chung chi pha che co ban',
  strongSkills: 'Giao tiep khach hang, ghi order, dung POS',
  proofAssets: 'Anh/video do uong da pha, checklist ve sinh quay bar',
  bottleneck: 'Chua co bo recipe chuan va chua tu tin upsell',
  preferredPath: 'Nang skill tai noi lam hien tai',
  weeklyTime: '4-6 gio/tuan',
};

const contaminatedRoadmap = {
  format: 'expert_v2',
  version: 2,
  goal: 'Bartender roadmap contaminated by kitchen roles',
  summary: 'Move from Bartender to Sous Chef with mise en place ownership.',
  weeks: [{ week: 1, focus: 'Sous Chef', tasks: ['mise en place'], milestone: 'Kitchen Manager review' }],
  markdown: 'Sous Chef mise en place Kitchen Manager line cook commis '.repeat(30),
  actionPlan: { standardWeeks: 4, flexibleWeeks: 6, weeklyHours: '4-6', completionRule: 'x', levelName: 'Bartender', milestones: [] },
};

const forbiddenKitchen = ['Sous Chef', 'mise en place', 'Kitchen Manager', 'line cook', 'commis'];
const requiredBartender = [
  'bartender',
  'pha che',
  'cocktail',
  'mocktail',
  'do uong',
  'quay bar',
  'recipe',
  'dinh luong',
  'upsell',
  'POS',
  'ton kho quay bar',
  've sinh quay bar',
  'speed of service',
];

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[??]/g, 'd')
    .toLowerCase();
}

function textOf(value: unknown) {
  return normalize(JSON.stringify(value));
}

function hits(value: unknown, terms: string[]) {
  const text = textOf(value);
  return terms.filter(term => text.includes(normalize(term)));
}

function guard(value: unknown) {
  return validateFinalRoadmapBeforePersist({
    jobTitle: profile!.title,
    roleId,
    roleProfile: profile!,
    finalRoadmap: value,
  });
}

async function main() {
const contaminatedGuard = guard(contaminatedRoadmap);
assert.equal(contaminatedGuard.passed, false, 'contaminated fixture must fail guard');

const contaminatedRepair = await repairRoadmapAfterRoleGuardFail({
  failedRoadmap: contaminatedRoadmap,
  finalGuardResult: contaminatedGuard,
  roleProfile: profile!,
  canonicalRoleTitle: profile!.title,
  canonicalRoleId: roleId,
  userInputs,
  callModel: async () => JSON.stringify(contaminatedRoadmap),
});
assert.equal(contaminatedRepair.source, 'fallback', 'contaminated AI output should use fallback');
assert.equal(contaminatedRepair.fallbackGuard?.passed, true, 'fallback after contaminated AI output must pass');
assert.equal(guard(contaminatedRepair.roadmap).passed, true, 'final fallback must pass guard');

const repairThrows = await repairRoadmapAfterRoleGuardFail({
  failedRoadmap: contaminatedRoadmap,
  finalGuardResult: contaminatedGuard,
  roleProfile: profile!,
  canonicalRoleTitle: profile!.title,
  canonicalRoleId: roleId,
  userInputs,
  callModel: async () => { throw new Error('mock repair failure'); },
});
assert.equal(repairThrows.source, 'fallback', 'repair throw should still use fallback');
assert.equal(repairThrows.fallbackGuard?.passed, true, 'fallback after repair throw must pass');

const fallbackThrows = await repairRoadmapAfterRoleGuardFail({
  failedRoadmap: contaminatedRoadmap,
  finalGuardResult: contaminatedGuard,
  roleProfile: profile!,
  canonicalRoleTitle: profile!.title,
  canonicalRoleId: roleId,
  userInputs,
  callModel: async () => { throw new Error('mock repair failure'); },
  buildFallback: () => { throw new Error('mock fallback failure'); },
});
assert.equal(fallbackThrows.source, 'fallback', 'fallback throw should be represented as fallback result');
assert.equal(fallbackThrows.fallbackGuard?.passed, false, 'fallback throw should become structured failed guard');
assert.equal(fallbackThrows.fallbackGuard?.code, 'ROADMAP_ROLE_GUARD_FAILED');

const cleanFallback = buildDeterministicRoadmapFallback({
  roleProfile: profile!,
  canonicalRoleTitle: profile!.title,
  canonicalRoleId: roleId,
  userInputs,
});
const cleanGuard = guard(cleanFallback);
assert.equal(cleanGuard.passed, true, 'clean Bartender fallback must pass guard');
for (const key of ['goal', 'summary', 'weeks', 'markdown', 'actionPlan'] as const) {
  assert.ok((cleanFallback as Record<string, unknown>)[key], 'fallback must include ' + key);
}
assert.deepEqual(hits(cleanFallback, forbiddenKitchen), [], 'Bartender fallback must not include kitchen terms');
const bartenderHits = hits(cleanFallback, requiredBartender);
assert.ok(bartenderHits.length >= 10, 'Bartender fallback required hits too low: ' + bartenderHits.join(', '));

const routeSource = fs.readFileSync('app/api/roadmap/generate/route.ts', 'utf8');
assert.doesNotMatch(routeSource, /ROADMAP_GENERATION_FAILED',\s*500/, 'route must not return raw HTTP 500 for generation failure');
assert.match(routeSource, /ROADMAP_GENERATION_FAILED',\s*503/, 'route must return structured non-500 generation failure');

console.log(JSON.stringify({
  passed: true,
  contaminatedAiOutput: { source: contaminatedRepair.source, fallbackGuard: contaminatedRepair.fallbackGuard?.code },
  repairThrows: { source: repairThrows.source, fallbackGuard: repairThrows.fallbackGuard?.code },
  fallbackThrows: { source: fallbackThrows.source, fallbackGuardPassed: fallbackThrows.fallbackGuard?.passed, code: fallbackThrows.fallbackGuard?.code },
  cleanBartenderFallback: {
    schemaKeys: ['goal', 'summary', 'weeks', 'markdown', 'actionPlan'],
    requiredHits: bartenderHits,
    forbiddenKitchenHits: hits(cleanFallback, forbiddenKitchen),
  },
}, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
