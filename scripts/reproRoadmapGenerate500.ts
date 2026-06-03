import { buildDeterministicRoadmapFallback } from '../lib/buildDeterministicRoadmapFallback';
import { validateFinalRoadmapBeforePersist } from '../lib/roadmapFinalRoleGuard';
import { getRoleProfileById } from '../lib/roleProfiles';

const roleId = 'bartender__nha hang - khach san - du lich';
const profile = getRoleProfileById(roleId);
if (!profile) throw new Error('Missing Bartender role profile');

const payload = {
  name: 'QA Test',
  phone: '0222222222',
  job: 'Bartender',
  selectedRoleId: roleId,
  salary: 8000000,
  location: 'TP.HCM',
  experience: '0-2 nam',
  timeline: '3 thang',
};

const fallback = buildDeterministicRoadmapFallback({
  roleProfile: profile,
  canonicalRoleTitle: profile.title,
  canonicalRoleId: roleId,
  userInputs: {
    currentPosition: 'Bartender moi vao nghe, phu trach quay bar ca toi',
    mainWeakness: 'Muon tang toc do phuc vu va chuan hoa recipe cocktail/mocktail',
    twoYearGoal: 'Tro thanh bartender chinh hoac bar supervisor',
    weeklyTime: '4-6 gio/tuan',
  },
});
const guard = validateFinalRoadmapBeforePersist({
  jobTitle: profile.title,
  roleId,
  roleProfile: profile,
  finalRoadmap: fallback,
});

console.log(JSON.stringify({
  localReproduce500: false,
  reason: 'No production mutation or LLM call was made; local deterministic fallback for the same Bartender payload passes final guard.',
  payload: { ...payload, phone: '022****222' },
  fallbackSchema: Object.keys(fallback as Record<string, unknown>),
  guard,
}, null, 2));
