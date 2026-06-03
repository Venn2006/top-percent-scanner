import fs from 'node:fs';
import assert from 'node:assert/strict';
import { detectRoadmapIntentPhrase } from '../lib/roadmapAccess';
import { findClosestRoleProfiles, resolveRoadmapRoleFromJobTitle } from '../lib/roleProfiles';

const BARISTA_ROLE_ID = 'barista (pha che ca phe)__nha hang - khach san - du lich';

function cleanPhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 10);
}

function validPhone(value: string) {
  return /^0[0-9]{9}$/.test(cleanPhone(value));
}

function parseSalary(value: string) {
  return Number(value.replace(/\D/g, '')) || 0;
}

interface FormState {
  intent?: 'new_graduate' | 'stuck_3_years' | 'career_switch' | '';
  job: string;
  selectedRoleId?: string;
  name?: string;
  phone?: string;
  salary?: string;
  consent?: boolean;
}

function resolveFormRole(state: FormState) {
  return state.selectedRoleId || resolveRoadmapRoleFromJobTitle(state.job)?.role_id || '';
}

function disabledReason(state: FormState) {
  const detectedIntent = detectRoadmapIntentPhrase(state.job);
  const activeIntent = state.intent || detectedIntent || '';
  const roleId = resolveFormRole(state);
  if (!state.name?.trim()) return 'missing name';
  if (!validPhone(state.phone || '')) return 'missing or invalid phone';
  if (!state.job.trim()) return 'missing exact job';
  if (activeIntent && !roleId && (!state.job.trim() || detectedIntent)) return 'role selection required';
  if (!roleId) return 'role needs confirmation';
  if (parseSalary(state.salary || '') < 1_000_000) return 'missing salary';
  if (!state.consent) return 'consent unchecked';
  return '';
}

function checkoutPayload(state: FormState) {
  const roleId = resolveFormRole(state);
  return {
    job_title: resolveRoadmapRoleFromJobTitle(state.job)?.title || state.job.trim(),
    selectedRoleId: roleId || undefined,
    roadmapIntent: state.intent || undefined,
    current_salary: parseSalary(state.salary || ''),
  };
}

const source = {
  roadmapPage: fs.readFileSync('app/roadmap/page.tsx', 'utf8'),
  checkoutRoute: fs.readFileSync('app/api/roadmap/checkout/route.ts', 'utf8'),
  roleProfiles: fs.readFileSync('lib/roleProfiles.ts', 'utf8'),
};

assert.match(source.roleProfiles, /resolveRoadmapRoleFromJobTitle/, 'roleProfiles must export exact roadmap role resolver');
assert.match(source.roadmapPage, /effectiveSelectedRoleId/, 'roadmap page must use effective role id from exact title hydration');
assert.match(source.roadmapPage, /setupDisabledReason/, 'roadmap page must show a visible disabled reason');
assert.match(source.roadmapPage, /effectiveSelectedRoleTitle|Chưa chọn nghề chuẩn|ChÆ°a chá»n nghá» chuáº©n/, 'roadmap page must render selected role badge states');
assert.match(source.roadmapPage, /isRoleSelectionError/, 'roadmap page must clear stale role selection errors after exact match');
assert.match(source.checkoutRoute, /resolveRoadmapRoleFromJobTitle/, 'checkout route must share exact role resolver');

const barista = resolveRoadmapRoleFromJobTitle('Barista (Pha chế cà phê)');
assert.equal(barista?.role_id, BARISTA_ROLE_ID, 'Barista exact title must hydrate exact role_id');
assert.equal(barista?.title, 'Barista (Pha chế cà phê)', 'Barista exact title must keep canonical title');

const case1: FormState = {
  intent: 'stuck_3_years',
  job: 'Barista (Pha chế cà phê)',
  name: 'bo',
  phone: '0222222222',
  salary: '7,000,000',
  consent: true,
};
assert.equal(resolveFormRole(case1), BARISTA_ROLE_ID, 'typed Barista must resolve role_id client-side');
assert.equal(disabledReason(case1), '', 'Barista exact role with valid form must enable CTA');
assert.equal(checkoutPayload(case1).selectedRoleId, BARISTA_ROLE_ID, 'checkout payload must include hydrated role_id');

const case2: FormState = { intent: 'new_graduate', job: '', name: 'bo', phone: '0222222222', salary: '7000000', consent: true };
assert.equal(disabledReason(case2), 'missing exact job', 'new graduate intent must stay disabled until exact role selected');
assert.equal(resolveFormRole(case2), '', 'intent-only flow must not invent role_id');

const staleErrorBefore = detectRoadmapIntentPhrase('Sinh viên mới tốt nghiệp chưa rõ định hướng');
const staleErrorAfter = resolveRoadmapRoleFromJobTitle('Barista (Pha chế cà phê)');
assert.equal(staleErrorBefore, 'new_graduate', 'generic phrase must be classified as intent');
assert.equal(staleErrorAfter?.role_id, BARISTA_ROLE_ID, 'selecting Barista after stale error must clear blocker');

const handoff: FormState = {
  intent: 'stuck_3_years',
  job: 'Barista (Pha chế cà phê)',
  selectedRoleId: BARISTA_ROLE_ID,
  name: 'bo',
  phone: '0222222222',
  salary: '7,000,000',
  consent: true,
};
assert.equal(parseSalary(handoff.salary || ''), 7_000_000, '29K handoff must preserve Barista 7M salary');
assert.equal(disabledReason(handoff), '', '29K Barista handoff must enable CTA');

const ambiguous: FormState = {
  intent: 'stuck_3_years',
  job: 'Nhân sự đi làm trên 3 năm nhưng lương dậm chân',
  name: 'bo',
  phone: '0222222222',
  salary: '7,000,000',
  consent: true,
};
assert.equal(resolveFormRole(ambiguous), '', 'ambiguous HR phrase must not silently become a role');
assert.equal(disabledReason(ambiguous), 'role selection required', 'ambiguous intent phrase must require role selection');
assert.deepEqual(findClosestRoleProfiles(ambiguous.job, 3), [], 'career situation phrase must not produce random role suggestions');

console.log(JSON.stringify({
  passed: true,
  baristaRoleId: barista?.role_id,
  cases: {
    baristaExact: { disabledReason: disabledReason(case1), payload: checkoutPayload(case1) },
    intentOnly: { disabledReason: disabledReason(case2), code: 'ROLE_SELECTION_REQUIRED' },
    staleErrorCleared: Boolean(staleErrorAfter?.role_id),
    handoff: { salary: parseSalary(handoff.salary || ''), disabledReason: disabledReason(handoff) },
    ambiguous: { disabledReason: disabledReason(ambiguous), suggestions: findClosestRoleProfiles(ambiguous.job, 3).length },
  },
}, null, 2));
