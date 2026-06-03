import assert from 'node:assert/strict';
import { buildDeterministicRoadmapFallback } from '../lib/buildDeterministicRoadmapFallback';
import { repairRoadmapAfterRoleGuardFail } from '../lib/repairRoadmapAfterRoleGuardFail';
import { validateFinalRoadmapBeforePersist } from '../lib/roadmapFinalRoleGuard';
import { getRoleProfileById } from '../lib/roleProfiles';

const roles = {
  bartender: 'bartender__nha hang - khach san - du lich',
  schoolHealth: 'nhan vien y te truong hoc__y te - cham soc suc khoe',
  cmo: 'cmo (giam doc marketing)__quan tri dieu hanh',
  ceo: 'ceo / tong giam doc__quan tri dieu hanh',
  checkin: 'nhan vien check-in san bay__van tai - logistics',
  server: 'nhan vien phuc vu ban (waiter/waitress)__nha hang - khach san - du lich',
  restaurantManager: 'quan ly nha hang__nha hang - khach san - du lich',
  storeManager: 'quan ly cua hang__ban le - sieu thi',
  warehouseManager: 'truong kho__chuoi cung ung - logistics',
};

function profile(roleId: string) {
  const roleProfile = getRoleProfileById(roleId);
  assert(roleProfile, `missing role profile ${roleId}`);
  return roleProfile;
}

function guard(roleId: string, finalRoadmap: unknown) {
  const roleProfile = profile(roleId);
  return validateFinalRoadmapBeforePersist({
    vspiId: `fixture-${roleId}`,
    jobTitle: roleProfile.title,
    roleId,
    roleProfile,
    finalRoadmap,
  });
}

function assertFailsWithForbidden(name: string, roleId: string, finalRoadmap: unknown, expectedHits: string[]) {
  const result = guard(roleId, finalRoadmap);
  assert.equal(result.passed, false, `${name} must fail final guard`);
  assert.equal(result.code, 'ROADMAP_ROLE_GUARD_FAILED', `${name} must expose failed final guard code`);
  for (const hit of expectedHits) {
    assert(result.forbiddenHits.includes(hit), `${name} missing forbidden hit ${hit}: ${JSON.stringify(result)}`);
  }
  return result;
}

function assertPasses(name: string, roleId: string, finalRoadmap: unknown) {
  const result = guard(roleId, finalRoadmap);
  assert.equal(result.passed, true, `${name} must pass final guard: ${JSON.stringify(result)}`);
  return result;
}

const badBartender = {
  goal: 'Bartender roadmap with kitchen leak',
  summary: 'Bartender, cocktail, mocktail, recipe, upsell, POS, speed of service, quay bar.',
  weeks: [
    {
      week: 1,
      focus: 'Bar station and kitchen leak',
      tasks: [
        'Lam bartender tai quay bar: pha che cocktail/mocktail theo recipe, dinh luong, upsell va ghi POS.',
        'Sau do hoc lo trinh len Sous Chef va viet checklist mise en place cho bep.',
      ],
      milestone: 'Co bar evidence nhung bi leak kitchen.',
    },
  ],
};

const cleanBartender = {
  goal: 'Bartender bar-beverage roadmap',
  summary: 'Bartender tap trung pha che cocktail, mocktail, do uong, quay bar, recipe va speed of service.',
  weeks: [
    {
      week: 1,
      focus: 'Bar station va recipe',
      tasks: [
        'Chuan bi bar station, garnish, da, syrup va dung cu truoc gio cao diem.',
        'Pha che cocktail/mocktail theo recipe, dung dinh luong va ghi order bang POS.',
        'Ghi log upsell do uong, ton kho quay bar, ve sinh quay bar va feedback khach hang.',
      ],
      milestone: 'Co log speed of service va ton kho quay bar.',
    },
  ],
};

const schoolHealthLeak = {
  goal: 'School health wrong teacher copy',
  summary: 'So cuu, ho so suc khoe, y te hoc duong, thuoc, phu huynh, nhung bi leak giao vien.',
  weeks: [{ week: 1, tasks: ['Viet giao an, cham bai, lam mentor IELTS va lesson plan cho hoc sinh.'] }],
};

const cmoLeak = {
  goal: 'CMO wrong lower path copy',
  summary: 'CMO growth, revenue, budget, board, brand health, campaign P&L.',
  weeks: [{ week: 1, tasks: ['Di theo Brand Manager, Marketing Lead tai SME va xin review luong nhu nhan vien execution.'] }],
};

const ceoLeak = {
  goal: 'CEO wrong employee copy',
  summary: 'CEO P&L, board, operating dashboard, strategy memo, org design, stakeholder.',
  weeks: [{ week: 1, tasks: ['Xin review HR, len quan ly tu Specialist va viet roadmap Senior / Specialist cho CEO.'] }],
};

async function main() {
  const badBartenderGuard = assertFailsWithForbidden('bad bartender same-industry output', roles.bartender, badBartender, ['Sous Chef', 'mise en place']);
  const cleanBartenderGuard = assertPasses('clean bartender output', roles.bartender, cleanBartender);
  const schoolHealthGuard = assertFailsWithForbidden('school health teacher leak', roles.schoolHealth, schoolHealthLeak, ['giao an', 'cham bai', 'mentor', 'IELTS']);
  const cmoGuard = assertFailsWithForbidden('CMO lower-role leak', roles.cmo, cmoLeak, ['Brand Manager', 'Marketing Lead tai SME', 'Marketing Lead', 'xin review luong']);
  const ceoGuard = assertFailsWithForbidden('CEO employee-copy leak', roles.ceo, ceoLeak, ['xin review HR', 'Specialist', 'Senior / Specialist']);

  const bartenderProfile = profile(roles.bartender);
  const bartenderFallback = buildDeterministicRoadmapFallback({
    roleProfile: bartenderProfile,
    canonicalRoleTitle: bartenderProfile.title,
    canonicalRoleId: roles.bartender,
    userInputs: { currentPosition: 'Bartender', weeklyTime: '3-5 gio/tuan' },
  });
  const bartenderFallbackGuard = assertPasses('bartender deterministic fallback', roles.bartender, bartenderFallback);

  const repairResult = await repairRoadmapAfterRoleGuardFail({
    failedRoadmap: badBartender,
    finalGuardResult: badBartenderGuard,
    roleProfile: bartenderProfile,
    canonicalRoleTitle: bartenderProfile.title,
    canonicalRoleId: roles.bartender,
    userInputs: { currentPosition: 'Bartender', weeklyTime: '3-5 gio/tuan' },
    callModel: async () => JSON.stringify(badBartender),
  });
  assert.equal(repairResult.source, 'fallback', 'dirty same-industry repair must fall back');
  const repairFallbackGuard = assertPasses('dirty repair fallback output', roles.bartender, repairResult.roadmap);

  const boundaryPasses = [
    assertPasses('airport check-in required boundary', roles.checkin, 'check-in boarding pass ho chieu visa hanh ly quay check-in hanh khach passenger service supervisor gate baggage'),
    assertPasses('restaurant server boundary', roles.server, 'khach ban order menu POS phuc vu mon don ban upsell'),
    assertPasses('restaurant manager boundary', roles.restaurantManager, 'food cost labor cost ton kho SOP KPI team complaint'),
    assertPasses('store manager boundary', roles.storeManager, 'doanh thu cua hang ton kho lich ca team KPI trung bay complaint'),
    assertPasses('warehouse manager boundary', roles.warehouseManager, 'ton kho layout kho cycle count nhap xuat team kho KPI kho SOP'),
  ];

  console.log(JSON.stringify({
    passed: true,
    badBartender: badBartenderGuard,
    cleanBartender: cleanBartenderGuard,
    bartenderFallback: bartenderFallbackGuard,
    repairFallback: repairFallbackGuard,
    schoolHealth: schoolHealthGuard,
    cmo: cmoGuard,
    ceo: ceoGuard,
    boundaryPasses: boundaryPasses.map(item => ({ reason: item.reason, code: item.code })),
    wouldSaveContaminatedBartender: badBartenderGuard.passed,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
