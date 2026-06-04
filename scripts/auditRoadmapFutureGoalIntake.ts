import fs from 'node:fs';
import assert from 'node:assert/strict';
import { findClosestRoleProfiles, getRoleProfileById, resolveRoadmapRoleFromJobTitle } from '../lib/roleProfiles';
import { validateFinalRoadmapBeforePersist } from '../lib/roadmapFinalRoleGuard';
import { buildDeterministicRoadmapFallback } from '../lib/buildDeterministicRoadmapFallback';

const files = {
  roadmapPage: fs.readFileSync('app/roadmap/page.tsx', 'utf8'),
  checkoutRoute: fs.readFileSync('app/api/roadmap/checkout/route.ts', 'utf8'),
  generateRoute: fs.readFileSync('app/api/roadmap/generate/route.ts', 'utf8'),
  deterministicFallback: fs.readFileSync('lib/buildDeterministicRoadmapFallback.ts', 'utf8'),
  roadmapPromptCanonical: fs.readFileSync('lib/roadmapPromptCanonical.ts', 'utf8'),
  roadmapRoleLock: fs.readFileSync('lib/roadmapRoleLock.ts', 'utf8'),
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

function sourceBlock(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert(startIndex >= 0, `${start} must exist`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(endIndex > startIndex, `${end} must exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

function assertSourceContracts() {
  assert.match(files.roadmapPage, /futureGoalText/, 'roadmap page must collect futureGoalText');
  assert.match(files.roadmapPage, /currentJobTitle/, 'roadmap page must keep current job separate');
  assert.match(files.roadmapPage, /currentRoleId/, 'roadmap page must keep current role_id separate');
  assert.match(files.roadmapPage, /targetJobTitle/, 'roadmap page must keep target job separate');
  assert.match(files.roadmapPage, /targetRoleId/, 'roadmap page must keep target role_id separate');
  assert.match(files.roadmapPage, /targetSalaryAssessment/, 'roadmap page must classify target salary ambition');
  assert.match(files.roadmapPage, /allowCustomTargetRole/, 'roadmap page must support controlled custom target role');
  assert.match(files.roadmapPage, /Không thấy nghề phù hợp\? Tạo lộ trình custom/, 'unsupported role path must offer custom option');
  assert.match(files.roadmapPage, /Nghề này chưa có benchmark chuẩn trong hệ thống/, 'custom role path must warn benchmark is less precise');
  assert.match(files.roadmapPage, /AI dùng phần này làm bối cảnh mục tiêu\. Nghề benchmark vẫn lấy từ ô Nghề mục tiêu đã chọn/, 'future goal must not be treated as canonical role');

  const setupBlock = sourceBlock(files.roadmapPage, 'const setupDisabledReason = (() =>', 'const durationLabel = formatDurationLabel');
  assert.match(setupBlock, /!currentJobTitle\.trim\(\)/, 'setup must require current job');
  assert.match(setupBlock, /!futureGoalText\.trim\(\)/, 'setup must require future goal');
  assert.match(setupBlock, /!effectiveSelectedRoleId && !allowCustomTargetRole/, 'exact target role is required unless custom mode is explicit');
  assert.match(setupBlock, /!desiredTargetSalary/, 'setup must require desired target salary');

  const presetBlock = sourceBlock(files.roadmapPage, '<div className="hidden">', '{ROADMAP_PRESETS.map');
  assert(presetBlock.includes('hidden'), 'main intent template cards must be hidden');
  assert.match(files.roadmapPage, /<div className="hidden">\s*<label className="mb-1\.5 block text-\[10px\] font-mono font-bold uppercase text-\[#f0ede8\]\/60">Hướng muốn ưu tiên<\/label>/, 'hardcoded direction buttons must be hidden');

  assert.match(files.checkoutRoute, /allowCustomTargetRole/, 'checkout route must receive explicit custom mode');
  assert.match(files.checkoutRoute, /const resolvedJobRole = allowCustomTargetRole \? null : resolveRoadmapRoleFromJobTitle/, 'custom checkout must not silently resolve to unrelated exact role');
  assert.match(files.checkoutRoute, /const exactRoleId = allowCustomTargetRole \? '' :/, 'custom checkout must persist null role_id unless exact role is selected');
  assert.match(files.checkoutRoute, /!exactRoleId && !allowCustomTargetRole/, 'checkout must not silently allow unsupported role unless custom mode is explicit');
  assert.match(files.checkoutRoute, /role_id:\s+exactRoleId \|\| null/, 'custom checkout may persist null role_id intentionally');
  assert.match(files.checkoutRoute, /target_salary:\s+targetSalary/, 'checkout must persist requested target salary');

  assert.match(files.roadmapRoleLock, /buildCustomRoadmapRoleSkills/, 'custom role generation must have a non-throwing custom skill pack');
  assert.match(files.generateRoute, /isCustomRoadmapRole/, 'generate route must branch for custom role mode');
  assert.match(files.generateRoute, /buildCustomRoadmapRoleSkills\(jobTitle\)/, 'custom generation must not call exact role profile lock before fallback');
  assert.match(files.generateRoute, /custom_role_notice/, 'custom generated roadmap must carry limited-benchmark notice');
  assert.match(files.roadmapPromptCanonical, /custom_no_benchmark_role_id/, 'custom prompt must mark missing benchmark-safe role_id');
  assert.match(files.roadmapPromptCanonical, /Do not claim exact percentile or exact benchmark precision/, 'custom prompt must forbid false benchmark precision');

  assert.match(files.generateRoute, /Current role \/ where user is now/, 'prompt must include current role as context');
  assert.match(files.generateRoute, /Target role \/ destination for roadmap/, 'prompt must include target role as destination');
  assert.match(files.generateRoute, /Future goal in user's own words/, 'prompt must include user future goal');
  assert.match(files.generateRoute, /Free-text future goal must not become canonical role/, 'prompt must forbid free-text future goal becoming canonical role');
  assert.match(files.generateRoute, /Do not guarantee salary increase/, 'prompt must forbid salary guarantees');
  assert.match(files.deterministicFallback, /futureGoalText \|\| userInputs\.twoYearGoal/, 'deterministic fallback must prefer futureGoalText');
}

function assertUnsupportedRoleFlow() {
  const unsupported = 'Bác sĩ tâm lý';
  const exact = resolveRoadmapRoleFromJobTitle(unsupported);
  const suggestions = findClosestRoleProfiles(unsupported, 3).map(profile => profile.title);
  assert.equal(exact, null, 'unsupported role must not silently resolve to wrong exact role');
  assert(!suggestions.some(title => /vệ sinh|tạp vụ|thu gom rác/i.test(title)), 'unsupported role must not suggest cleaner/garbage roles');
  return { unsupported, exactRole: exact, suggestions };
}

function assertCustomUnsupportedRoleFlow() {
  const unsupported = 'Chuyên viên trị liệu nghệ thuật';
  const exact = resolveRoadmapRoleFromJobTitle(unsupported);
  const suggestions = findClosestRoleProfiles(unsupported, 3).map(profile => profile.title);
  assert.equal(exact, null, 'custom unsupported role must not silently resolve to wrong exact role');
  assert(!suggestions.some(title => /ve sinh|tap vu|thu gom rac|garbage|cleaner/i.test(normalize(title))), 'custom unsupported role must not suggest cleaner/garbage roles');
  const fallback = buildDeterministicRoadmapFallback({
    roleProfile: null,
    canonicalRoleTitle: unsupported,
    canonicalRoleId: null,
    userInputs: {
      currentPosition: unsupported,
      currentJobTitle: unsupported,
      targetJobTitle: unsupported,
      customTargetRole: true,
      futureGoalText: 'Muốn xây portfolio ca tư vấn, ranh giới đạo đức, bằng chứng kết quả và gói dịch vụ.',
      targetSalary: 20_000_000,
      durationMonths: 6,
    },
  });
  const guard = validateFinalRoadmapBeforePersist({
    vspiId: 'custom-unsupported-role',
    jobTitle: unsupported,
    roleId: null,
    roleProfile: null,
    finalRoadmap: fallback,
  });
  assert(guard.passed, `custom unsupported fallback must pass final guard ${JSON.stringify(guard)}`);
  const serialized = JSON.stringify(fallback);
  assert.match(serialized, /custom_role_notice/, 'custom fallback must include limited-benchmark notice');
  assert.doesNotMatch(serialized, /exact percentile|percentile ch[ií]nh x[aá]c|benchmark ch[ií]nh x[aá]c/i, 'custom fallback must not claim exact percentile precision');
  return { unsupported, exactRole: exact, suggestions, fallbackGuard: guard.code };
}

function assertTargetSalaryAssessment() {
  const currentSalary = 10_000_000;
  const targetSalary = 35_000_000;
  const ratio = targetSalary / currentSalary;
  const unrealistic = ratio > 1.75;
  assert(unrealistic, 'fixture should be high ambition for 6 months');
  assert.match(files.roadmapPage, /Mức này hơi tham vọng cho thời gian đã chọn/, 'UI must warn on stretch/unrealistic salary');
  assert.match(files.roadmapPage, /không phải lời hứa tăng lương|không phải lời hứa về kết quả lương|không phải kết quả lương tự xảy ra/, 'UI must not guarantee salary increase');
  return { currentSalary, targetSalary, months: 6, label: 'unrealistic/high ambition' };
}

function assertRoleGuardBlocks(roleId: string, contaminated: unknown, forbidden: string[]) {
  const profile = getRoleProfileById(roleId);
  assert(profile, `missing role profile ${roleId}`);
  const guard = validateFinalRoadmapBeforePersist({
    vspiId: `future-goal-${roleId}`,
    jobTitle: profile.title,
    roleId,
    roleProfile: profile,
    finalRoadmap: contaminated,
  });
  assert(!guard.passed, `${profile.title}: contaminated roadmap must fail`);
  assert(
    forbidden.some(term => guard.forbiddenHits.some(hit => normalize(hit).includes(normalize(term)) || normalize(term).includes(normalize(hit)))),
    `${profile.title}: forbidden hits should include at least one fixture term ${JSON.stringify({ expected: forbidden, actual: guard.forbiddenHits })}`
  );
  const fallback = buildDeterministicRoadmapFallback({
    roleProfile: profile,
    canonicalRoleTitle: profile.title,
    canonicalRoleId: roleId,
    userInputs: {
      currentPosition: profile.title,
      futureGoalText: `Muốn tăng scope và lương trong vai trò ${profile.title}`,
      weeklyTime: '3-5 giờ/tuần',
    },
  });
  const fallbackGuard = validateFinalRoadmapBeforePersist({
    vspiId: `future-goal-fallback-${roleId}`,
    jobTitle: profile.title,
    roleId,
    roleProfile: profile,
    finalRoadmap: fallback,
  });
  assert(fallbackGuard.passed, `${profile.title}: deterministic fallback must remain role-safe ${JSON.stringify(fallbackGuard)}`);
  return { roleId, title: profile.title, forbiddenHits: guard.forbiddenHits, fallback: fallbackGuard.code };
}

function assertRoleSafetyCanaries() {
  return [
    assertRoleGuardBlocks(
      'barista (pha che ca phe)__nha hang - khach san - du lich',
      { summary: 'Barista pha chế cà phê POS quầy bar', tasks: ['Học mise en place và phụ bếp trong kitchen.'] },
      ['mise en place', 'phụ bếp']
    ),
    assertRoleGuardBlocks(
      'bartender__nha hang - khach san - du lich',
      { summary: 'Bartender cocktail mocktail đồ uống quầy bar recipe định lượng', tasks: ['Làm Sous Chef, Bếp trưởng và kitchen KPI.'] },
      ['Sous Chef', 'Bếp trưởng', 'kitchen KPI']
    ),
    assertRoleGuardBlocks(
      'nhan vien check-in san bay__van tai - logistics',
      { summary: 'check-in boarding pass hộ chiếu visa hành lý gate baggage', tasks: ['Training cabin crew, Purser, in-flight grooming.'] },
      ['cabin crew', 'Purser', 'in-flight']
    ),
    assertRoleGuardBlocks(
      'nhan vien y te truong hoc__y te - cham soc suc khoe',
      { summary: 'sơ cứu học đường hồ sơ sức khỏe học sinh thuốc dị ứng phụ huynh', tasks: ['Soạn giáo án, tuyển sinh và mentor IELTS.'] },
      ['giáo án', 'tuyển sinh', 'IELTS']
    ),
    assertRoleGuardBlocks(
      'cmo (giam doc marketing)__quan tri dieu hanh',
      { summary: 'CMO growth revenue board budget brand health', tasks: ['Xin review lương như nhân viên marketing junior.'] },
      ['xin review lương', 'junior']
    ),
    assertRoleGuardBlocks(
      'ceo / tong giam doc__quan tri dieu hanh',
      { summary: 'CEO P&L board operating dashboard strategy memo', tasks: ['Xin review HR và lên Specialist.'] },
      ['xin review HR', 'Specialist']
    ),
  ];
}

function assertSameRoleGrowthAndSwitchContracts() {
  const checkoutPayload = sourceBlock(files.roadmapPage, "body: JSON.stringify({", "formStartedAt: formStartedAtRef.current");
  assert.match(checkoutPayload, /currentRoleId: effectiveCurrentRoleId \|\| undefined/, 'checkout payload must send currentRoleId');
  assert.match(checkoutPayload, /targetRoleId: effectiveSelectedRoleId \|\| undefined/, 'checkout payload must send targetRoleId');
  assert.match(checkoutPayload, /futureGoalText: futureGoalText\.trim\(\)/, 'checkout payload must send futureGoalText');
  assert.match(checkoutPayload, /targetSalaryAssessment/, 'checkout payload must send target salary assessment');
  assert.match(files.roadmapPage, /const effectiveCurrentRoleId = currentRoleProfile\?\.key \|\| resolvedCurrentRole\?\.role_id \|\| ''/, 'current role can resolve independently');
  assert.match(files.roadmapPage, /const effectiveSelectedRoleId = allowCustomTargetRole \? '' : \(selectedRoleProfile\?\.key \|\| resolvedJobRole\?\.role_id \|\| ''\)/, 'target role can resolve independently and same-role growth is allowed');
  assert.doesNotMatch(files.roadmapPage, /currentRoleId !== effectiveSelectedRoleId/, 'same current and target role must not be blocked');
  return { sameRoleGrowth: 'allowed', careerSwitch: 'currentRoleId and targetRoleId stored separately' };
}

function assertResumeCopy() {
  assert.doesNotMatch(files.roadmapPage, /Đang ở tuần \{resumeCurrentWeek\}/, 'resume copy must not say current week when reporting earliest missing task');
  assert.match(files.roadmapPage, /Việc còn thiếu gần nhất: Tuần \{resumeCurrentWeek\}/, 'resume copy must show nearest missing task week');
  return { misleadingCurrentWeekCopy: false, nearestMissingTaskWeek: true };
}

assertSourceContracts();

const result = {
  passed: true,
  sameRoleAndSwitch: assertSameRoleGrowthAndSwitchContracts(),
  unsupportedRole: assertCustomUnsupportedRoleFlow(),
  legacyUnsupportedRole: assertUnsupportedRoleFlow(),
  targetSalary: assertTargetSalaryAssessment(),
  roleSafety: assertRoleSafetyCanaries(),
  resumeCopy: assertResumeCopy(),
};

console.log(JSON.stringify(result, null, 2));
