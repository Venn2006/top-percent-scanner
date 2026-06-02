import { getExactRoleProfile, getRoleProfileById, type RoleProfile } from '../lib/roleProfiles';
import { buildRoadmapRoleSkillsFromProfile } from '../lib/roadmapRoleLock';

const AIRPORT_CHECKIN_ROLE_ID = 'nhan vien check-in san bay__van tai - logistics';
const WRONG_TEXT_JOB_TITLE = 'Tiếp viên hàng không';

const forbiddenCabinTerms = [
  'cabin crew',
  'flight attendant',
  'senior crew',
  'purser',
  'in-flight',
  'checklist cabin',
  'announcement cabin',
  'grooming cabin crew',
  'route readiness',
];

const requiredAirportTerms = [
  'check-in',
  'boarding pass',
  'hộ chiếu',
  'visa',
  'hành lý',
  'quầy check-in',
  'hành khách',
  'supervisor',
];

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function resolveRoadmapProfileForCheckout(selectedRoleId: string | null | undefined, jobTitle: string): RoleProfile {
  if (selectedRoleId) {
    const exactById = getRoleProfileById(selectedRoleId);
    if (!exactById) throw new Error('Invalid selectedRoleId');
    return exactById;
  }
  const legacyProfile = getExactRoleProfile(jobTitle);
  if (!legacyProfile) throw new Error(`Missing legacy role profile for ${jobTitle}`);
  return legacyProfile;
}

function findMatches(text: string, terms: string[]) {
  const normalizedText = normalize(text);
  return terms.filter(term => normalizedText.includes(normalize(term)));
}

const selectedRoleProfile = resolveRoadmapProfileForCheckout(AIRPORT_CHECKIN_ROLE_ID, WRONG_TEXT_JOB_TITLE);
assert(selectedRoleProfile.key === AIRPORT_CHECKIN_ROLE_ID, `selectedRoleId did not win over wrong job_title. Got ${selectedRoleProfile.key}`);
assert(normalize(selectedRoleProfile.title).includes('check-in'), `Expected airport check-in title, got ${selectedRoleProfile.title}`);

const selectedProfileText = JSON.stringify(selectedRoleProfile);
const selectedForbidden = findMatches(selectedProfileText, forbiddenCabinTerms);
assert(selectedForbidden.length === 0, `Airport check-in profile contains cabin terms: ${selectedForbidden.join(', ')}`);

const selectedRequired = findMatches(selectedProfileText, requiredAirportTerms);
assert(selectedRequired.length >= 5, `Airport check-in profile missing required terms. Got ${selectedRequired.join(', ')}`);

const selectedSkills = buildRoadmapRoleSkillsFromProfile(selectedRoleProfile).skills.join(' | ');
const skillForbidden = findMatches(selectedSkills, forbiddenCabinTerms);
assert(skillForbidden.length === 0, `Injected selectedRoleId skills contain cabin terms: ${skillForbidden.join(', ')}`);

let invalidRejected = false;
try {
  resolveRoadmapProfileForCheckout('invalid_role_id', WRONG_TEXT_JOB_TITLE);
} catch (err) {
  invalidRejected = err instanceof Error && err.message === 'Invalid selectedRoleId';
}
assert(invalidRejected, 'Invalid selectedRoleId was not rejected before legacy fallback');

const legacyProfile = resolveRoadmapProfileForCheckout(null, selectedRoleProfile.title);
assert(legacyProfile.key === AIRPORT_CHECKIN_ROLE_ID, `Legacy job_title fallback resolved wrong role: ${legacyProfile.key}`);

console.log(JSON.stringify({
  passed: true,
  selectedRoleIdBeatsWrongJobTitle: {
    selectedRoleId: AIRPORT_CHECKIN_ROLE_ID,
    wrongJobTitle: WRONG_TEXT_JOB_TITLE,
    resolvedRoleId: selectedRoleProfile.key,
    resolvedTitle: selectedRoleProfile.title,
  },
  invalidSelectedRoleIdRejected: invalidRejected,
  legacyJobTitleFallback: {
    input: selectedRoleProfile.title,
    resolvedRoleId: legacyProfile.key,
    resolvedTitle: legacyProfile.title,
  },
  requiredAirportTermsMatched: selectedRequired,
}, null, 2));
