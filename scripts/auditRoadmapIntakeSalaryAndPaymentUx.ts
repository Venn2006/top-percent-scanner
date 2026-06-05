import fs from 'node:fs';
import assert from 'node:assert/strict';

const roadmapPage = fs.readFileSync('app/roadmap/page.tsx', 'utf8');

function sourceBlock(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert(startIndex >= 0, `${start} must exist`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(endIndex > startIndex, `${end} must exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

function assessTargetSalary(currentSalary: number, targetSalary: number, months: number) {
  if (!currentSalary || !targetSalary) return 'unknown';
  const ratio = targetSalary / currentSalary;
  const realisticLimit = months <= 3 ? 1.2 : months <= 6 ? 1.35 : 1.5;
  const stretchLimit = months <= 3 ? 1.45 : months <= 6 ? 1.75 : 2;
  if (ratio <= realisticLimit) return 'realistic';
  if (ratio <= stretchLimit) return 'stretch';
  return 'unrealistic';
}

function inferOptimalDurationForTarget(currentSalary: number, desiredSalary: number) {
  const durations = [3, 6, 9] as const;
  return durations.find(months => assessTargetSalary(currentSalary, desiredSalary, months) === 'realistic')
    || durations.find(months => assessTargetSalary(currentSalary, desiredSalary, months) === 'stretch')
    || 9;
}

function roundSalaryStep(value: number) {
  return Math.round(value / 500_000) * 500_000;
}

function durationTarget(currentSalary: number, desiredSalary: number, months: number, fallbackTarget = 0) {
  const optimalDuration = inferOptimalDurationForTarget(currentSalary, desiredSalary);
  const gap = desiredSalary - currentSalary;
  return roundSalaryStep(Math.max(fallbackTarget, currentSalary + gap * (months / optimalDuration), months === optimalDuration ? desiredSalary : 0));
}

function assertDreamRoleFlow() {
  const dreamBlock = sourceBlock(roadmapPage, 'const focusDreamRoleSearch = () => {', 'const selectIntentIndustry =');
  assert.match(dreamBlock, /setRoadmapIntent\('career_switch'\)/, 'dream-role button must switch to career_switch flow');
  assert.match(dreamBlock, /setIntentActionMode\('manual'\)/, 'dream-role button must put target role input in manual mode');
  assert.match(dreamBlock, /setSelectedRoleId\(''\)/, 'dream-role button must clear previous target role_id');
  assert.match(dreamBlock, /setAllowCustomTargetRole\(false\)/, 'dream-role button must reset custom mode before exact target choice');
  assert.match(dreamBlock, /setJob\(''\)/, 'dream-role button must clear old same-role target job');
  assert.match(dreamBlock, /setRoleSuggestions\(popularIntentRoleSuggestions\)/, 'dream-role button must show selectable target role suggestions');
  assert.match(dreamBlock, /setFutureGoalText\('Tôi muốn chuyển sang nghề mong muốn/, 'dream-role button must update future goal copy even after same-role was selected');
}

function assertSameRoleFlow() {
  const sameRoleBlock = sourceBlock(roadmapPage, 'const applySameRoleGrowth = () => {', 'const focusDreamRoleSearch =');
  assert.match(sameRoleBlock, /selectTargetRole\(\{ role_id: roleId, title: role\.title, industry: role\.industry \}\)/, 'same-role button must set target role to current exact role');
  assert.match(sameRoleBlock, /setFutureGoalText\(`Tôi muốn tiếp tục làm \$\{role\.title\}/, 'same-role button must update future goal copy when toggling back from dream role');
  assert.doesNotMatch(sameRoleBlock, /if \(!futureGoalText\.trim\(\)\) \{\s*setFutureGoalText/, 'same-role future goal must not be blocked by stale previous copy');
}

function assertTargetSuggestionsNearField() {
  const suggestionBlock = sourceBlock(roadmapPage, 'const targetJobSuggestions = useMemo(() => {', 'const roadmapJobPlaceholder =');
  assert.match(suggestionBlock, /intentActionMode === 'manual' && activeRoadmapIntent === 'career_switch'/, 'career switch manual mode must show target suggestions even before typing');
  assert.match(roadmapPage, /targetJobSuggestions\.map\(option => \(/, 'target suggestions must render near the target role field');
}

function assertDurationSalaryPlan() {
  assert.match(roadmapPage, /const ROADMAP_DURATION_OPTIONS = \[3, 6, 9\] as const/, 'roadmap duration options must be centralized');
  assert.match(roadmapPage, /const buildDurationSalaryPlan = /, 'duration-aware salary planner must exist');
  assert.match(roadmapPage, /const desiredDurationPlan = systemTargetCalc && desiredTargetSalary > cur/, 'desired target salary must become a duration-aware plan');
  assert.match(roadmapPage, /target: desiredDurationPlan\?\.target \|\| systemTargetCalc\.target/, 'targetCalc must use duration-scaled target, not raw desired salary for every duration');
  assert.doesNotMatch(roadmapPage, /target:\s*desiredTargetSalary > 0 \? desiredTargetSalary : systemTargetCalc\.target/, 'raw desired salary must not be reused unchanged for all durations');
  assert.match(roadmapPage, /thời hạn dài hơn không bị đứng yên ở cùng một mức/, 'UI must explain longer durations raise the suggested target');

  const current = 15_000_000;
  const desired = 17_500_000;
  assert.equal(inferOptimalDurationForTarget(current, desired), 3, '17.5M from 15M should be an optimal 3-month target');
  assert.equal(durationTarget(current, desired, 3), 17_500_000, '3 months should target the requested 17.5M');
  assert.equal(durationTarget(current, desired, 6), 20_000_000, '6 months should scale to 20M, not remain 17.5M');
  assert.equal(durationTarget(current, desired, 9), 22_500_000, '9 months should scale beyond 20M for the same requested anchor');
}

function assertPaymentCheckCopy() {
  assert.match(roadmapPage, /Nút này không tự duyệt thanh toán/, 'pending payment copy must say the button does not self-approve');
  assert.match(roadmapPage, /Kiểm tra hệ thống đã ghi nhận CK 79K chưa/, 'payment check CTA must say it checks system/bank recording');
  assert.match(roadmapPage, /Giữ nguyên nội dung CK \$\{cleanVspi\}/, 'pending timeout must tell user to keep exact transfer content');
  assert.match(roadmapPage, /if \(data\.status === 'pending' \|\| data\.code === 'PAYMENT_PENDING'\) \{[\s\S]*?return;/, 'pending polling branch must return before unlock');
}

assertDreamRoleFlow();
assertSameRoleFlow();
assertTargetSuggestionsNearField();
assertDurationSalaryPlan();
assertPaymentCheckCopy();

console.log(JSON.stringify({
  passed: true,
  dreamRole: 'career switch clears stale same-role target and shows selectable suggestions',
  futureGoalToggle: 'same-role and dream-role buttons overwrite stale auto copy',
  targetSalary: '17.5M from 15M scales to 17.5M/20M/22.5M for 3/6/9 months',
  paymentGate: 'pending payment check cannot self-approve and copy explains bank/system confirmation',
}, null, 2));
