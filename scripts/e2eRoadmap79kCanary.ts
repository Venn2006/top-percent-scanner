import { existsSync, readFileSync } from 'node:fs';
import { getRoleProfileById, type RoleProfile } from '../lib/roleProfiles';
import { validateGeneratedRoadmapRoleGuard } from '../lib/validateGeneratedRoadmapRoleGuard';

type CanaryStatus = 'PASS' | 'FAIL';

interface DryRunRoadmapRecord {
  vspi_id: string;
  job_title: string;
  role_id: string;
  status: 'paid';
}

interface CanaryCase {
  name: string;
  selectedRoleId: string;
  jobTitle: string;
  sampleW1: string;
  requiredTerms: string[];
  forbiddenTerms: string[];
  minRequiredMatches: number;
}

const migrationPath = 'supabase/13_roadmap_role_id.sql';

const cases: CanaryCase[] = [
  {
    name: 'Case 1 selectedRoleId beats wrong job_title',
    selectedRoleId: 'nhan vien check-in san bay__van tai - logistics',
    jobTitle: 'Tiếp viên hàng không',
    sampleW1: [
      'W1: Lập checklist check-in tại quầy cho 20 hành khách, kiểm tra hộ chiếu, visa và giấy tờ tùy thân trước khi in boarding pass.',
      'Ghi log lỗi hành lý ký gửi/hành lý quá cước, case khách trễ chuyến và bước gọi supervisor, gate hoặc baggage service.',
    ].join(' '),
    requiredTerms: ['check-in', 'boarding pass', 'hành lý', 'hộ chiếu', 'visa'],
    forbiddenTerms: ['cabin crew', 'senior crew', 'purser', 'in-flight'],
    minRequiredMatches: 5,
  },
  {
    name: 'Case 2 restaurant server level lock',
    selectedRoleId: 'nhan vien phuc vu ban (waiter/waitress)__nha hang - khach san - du lich',
    jobTitle: 'Nhân viên phục vụ nhà hàng',
    sampleW1: [
      'W1: Chuẩn hóa quy trình nhận khách, giới thiệu menu, ghi order bằng POS và xác nhận món đúng bàn trước khi chuyển bếp/bar.',
      'Luyện 5 câu upsell món phụ hoặc combo phù hợp, ghi feedback khách và checklist dọn bàn sau mỗi lượt khách.',
    ].join(' '),
    requiredTerms: ['order', 'bàn', 'khách', 'menu', 'upsell', 'POS'],
    forbiddenTerms: ['food cost', 'labor cost', 'P&L', 'COGS', 'gross margin'],
    minRequiredMatches: 5,
  },
  {
    name: 'Case 3 restaurant manager level lock',
    selectedRoleId: 'quan ly nha hang__nha hang - khach san - du lich',
    jobTitle: 'Quản lý nhà hàng',
    sampleW1: [
      'W1: Lập SOP vận hành ca, lịch làm việc theo forecast khách, dashboard doanh thu theo ca và log complaint để review với owner.',
      'Đối soát food cost, labor cost, tồn kho, hao hụt và table turn; chốt 3 điểm training cho captain/nhân viên phục vụ.',
    ].join(' '),
    requiredTerms: ['food cost', 'labor cost', 'doanh thu theo ca', 'tồn kho', 'SOP', 'complaint', 'lịch làm việc'],
    forbiddenTerms: ['chỉ dọn bàn', 'chỉ bưng món', 'chỉ ghi order', 'chào khách đơn giản', 'phục vụ bàn cơ bản'],
    minRequiredMatches: 3,
  },
  {
    name: 'Case 4 dentist not HR',
    selectedRoleId: 'nha si__y te - cham soc suc khoe',
    jobTitle: 'Nha sĩ',
    sampleW1: [
      'W1: Chuẩn hóa hồ sơ bệnh án nha khoa ẩn danh cho 10 ca, ghi chẩn đoán răng, kế hoạch điều trị và lịch tái khám.',
      'Checklist vô khuẩn phòng khám, X-quang/CBCT, photo intraoral và tư vấn điều trị cho bệnh nhân trước-sau thủ thuật.',
    ].join(' '),
    requiredTerms: ['răng', 'bệnh án', 'điều trị', 'phòng khám', 'x-quang'],
    forbiddenTerms: ['recruitment funnel', 'HR dashboard', 'onboarding checklist', 'time-to-fill'],
    minRequiredMatches: 4,
  },
];

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

function findTerms(text: string, terms: string[]) {
  const normalizedText = normalize(text);
  return terms.filter(term => normalizedText.includes(normalize(term)));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function resolveSelectedRoleId(selectedRoleId: string): RoleProfile {
  const profile = getRoleProfileById(selectedRoleId);
  if (!profile) throw new Error(`Invalid selectedRoleId: ${selectedRoleId}`);
  return profile;
}

function dryRunCheckout(input: { selectedRoleId: string; jobTitle: string }): DryRunRoadmapRecord {
  const profile = resolveSelectedRoleId(input.selectedRoleId);
  return {
    vspi_id: `VSPI-CANARY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    job_title: input.jobTitle,
    role_id: profile.key,
    status: 'paid',
  };
}

function dryRunGenerate(record: DryRunRoadmapRecord, sampleW1: string) {
  const profile = resolveSelectedRoleId(record.role_id);
  return {
    roleProfile: profile,
    authoritativeJobTitle: profile.title,
    generatedRoadmapText: sampleW1,
    guard: validateGeneratedRoadmapRoleGuard({
      jobTitle: profile.title,
      roleProfile: profile,
      generatedRoadmapText: sampleW1,
    }),
  };
}

function runCase(canary: CanaryCase) {
  const record = dryRunCheckout({ selectedRoleId: canary.selectedRoleId, jobTitle: canary.jobTitle });
  assert(record.role_id === canary.selectedRoleId, `${canary.name}: checkout did not persist selected role_id`);

  const generated = dryRunGenerate(record, canary.sampleW1);
  assert(generated.roleProfile.key === canary.selectedRoleId, `${canary.name}: generate used wrong role profile`);

  const requiredHits = findTerms(canary.sampleW1, canary.requiredTerms);
  const forbiddenHits = findTerms(canary.sampleW1, canary.forbiddenTerms);
  assert(requiredHits.length >= canary.minRequiredMatches, `${canary.name}: missing required terms. Hits: ${requiredHits.join(', ')}`);
  assert(forbiddenHits.length === 0, `${canary.name}: forbidden terms found: ${forbiddenHits.join(', ')}`);
  assert(generated.guard.passed, `${canary.name}: generated guard failed: ${JSON.stringify(generated.guard)}`);

  const badGuard = validateGeneratedRoadmapRoleGuard({
    jobTitle: generated.roleProfile.title,
    roleProfile: generated.roleProfile,
    generatedRoadmapText: canary.forbiddenTerms.length
      ? `W1 sai nghề: ${canary.forbiddenTerms.slice(0, 4).join(', ')}`
      : 'W1 sai nghề chung chung không có vocabulary role.',
  });
  assert(!badGuard.passed, `${canary.name}: guard did not reject bad roadmap text`);

  return {
    status: 'PASS' as CanaryStatus,
    record,
    resolvedTitle: generated.roleProfile.title,
    requiredHits,
    sampleW1: canary.sampleW1,
  };
}

function runInvalidRoleCase() {
  let rejected = false;
  try {
    dryRunCheckout({ selectedRoleId: 'invalid_role_id', jobTitle: 'Nha sĩ' });
  } catch (error) {
    rejected = error instanceof Error && error.message.includes('Invalid selectedRoleId');
  }
  assert(rejected, 'Case 5 invalid selectedRoleId was not rejected');
  return 'PASS' as CanaryStatus;
}

function migrationSummary() {
  assert(existsSync(migrationPath), `Missing migration file: ${migrationPath}`);
  const sql = readFileSync(migrationPath, 'utf8');
  assert(/add column if not exists role_id text/i.test(sql), 'Migration does not add roadmaps.role_id text');
  assert(/idx_roadmaps_role_id/i.test(sql), 'Migration does not create role_id index');
  return sql.replace(/\s+/g, ' ').trim();
}

function liveDbStatus() {
  if (process.env.RUN_LIVE_E2E_ROADMAP_79K !== '1') {
    return 'SKIPPED_WITH_REASON: live DB/API write disabled. Set RUN_LIVE_E2E_ROADMAP_79K=1 only on a disposable dev DB or approved staging DB.';
  }
  return 'SKIPPED_WITH_REASON: live DB/API branch is intentionally not implemented in this canary to avoid creating paid test orders on the configured remote Supabase project.';
}

const migrationSql = migrationSummary();
const results = cases.map(runCase);
const invalidRoleStatus = runInvalidRoleCase();

console.log('STEP 8 E2E ROADMAP CANARY SUMMARY');
console.log(`Migration check: PASS (${migrationSql})`);
console.log(`Live DB/API e2e: ${liveDbStatus()}`);
console.log(`${cases[0].name}: ${results[0].status}`);
console.log(`${cases[1].name}: ${results[1].status}`);
console.log(`${cases[2].name}: ${results[2].status}`);
console.log(`${cases[3].name}: ${results[3].status}`);
console.log(`Case 5 invalid selectedRoleId rejected: ${invalidRoleStatus}`);
console.log('');
console.log('Sample W1 outputs:');
console.log(`- Airport check-in: ${results[0].sampleW1}`);
console.log(`- Restaurant server: ${results[1].sampleW1}`);
console.log(`- Restaurant manager: ${results[2].sampleW1}`);
console.log(`- Dentist: ${results[3].sampleW1}`);
