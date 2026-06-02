import { readFileSync } from 'node:fs';
import { getExactRoleProfile } from '../lib/roleProfiles';
import { buildRoadmapRoleLockPrompt, buildRoadmapRoleSkills } from '../lib/roadmapRoleLock';

const ROLE_ID = 'nhan vien check-in san bay__van tai - logistics';
const JOB_TITLE = 'Nhân viên check-in sân bay';

const forbidden = [
  'cabin',
  'cabin crew',
  'senior crew',
  'purser',
  'in-flight',
  'flight attendant',
  'checklist cabin',
  'announcement cabin',
  'grooming cabin crew',
  'route readiness',
];

const required = [
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
    .toLowerCase();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function countRequiredMatches(text: string) {
  const normalized = normalize(text);
  return required.filter(term => normalized.includes(normalize(term)));
}

const profile = getExactRoleProfile(JOB_TITLE);
assert(profile, `Missing exact role profile for ${JOB_TITLE}`);
assert(profile.key === ROLE_ID, `Resolved wrong role profile: ${profile.key}`);

const profileText = JSON.stringify(profile, null, 2);
const normalizedProfile = normalize(profileText);
const forbiddenInProfile = forbidden.filter(term => normalizedProfile.includes(normalize(term)));
assert(forbiddenInProfile.length === 0, `Forbidden terms in role profile: ${forbiddenInProfile.join(', ')}`);

const matchedRequired = countRequiredMatches(profileText);
assert(matchedRequired.length >= 5, `Expected at least 5 airport check-in terms, got: ${matchedRequired.join(', ')}`);

const lockedRole = buildRoadmapRoleSkills(JOB_TITLE);
const skillsText = lockedRole.skills.join(' | ');
const forbiddenInSkills = forbidden.filter(term => normalize(skillsText).includes(normalize(term)));
assert(forbiddenInSkills.length === 0, `Forbidden terms in injected skills: ${forbiddenInSkills.join(', ')}`);

const roleLockPrompt = buildRoadmapRoleLockPrompt({
  jobTitle: JOB_TITLE,
  experience: JOB_TITLE,
  currentSalary: 9_000_000,
  targetSalary: 12_000_000,
  timeline: 6,
  roleSkills: lockedRole.skills,
});
const forbiddenInRoleLockPrompt = forbidden.filter(term => normalize(roleLockPrompt).includes(normalize(term)));
assert(forbiddenInRoleLockPrompt.length === 0, `Forbidden terms in role-lock prompt: ${forbiddenInRoleLockPrompt.join(', ')}`);

const routeSource = readFileSync('app/api/roadmap/generate/route.ts', 'utf8');
const aviationFunctionMatch = routeSource.match(/function isAviationRole[\s\S]*?\n}/);
assert(aviationFunctionMatch, 'Cannot find isAviationRole()');
const aviationFunction = normalize(aviationFunctionMatch[0]);
for (const term of ['check in san bay', 'nhan vien mat dat hang khong', 'ground staff airline']) {
  assert(!aviationFunction.includes(term), `isAviationRole still matches airport ground term: ${term}`);
}
assert(routeSource.includes('${isAviation ?'), 'Cabin crew prompt rule is not gated by isAviation');

const sampleW1Tasks = [
  'W1-1: Lập checklist kiểm tra vé, hộ chiếu, visa và giấy tờ tùy thân cho 20 lượt hành khách; ghi lỗi thiếu giấy tờ và cách xử lý đúng quy trình.',
  'W1-2: Tạo bảng lỗi nhập thông tin check-in/boarding pass gồm tên hành khách, chuyến bay, hành lý ký gửi, lỗi phát sinh và bước kiểm tra chéo trước khi in.',
  'W1-3: Viết 5 script tiếng Anh tại quầy check-in cho khách trễ chuyến, hành lý quá cước, thiếu visa, đổi chuyến và cần gọi supervisor/gate/baggage service.',
];

console.log(JSON.stringify({
  roleId: profile.key,
  title: profile.title,
  removedWrongTerms: forbidden,
  requiredTermsMatched: matchedRequired,
  skills: profile.skills,
  injectedSkills: lockedRole.skills,
  sampleW1Tasks,
  passed: true,
}, null, 2));
