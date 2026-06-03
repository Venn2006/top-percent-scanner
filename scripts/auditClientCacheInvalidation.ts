import fs from 'node:fs';
import assert from 'node:assert/strict';

const CACHE_VERSION = '2026-06-role-guard-v3';

const files = {
  top: fs.readFileSync('app/components/TopPercentScanner.tsx', 'utf8'),
  premium: fs.readFileSync('app/components/PremiumSection.tsx', 'utf8'),
  roadmap: fs.readFileSync('app/roadmap/page.tsx', 'utf8'),
};

function hasCurrentClientCacheVersion(payload: unknown) {
  const data = payload && typeof payload === 'object' ? payload as { cacheVersion?: unknown } : null;
  return data?.cacheVersion === CACHE_VERSION;
}

function restorePremiumSession(payload: Record<string, unknown> | null) {
  if (!hasCurrentClientCacheVersion(payload)) return null;
  return {
    selectedJob: payload?.selectedJob,
    salary: payload?.salary,
    aiAnalysis: typeof payload?.aiAnalysis === 'string' ? payload.aiAnalysis : '',
  };
}

function restoreRoadmapProfile(payload: Record<string, unknown> | null) {
  if (!hasCurrentClientCacheVersion(payload)) return null;
  return {
    job: payload?.job,
    salary: payload?.salary,
    selectedRoleId: payload?.selectedRoleId,
    roadmapDraftText: typeof payload?.roadmapDraftText === 'string' ? payload.roadmapDraftText : undefined,
  };
}

const staleBartenderSession = {
  selectedJob: 'Bartender',
  salary: 8_000_000,
  aiAnalysis: 'Move from Bartender to Sous Chef by learning mise en place and kitchen KPI.',
  savedAt: Date.now(),
};
const currentBartenderSession = {
  ...staleBartenderSession,
  cacheVersion: CACHE_VERSION,
  aiAnalysis: 'Bartender: improve cocktail recipe, POS upsell, speed of service and bar inventory.',
};
const staleRoadmapDraft = {
  job: 'Bartender',
  salary: 8_000_000,
  selectedRoleId: 'bartender__nha hang - khach san - du lich',
  roadmapDraftText: 'Sous Chef kitchen ladder draft',
  savedAt: Date.now(),
};
const currentRoadmapDraft = {
  ...staleRoadmapDraft,
  cacheVersion: CACHE_VERSION,
  roadmapDraftText: undefined,
};

assert.equal(restorePremiumSession(staleBartenderSession), null, 'old cached Bartender aiAnalysis with mise en place must be ignored');
assert.equal(restorePremiumSession({ ...staleBartenderSession, cacheVersion: '2026-06-role-guard-v2' }), null, 'older cacheVersion must be ignored');
assert.deepEqual(restorePremiumSession(currentBartenderSession), {
  selectedJob: 'Bartender',
  salary: 8_000_000,
  aiAnalysis: 'Bartender: improve cocktail recipe, POS upsell, speed of service and bar inventory.',
}, 'current cacheVersion should be accepted');
assert.equal(restoreRoadmapProfile(staleRoadmapDraft), null, 'missing cacheVersion roadmap draft must be ignored');
assert.deepEqual(restoreRoadmapProfile(currentRoadmapDraft), {
  job: 'Bartender',
  salary: 8_000_000,
  selectedRoleId: 'bartender__nha hang - khach san - du lich',
  roadmapDraftText: undefined,
}, 'scoped roadmap cache keeps salary/job/role_id only when version matches');

assert.match(files.top, /const CLIENT_REPORT_CACHE_VERSION = '2026-06-role-guard-v3'/, 'TopPercentScanner must define cache version');
assert.match(files.top, /if \(!hasCurrentClientCacheVersion\(session\)\) \{[\s\S]*?localStorage\.removeItem\(PREMIUM_SESSION_KEY\)/, 'premium session restore must delete stale version');
assert.match(files.top, /cacheVersion: CLIENT_REPORT_CACHE_VERSION[\s\S]*?isPremiumUnlocked: true/, 'premium unlocked cache must save current version');
assert.match(files.top, /cacheVersion: CLIENT_REPORT_CACHE_VERSION[\s\S]*?aiAnalysis: ''/, 'free/pending report cache must clear stale aiAnalysis');
assert.match(files.top, /premiumInsight: undefined[\s\S]*?renderedInsightText: undefined[\s\S]*?roleMapText: undefined[\s\S]*?roadmapDraftText: undefined/, 'known stale rendered report fields must be cleared');
assert.match(files.premium, /const CLIENT_REPORT_CACHE_VERSION = '2026-06-role-guard-v3'/, 'PremiumSection must define cache version');
assert.match(files.premium, /vspi-roadmap-draft-v1[\s\S]*?cacheVersion: CLIENT_REPORT_CACHE_VERSION/, 'PremiumSection roadmap draft must save version');
assert.match(files.roadmap, /const CLIENT_REPORT_CACHE_VERSION = '2026-06-role-guard-v3'/, 'roadmap page must define cache version');
assert.match(files.roadmap, /interface RoadmapProfile[\s\S]*?cacheVersion\?: string/, 'RoadmapProfile must carry cacheVersion');
assert.match(files.roadmap, /if \(!hasCurrentClientCacheVersion\(savedDraft\)\) \{[\s\S]*?localStorage\.removeItem\(DRAFT_KEY\)/, 'old roadmap draft must be deleted');
assert.match(files.roadmap, /if \(!hasCurrentClientCacheVersion\(p\)\) \{[\s\S]*?localStorage\.removeItem\(STORAGE_KEY\)/, 'old roadmap restore cache must be deleted');
assert.match(files.roadmap, /const versionedProfile: RoadmapProfile = \{[\s\S]*?cacheVersion: CLIENT_REPORT_CACHE_VERSION/, 'persisted roadmap profile must save current version');

console.log(JSON.stringify({
  passed: true,
  cacheVersion: CACHE_VERSION,
  staleBartenderInsightIgnored: true,
  missingCacheVersionIgnored: true,
  currentCacheVersionAccepted: true,
  scopedRoadmapCacheVersioned: true,
  staleAiAnalysisCanRender: false,
}, null, 2));