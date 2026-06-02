import { buildCanonicalRoadmapUserPrompt, buildRoadmapGenerationContext } from '../lib/roadmapPromptCanonical';
import { getRoleProfileById, normalizeRoleProfileText } from '../lib/roleProfiles';

const AIRPORT_CHECKIN_ROLE_ID = 'nhan vien check-in san bay__van tai - logistics';
const WRONG_CHECKOUT_TITLE = 'Tiếp viên hàng không';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function normalize(value: string) {
  return normalizeRoleProfileText(value);
}

function countOccurrences(haystack: string, needle: string) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

const profile = getRoleProfileById(AIRPORT_CHECKIN_ROLE_ID);
assert(profile, `Missing role profile: ${AIRPORT_CHECKIN_ROLE_ID}`);

const context = buildRoadmapGenerationContext({
  jobTitle: WRONG_CHECKOUT_TITLE,
  originalJobTitle: WRONG_CHECKOUT_TITLE,
  roleProfile: profile,
});

const prompt = buildCanonicalRoadmapUserPrompt({
  context,
  baseUserPrompt: [
    `System occupation from checkout: ${WRONG_CHECKOUT_TITLE}`,
    `Current role context: ${WRONG_CHECKOUT_TITLE}`,
    'Task should follow the role profile.',
  ].join('\n'),
  jobTitle: WRONG_CHECKOUT_TITLE,
  outputJobTitle: context.canonicalRoleTitle,
  preferredPathForCanonicalRole: 'airport ground check-in service recovery',
});

const normalizedTitle = normalize(context.canonicalRoleTitle);
const normalizedHeader = normalize(context.promptHeader);
const normalizedBoundary = normalize(context.roleBoundaryPrompt);
const normalizedPrompt = normalize(prompt);
const normalizedOriginalTitle = normalize(WRONG_CHECKOUT_TITLE);
const normalizedRoleId = normalize(AIRPORT_CHECKIN_ROLE_ID);

assert(context.canonicalRoleId === AIRPORT_CHECKIN_ROLE_ID, 'canonical role id must come from selected role profile');
assert(normalizedTitle.includes('nhan vien check-in san bay'), 'canonical title must be Nhan vien check-in san bay');
assert(context.isOriginalDifferent, 'wrong checkout title must be marked as different from canonical role');
assert(context.isAirportGroundCheckin, 'airport check-in boundary must be enabled');
assert(normalizedHeader.includes('nghe nghiep chinh xac'), 'prompt header must state exact occupation');
assert(normalizedHeader.includes('nhan vien check-in san bay'), 'prompt header must contain canonical airport check-in title');
assert(normalizedHeader.includes(normalizedRoleId), 'prompt header must contain locked role id');
assert(countOccurrences(normalizedPrompt, normalizedOriginalTitle) === 1, 'wrong checkout title may appear only once as original input context');

const requiredTerms = [
  'check-in',
  'boarding pass',
  'ho chieu',
  'visa',
  'hanh ly ky gui',
  'quay check-in',
  'hanh khach',
  'supervisor',
  'gate',
  'baggage service',
];

const missingRequiredTerms = requiredTerms.filter((term) => !normalizedBoundary.includes(term));
assert(missingRequiredTerms.length === 0, `missing airport ground terms: ${missingRequiredTerms.join(', ')}`);

const forbiddenTerms = [
  'cabin crew',
  'senior crew',
  'purser',
  'in-flight',
  'flight attendant',
  'checklist cabin',
  'announcement cabin',
  'route readiness',
];

const missingForbiddenBans = forbiddenTerms.filter((term) => !normalizedBoundary.includes(term));
assert(missingForbiddenBans.length === 0, `missing explicit cabin bans: ${missingForbiddenBans.join(', ')}`);
const requiredSection = normalizedBoundary.split(/cam|tuyet doi/)[0] || normalizedBoundary;
assert(!/(cabin crew|senior crew|purser|in-flight|flight attendant)/.test(requiredSection), 'cabin terms must not be listed as required terms');
assert(/cam|tuyet doi/.test(normalizedBoundary), 'forbidden cabin terms must be framed as bans');

console.log('ROADMAP PROMPT CANONICAL ROLE GATE: PASS');
console.log(`Canonical title: ${context.canonicalRoleTitle}`);
console.log(`Canonical roleId: ${context.canonicalRoleId}`);
console.log(`Original checkout title: ${context.originalJobTitleFromCheckout}`);
console.log(`Airport boundary: ${context.isAirportGroundCheckin ? 'enabled' : 'disabled'}`);
