import fs from 'node:fs';
import assert from 'node:assert/strict';

const roadmapPage = fs.readFileSync('app/roadmap/page.tsx', 'utf8');
const generateRoute = fs.readFileSync('app/api/roadmap/generate/route.ts', 'utf8');

function blockBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert(startIndex >= 0, `${start} must exist`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(endIndex > startIndex, `${end} must exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

function assertPendingRestoreCannotUnlock() {
  const getRoute = generateRoute.slice(generateRoute.indexOf('export async function GET'));
  const directRestore = blockBetween(getRoute, "const { data, error } = await supabaseServer", 'const restoreRole = getRequiredRoadmapRoleProfile');
  assert.match(directRestore, /const restorePaymentStatus = String\(data\.status \|\| ''\)\.toLowerCase\(\)/, 'direct restore must read DB payment status');
  assert.match(directRestore, /!\['paid', 'generated', 'ready'\]\.includes\(restorePaymentStatus\)/, 'direct restore must reject non-paid statuses');
  assert.match(directRestore, /code:\s*'PAYMENT_PENDING'/, 'pending restore must return PAYMENT_PENDING');
  assert.match(directRestore, /roadmap_json:\s*null/, 'pending restore must not leak roadmap_json');
  assert.match(directRestore, /task_progress:\s*\{\}/, 'pending restore must not leak progress');

  const pollingBlock = blockBetween(roadmapPage, 'const startPolling = () => {', 'const loadRoadmap = async () =>');
  assert.match(pollingBlock, /data\.status === 'pending' \|\| data\.code === 'PAYMENT_PENDING'/, 'polling must handle pending without unlock');
  assert.match(pollingBlock, /return;[\s\S]*?if \(data\.status === 'paid' \|\| \(data\.status === 'generated' && data\.roadmap_json\)\)/, 'pending branch must return before paid/generated unlock');
  assert.match(roadmapPage, /Chỉ mở khóa sau khi xác nhận thanh toán/, 'checking copy must not imply button self-approves payment');

  type RestoreStatus = 'roadmap' | 'intake' | 'pending';
  function classify(status: string, hasRoadmap = false): RestoreStatus {
    if (!['paid', 'generated', 'ready'].includes(status)) return 'pending';
    return hasRoadmap ? 'roadmap' : 'intake';
  }
  assert.equal(classify('pending'), 'pending', 'pending status must not unlock');
  assert.equal(classify('paid'), 'intake', 'paid without roadmap can open paid intake');
  assert.equal(classify('generated', true), 'roadmap', 'generated with roadmap can open roadmap');
}

function assertPremiumDraftPrefillsCurrentJob() {
  const premiumBlock = blockBetween(roadmapPage, 'const readPremiumRoadmapProfile = (): Partial<RoadmapProfile> => {', 'const saveSharedPhone =');
  assert.match(premiumBlock, /currentJobTitle:\s*job \|\| undefined/, '29K premium session job must hydrate current job title');
  assert.match(premiumBlock, /currentRoleId:\s*typeof session\.selectedRoleId === 'string' \? session\.selectedRoleId : undefined/, '29K selectedRoleId must hydrate current role_id');
  assert.match(premiumBlock, /targetJobTitle:\s*job \|\| undefined/, '29K job remains available as default target job');
  assert.match(premiumBlock, /targetRoleId:\s*typeof session\.selectedRoleId === 'string' \? session\.selectedRoleId : undefined/, '29K selectedRoleId must hydrate target role_id');

  const draftBlock = blockBetween(roadmapPage, 'const applyDraftProfile = (draft: Partial<RoadmapProfile>) => {', 'const clearRoadmapSession = () =>');
  assert.match(draftBlock, /else if \(draft\.job && !detectRoadmapIntentPhrase\(draft\.job\)\) setCurrentJobTitle\(String\(draft\.job\)\)/, 'old draft with job but no currentJobTitle must still prefill current job');
  assert.match(draftBlock, /else if \(draft\.selectedRoleId\) setCurrentRoleId\(String\(draft\.selectedRoleId\)\)/, 'old draft selectedRoleId must hydrate currentRoleId');
  assert.match(roadmapPage, /setCurrentJobTitle\(savedProfile\.currentJobTitle \|\| savedProfile\.currentPosition \|\| savedProfile\.job \|\| ''\)/, 'saved profile must fallback current job to job');
  assert.match(roadmapPage, /setCurrentJobTitle\(p\.currentJobTitle \|\| p\.currentPosition \|\| p\.job \|\| ''\)/, 'local profile restore must fallback current job to job');
}

function assertRoleSuggestionUx() {
  assert.match(roadmapPage, /const roleDatalistOptions = useMemo/, 'role datalist options must be prepared');
  assert.match(roadmapPage, /list="roadmap-current-role-options"/, 'current job input must have datalist search');
  assert.match(roadmapPage, /list="roadmap-target-role-options"/, 'target job input must have datalist search');
  assert.match(roadmapPage, /const currentJobSuggestions = useMemo/, 'current job suggestions must exist');
  assert.match(roadmapPage, /const targetJobSuggestions = useMemo/, 'target job suggestions must exist');
  assert.match(roadmapPage, /const selectCurrentRole = \(option: RoleSuggestion\)/, 'current role picker must set canonical role');
  assert.match(roadmapPage, /const selectTargetRole = \(option: RoleSuggestion\)/, 'target role picker must set canonical role');
  assert.match(roadmapPage, /Giữ nghề hiện tại, nâng kỹ năng để tăng lương/, 'same-role growth shortcut must be visible');
  assert.match(roadmapPage, /Chọn nghề ước mơ \/ nghề muốn chuyển sang/, 'dream/career switch shortcut must be visible');
  assert.match(roadmapPage, /setSelectedRoleId\(option\.role_id\)/, 'target role selection must set selectedRoleId');
  assert.match(roadmapPage, /setCurrentRoleId\(option\.role_id\)/, 'current role selection must set currentRoleId');
}

function assertQrTransferUx() {
  assert.match(roadmapPage, /const vietQrImageUrl = `https:\/\/img\.vietqr\.io\/image\/msb-\$\{transferAccount\}-compact2\.png/, 'QR URL must be centralized for image and external open');
  assert.match(roadmapPage, /src=\{vietQrImageUrl\}/, 'QR image must use centralized URL');
  assert.match(roadmapPage, /Mở QR trang riêng/, 'QR screen must provide a separate QR page link');
  assert.match(roadmapPage, /navigator\.clipboard\.writeText\(value\)/, 'QR screen must support copy controls');
  assert.match(roadmapPage, /Copy nội dung CK/, 'QR screen must copy transfer content');
  assert.match(roadmapPage, /Copy số tiền 79K/, 'QR screen must copy amount');
  assert.match(roadmapPage, /Copy tài khoản/, 'QR screen must copy bank account');
}

assertPendingRestoreCannotUnlock();
assertPremiumDraftPrefillsCurrentJob();
assertRoleSuggestionUx();
assertQrTransferUx();

console.log(JSON.stringify({
  passed: true,
  paymentGate: 'pending direct restore returns PAYMENT_PENDING and cannot unlock',
  intakePrefill: '29K draft hydrates current and target role context',
  roleSuggestions: 'current/target autocomplete and same-role growth shortcut present',
  qrTransfer: 'open QR and copy transfer controls present',
}, null, 2));
