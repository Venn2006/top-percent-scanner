import fs from 'node:fs';
import assert from 'node:assert/strict';
import { detectRoadmapIntentPhrase, isRoadmapIntentPhrase } from '../lib/roadmapAccess';
import { findClosestRoleProfiles, getExactRoleProfile } from '../lib/roleProfiles';

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

const forbiddenRandomSuggestions = [
  'Nhân viên vệ sinh công nghiệp',
  'Nhân viên tạp vụ văn phòng',
  'Nhân viên thu gom rác',
];

const files = {
  roadmapPage: fs.readFileSync('app/roadmap/page.tsx', 'utf8'),
  checkoutRoute: fs.readFileSync('app/api/roadmap/checkout/route.ts', 'utf8'),
  roleProfiles: fs.readFileSync('lib/roleProfiles.ts', 'utf8'),
};

function assertSourceContracts() {
  assert.match(files.roadmapPage, /roadmapIntent/, 'roadmap page must keep intent separate from job');
  assert.match(files.roadmapPage, /setJob\(''\)/, 'intent presets must clear job instead of writing template copy');
  assert.doesNotMatch(files.roadmapPage, /job:\s*'Sinh viên mới tốt nghiệp chưa rõ định hướng'/, 'new graduate preset must not define fake job');
  assert.doesNotMatch(files.roadmapPage, /job:\s*'Nhân sự đi làm trên 3 năm/, 'stuck preset must not define fake job');
  assert.doesNotMatch(files.roadmapPage, /job:\s*'Nhân sự muốn đổi hướng/, 'career switch preset must not define fake job');
  assert.match(files.checkoutRoute, /ROLE_SELECTION_REQUIRED/, 'checkout must return safe role-selection code for intent phrases');
  assert.match(files.checkoutRoute, /detectRoadmapIntentPhrase/, 'checkout must classify non-job intent phrases');
  assert.match(files.roleProfiles, /isRoadmapIntentPhrase\(jobTitle\)/, 'role suggestions must deny intent phrases before fuzzy matching');
}

function assertNoRandomSuggestions(input: string, expectedIntent: string) {
  const intent = detectRoadmapIntentPhrase(input);
  assert.equal(intent, expectedIntent, `${input}: wrong intent`);
  assert(isRoadmapIntentPhrase(input), `${input}: should be a roadmap intent phrase`);
  const suggestions = findClosestRoleProfiles(input, 3);
  assert.equal(suggestions.length, 0, `${input}: intent phrase must not produce fuzzy role suggestions`);
  const suggestionTitles = suggestions.map(item => item.title);
  for (const forbidden of forbiddenRandomSuggestions) {
    assert(!suggestionTitles.some(title => normalize(title) === normalize(forbidden)), `${input}: suggested forbidden role ${forbidden}`);
  }
  return { input, intent, suggestions: suggestionTitles };
}

function assertExactRoleStillWorks(input: string, exactTitle?: string) {
  const exact = getExactRoleProfile(exactTitle || input);
  const suggestions = findClosestRoleProfiles(input, 5);
  assert(!isRoadmapIntentPhrase(input), `${input}: exact role must not be classified as roadmap intent`);
  assert(exact || suggestions.length > 0, `${input}: exact role or normal role suggestion should still work`);
  return {
    input,
    exactRoleId: exact?.key || null,
    suggestions: suggestions.map(item => ({ role_id: item.key, title: item.title })).slice(0, 3),
  };
}

assertSourceContracts();

const intentResults = [
  assertNoRandomSuggestions('Mới tốt nghiệp', 'new_graduate'),
  assertNoRandomSuggestions('Sinh viên mới tốt nghiệp chưa rõ định hướng', 'new_graduate'),
  assertNoRandomSuggestions('3+ năm dậm chân', 'stuck_3_years'),
  assertNoRandomSuggestions('lương dậm chân', 'stuck_3_years'),
  assertNoRandomSuggestions('Muốn đổi hướng', 'career_switch'),
  assertNoRandomSuggestions('đổi ngành', 'career_switch'),
  assertNoRandomSuggestions('chưa biết làm nghề gì', 'new_graduate'),
  assertNoRandomSuggestions('tìm hướng đi', 'new_graduate'),
];

const exactRoleResults = [
  assertExactRoleStillWorks('Barista', 'Barista (Pha chế cà phê)'),
  assertExactRoleStillWorks('Nhân viên bán hàng'),
  assertExactRoleStillWorks('Nhân viên hành chính nhân sự'),
];

console.log(JSON.stringify({
  passed: true,
  roadmapIntentTemplates: {
    newGraduate: 'ROLE_SELECTION_REQUIRED until exact role selected',
    stuck3Years: 'job_title remains empty/current exact job; template phrase denied',
    careerSwitch: 'current and target job are separate; target role required',
    noRandomJobMatching: true,
    exactRoleRequiredBeforeBenchmark: true,
  },
  intentResults,
  exactRoleResults,
}, null, 2));
