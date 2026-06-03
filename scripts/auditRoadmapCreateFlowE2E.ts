import fs from 'node:fs';
import assert from 'node:assert/strict';
import { getRoleProfileById, findClosestRoleProfiles } from '../lib/roleProfiles';
import { computeAlignedRoadmapTarget } from '../lib/salaryTargetConsistency';
import { validateFinalRoadmapBeforePersist } from '../lib/roadmapFinalRoleGuard';
import { buildDeterministicRoadmapFallback } from '../lib/buildDeterministicRoadmapFallback';

interface CaseResult {
  name: string;
  passed: boolean;
  details: Record<string, unknown>;
}

const files = {
  roadmapPage: fs.readFileSync('app/roadmap/page.tsx', 'utf8'),
  checkoutRoute: fs.readFileSync('app/api/roadmap/checkout/route.ts', 'utf8'),
  generateRoute: fs.readFileSync('app/api/roadmap/generate/route.ts', 'utf8'),
  scanRoute: fs.readFileSync('app/api/scan/route.ts', 'utf8'),
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase();
}

function containsAny(text: string, terms: string[]) {
  const normalized = normalize(text);
  return terms.filter(term => normalized.includes(normalize(term)));
}

function mockRoadmapText(roleTitle: string, requiredTerms: string[]) {
  return {
    goal: `Checklist tăng lương cho ${roleTitle}`,
    summary: `Bám đúng nghề ${roleTitle}: ${requiredTerms.join(', ')}`,
    weeks: requiredTerms.slice(0, 4).map((term, index) => ({
      week: index + 1,
      focus: `Tạo bằng chứng ${term}`,
      tasks: [`Ghi log ${term}`, `Xin feedback ${term}`],
      milestone: `Có proof ${term}`,
    })),
    negotiation_timing: 'Review sau khi có đủ bằng chứng',
    salary_projection: 'Không cam kết tăng lương tự động',
  };
}

function assertSourceContracts() {
  assert.match(files.checkoutRoute, /ROLE_CONFIRMATION_REQUIRED/, 'checkout must require role confirmation for ambiguous custom job');
  assert.match(files.checkoutRoute, /findClosestRoleProfiles/, 'checkout must return closest role suggestions');
  assert.match(files.checkoutRoute, /getExactRoleProfile/, 'checkout must auto-lock exact public roles');
  assert.match(files.generateRoute, /MISSING_ROLE_ID/, 'generate must reject missing role_id safely');
  assert.match(files.generateRoute, /MISSING_ACCESS/, 'generate must reject missing access safely');
  assert.match(files.generateRoute, /ROADMAP_GENERATION_FAILED/, 'generate must map unexpected generation errors');
  assert.doesNotMatch(files.generateRoute, /error:\s*'Internal error'/, 'generate must not return generic Internal error');
  assert.match(files.scanRoute, /INVALID_JSON/, 'scan must return 400 for malformed JSON');
  assert.match(files.roadmapPage, /safeRoadmapErrorMessage/, 'UI must map safe error codes');
  assert.match(files.roadmapPage, /roleSuggestions\.map/, 'UI must render role confirmation choices');
  assert.match(files.roadmapPage, /getRoadmapStorageKey/, 'roadmap localStorage must be scoped by record/access');
}

function assertCase(input: {
  name: string;
  roleId: string;
  salary: number;
  targetSalary: number;
  targetLabel: string;
  required: string[];
  forbidden: string[];
}) {
  const profile = getRoleProfileById(input.roleId);
  assert(profile, `${input.name}: missing role profile ${input.roleId}`);
  const target = computeAlignedRoadmapTarget({
    currentSalary: input.salary,
    strategicTargetSalary: input.targetSalary,
    fallbackTargetSalary: Math.max(input.salary * 1.25, input.salary + 3_000_000),
    durationMonths: 6,
  });
  assert.equal(target.targetSalary, input.targetSalary, `${input.name}: report target salary must be preserved`);
  const roadmap = mockRoadmapText(profile.title, input.required);
  const guard = validateFinalRoadmapBeforePersist({
    vspiId: `mock-${input.name}`,
    jobTitle: profile.title,
    roleId: input.roleId,
    roleProfile: profile,
    finalRoadmap: roadmap,
  });
  const text = JSON.stringify(roadmap);
  const requiredHits = containsAny(text, input.required);
  const forbiddenHits = containsAny(text, input.forbidden);
  assert(requiredHits.length >= Math.min(3, input.required.length), `${input.name}: missing role-specific terms`);
  assert.equal(forbiddenHits.length, 0, `${input.name}: sibling contamination ${forbiddenHits.join(', ')}`);
  assert(guard.passed, `${input.name}: final guard failed ${guard.reason}`);
  return { targetSalary: target.targetSalary, targetLabel: input.targetLabel, requiredHits };
}

function assertFinalGuardBlocksSameIndustryLeaks() {
  const cases = [
    {
      name: 'Bartender kitchen contamination',
      roleId: 'bartender__nha hang - khach san - du lich',
      roadmap: { summary: 'Bartender cocktail mocktail recipe upsell POS speed of service quay bar', tasks: ['Hoc Sous Chef va mise en place trong bep.'] },
      forbidden: ['Sous Chef', 'mise en place'],
    },
    {
      name: 'School health teacher contamination',
      roleId: 'nhan vien y te truong hoc__y te - cham soc suc khoe',
      roadmap: { summary: 'so cuu ho so suc khoe y te hoc duong thuoc phu huynh', tasks: ['Viet giao an, cham bai, mentor IELTS.'] },
      forbidden: ['giao an', 'cham bai', 'mentor', 'IELTS'],
    },
    {
      name: 'CMO lower-role contamination',
      roleId: 'cmo (giam doc marketing)__quan tri dieu hanh',
      roadmap: { summary: 'CMO growth revenue budget board brand health campaign P&L', tasks: ['Brand Manager, Marketing Lead tai SME va xin review luong.'] },
      forbidden: ['Brand Manager', 'Marketing Lead tai SME', 'Marketing Lead', 'xin review luong'],
    },
    {
      name: 'CEO employee-copy contamination',
      roleId: 'ceo / tong giam doc__quan tri dieu hanh',
      roadmap: { summary: 'CEO P&L board operating dashboard strategy memo org design stakeholder', tasks: ['xin review HR, len quan ly tu Specialist.'] },
      forbidden: ['xin review HR', 'Specialist'],
    },
  ];

  return cases.map(item => {
    const profile = getRoleProfileById(item.roleId);
    assert(profile, item.name + ': missing role profile');
    const guard = validateFinalRoadmapBeforePersist({
      vspiId: 'mock-same-industry-' + item.name,
      jobTitle: profile.title,
      roleId: item.roleId,
      roleProfile: profile,
      finalRoadmap: item.roadmap,
    });
    assert(!guard.passed, item.name + ': contaminated output must fail final guard');
    for (const hit of item.forbidden) {
      assert(guard.forbiddenHits.includes(hit), item.name + ': missing forbidden hit ' + hit + ' ' + JSON.stringify(guard));
    }
    const fallback = buildDeterministicRoadmapFallback({
      roleProfile: profile,
      canonicalRoleTitle: profile.title,
      canonicalRoleId: item.roleId,
      userInputs: { currentPosition: profile.title, weeklyTime: '3-5 gio/tuan' },
    });
    const fallbackGuard = validateFinalRoadmapBeforePersist({
      vspiId: 'mock-same-industry-fallback-' + item.name,
      jobTitle: profile.title,
      roleId: item.roleId,
      roleProfile: profile,
      finalRoadmap: fallback,
    });
    assert(fallbackGuard.passed, item.name + ': deterministic fallback must pass final guard ' + JSON.stringify(fallbackGuard));
    return { name: item.name, forbiddenHits: guard.forbiddenHits, fallback: fallbackGuard.code, wouldSaveContaminated: guard.passed };
  });
}

function assertCustomAmbiguousHrPhrase() {
  const phrase = 'Nhân sự đi làm trên 3 năm nhưng lương dậm chân tại chỗ';
  const suggestions = findClosestRoleProfiles(phrase, 3);
  assert.equal(suggestions.length, 3, 'custom ambiguous phrase should produce 3 role suggestions');
  assert(!suggestions.some(profile => normalize(profile.title) === normalize(phrase)), 'ambiguous phrase must not be treated as exact role');
  assert(suggestions.every(profile => normalize(profile.industry || '').includes('nhan su')), 'ambiguous HR phrase should stay in HR role suggestions');
  return suggestions.map(profile => ({ role_id: profile.key, title: profile.title, industry: profile.industry }));
}

function assertSamePhoneMultiRecord() {
  const records = [
    { vspiId: 'VSPI-2026-BAR-0001', accessCode: 'BARACCESS001', job: 'Bartender', salary: 8_000_000, roleId: 'bartender__nha hang - khach san - du lich' },
    { vspiId: 'VSPI-2026-CMO-0001', accessCode: 'CMOACCESS001', job: 'CMO (Giám đốc Marketing)', salary: 35_000_000, roleId: 'cmo (giam doc marketing)__quan tri dieu hanh' },
    { vspiId: 'VSPI-2026-CEO-0001', accessCode: 'CEOACCESS001', job: 'CEO / Tổng giám đốc', salary: 300_000_000, roleId: 'ceo / tong giam doc__quan tri dieu hanh' },
  ];
  const keys = records.map(record => `vspi-roadmap-v2:${record.vspiId}:${record.accessCode}`);
  assert.equal(new Set(keys).size, records.length, 'same phone records must have isolated storage keys');
  for (const record of records) {
    assert(getRoleProfileById(record.roleId), `${record.job}: role_id must exist`);
  }
  return records.map((record, index) => ({ ...record, storageKey: keys[index] }));
}

const results: CaseResult[] = [];

assertSourceContracts();
results.push({ name: 'source contracts', passed: true, details: {} });

results.push({
  name: 'Bartender',
  passed: true,
  details: assertCase({
    name: 'Bartender',
    roleId: 'bartender__nha hang - khach san - du lich',
    salary: 8_000_000,
    targetSalary: 11_000_000,
    targetLabel: 'Top 50%',
    required: ['bartender', 'pha che', 'cocktail', 'mocktail', 'quay bar', 'recipe', 'upsell'],
    forbidden: ['dau bep', 'sous chef', 'bep truong', 'kitchen manager', 'phu bep', 'mise en place'],
  }),
});

results.push({
  name: 'CMO 35M',
  passed: true,
  details: assertCase({
    name: 'CMO 35M',
    roleId: 'cmo (giam doc marketing)__quan tri dieu hanh',
    salary: 35_000_000,
    targetSalary: 68_000_000,
    targetLabel: 'Top 80%',
    required: ['cmo', 'brand strategy', 'campaign P&L', 'budget', 'media mix', 'brand health', 'growth', 'board', 'revenue'],
    forbidden: ['brand manager', 'marketing lead', 'junior marketing'],
  }),
});

results.push({
  name: 'CEO 300M',
  passed: true,
  details: assertCase({
    name: 'CEO 300M',
    roleId: 'ceo / tong giam doc__quan tri dieu hanh',
    salary: 300_000_000,
    targetSalary: 420_000_000,
    targetLabel: 'Top 10%',
    required: ['ceo', 'p&l', 'board', 'operating dashboard', 'strategy memo', 'org design', 'stakeholder'],
    forbidden: ['hr review', 'employee appraisal', 'nhan su danh gia'],
  }),
});

results.push({ name: 'same-industry final guard', passed: true, details: { cases: assertFinalGuardBlocksSameIndustryLeaks() } });
results.push({ name: 'custom ambiguous HR phrase', passed: true, details: { suggestions: assertCustomAmbiguousHrPhrase() } });
results.push({ name: 'same phone multi-record', passed: true, details: { records: assertSamePhoneMultiRecord() } });

console.log(JSON.stringify({ passed: true, results }, null, 2));
