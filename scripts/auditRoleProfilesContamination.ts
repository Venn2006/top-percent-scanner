import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface RoleProfile {
  key: string;
  titleKey: string;
  title: string;
  industry: string | null;
  industryKey: string;
  segment: string;
  [key: string]: unknown;
}

interface AuditRow {
  roleId: string;
  titleVi: string;
  industry: string;
  category: string;
  issueTypes: string[];
  matchedTerms: string[];
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
}

const REPORT_DIR = join(process.cwd(), 'data', 'audit');
const CSV_PATH = join(REPORT_DIR, 'role_profiles_contamination_report.csv');
const JSON_PATH = join(REPORT_DIR, 'role_profiles_contamination_report.json');

const highRiskIssueTypes = new Set([
  'hr_contamination',
  'cabin_crew_contamination',
  'medical_dental_contamination',
  'airport_ground_contamination',
]);

const mediumRiskIssueTypes = new Set(['too_high_level', 'too_low_level']);

const termGroups = {
  hr: [
    'recruitment funnel',
    'onboarding checklist',
    'HR dashboard',
    'time-to-fill',
    'C&B benchmark',
    'JD analysis',
    'headcount',
    'employee retention',
    'HR data',
    'HR KPI',
    'ứng viên',
    'phỏng vấn tuyển dụng',
    'tuyển dụng',
  ],
  cabin: [
    'cabin crew',
    'flight attendant',
    'senior crew',
    'purser',
    'in-flight',
    'checklist cabin',
    'announcement cabin',
    'grooming cabin crew',
    'route readiness',
    'an toàn bay và quy trình cabin',
    'tiếng Anh cabin',
  ],
  medicalDental: [
    'bệnh án',
    'chẩn đoán',
    'điều trị tủy',
    'nhổ răng',
    'trám composite',
    'phòng khám',
    'x-quang',
    'bệnh nhân',
    'clinical diagnosis',
    'patient care',
  ],
  restaurantManager: [
    'food cost',
    'labor cost',
    'P&L',
    'COGS',
    'gross margin',
    'inventory turnover',
    'budget ownership',
    'menu engineering',
    'quản lý doanh thu',
    'quản lý chi phí',
    'lập lịch nhân sự toàn team',
  ],
  restaurantServer: [
    'chỉ dọn bàn',
    'chỉ bưng món',
    'chỉ ghi order',
    'chào khách đơn giản',
    'phục vụ bàn cơ bản',
  ],
  airportGround: [
    'boarding pass',
    'hộ chiếu',
    'visa',
    'hành lý ký gửi',
    'quầy check-in',
    'baggage service',
    'gate supervisor',
  ],
  generic: [
    'giao tiếp hiệu quả',
    'nâng cao chuyên môn',
    'quản lý thời gian',
    'làm việc nhóm',
    'tư duy phản biện',
    'phát triển bản thân',
    'xây dựng thương hiệu cá nhân',
  ],
};

const concreteDomainTerms = [
  'boarding pass', 'hộ chiếu', 'visa', 'hành lý', 'check-in', 'baggage', 'gate',
  'x-quang', 'cbct', 'bệnh án', 'treatment plan', 'ifrs', 'vas', 'audit', 'tax',
  'bim', 'shop drawing', 'boq', 'commissioning', 'hvac', 'gas', 'chiller', 'vrf',
  'crm', 'pipeline', 'lead', 'conversion', 'p&l', 'food cost', 'labor cost', 'pos',
  'pms', 'adr', 'revpar', 'ota', 'lesson plan', 'rubric', 'ma trận đề', 'giáo án',
  'underwriting', 'claims', 'policy wording', 'meal plan', 'nutrition', 'bmi',
  'vaccination', 'deworming', 'owner communication', 'cnc', 'welding', 'plc',
  'power query', 'dashboard', 'sop', 'sla', 'kpi', 'portfolio', 'case study',
];

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[đ]/g, 'd')
    .replace(/[^\p{L}\p{N}&+./%-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenText(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(item => flattenText(item));
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(item => flattenText(item));
  return [];
}

function profileText(profile: RoleProfile) {
  return flattenText(profile).join(' | ');
}

function roleIdentity(profile: RoleProfile) {
  return normalize([
    profile.key,
    profile.titleKey,
    profile.title,
    profile.industry || '',
    profile.industryKey || '',
    profile.segment || '',
  ].join(' | '));
}

function findTerms(text: string, terms: string[]) {
  const normalizedText = normalize(text);
  return terms.filter(term => normalizedText.includes(normalize(term)));
}

function isHrRole(identity: string) {
  return /\bhr\b|human resources|nhan su|tuyen dung|recruit|headhunter|talent acquisition|c&b|hrbp|people operations|hanh chinh nhan su/.test(identity);
}

function isCabinCrewRole(identity: string) {
  return /tiep vien hang khong|cabin crew|flight attendant|stewardess|steward|purser/.test(identity);
}

function isMedicalDentalRole(identity: string) {
  return /healthcare|y te|nha khoa|nha si|rang ham mat|bac si|doctor|dieu duong|nurse|duoc|pharma|radiology|x quang|clinic|clinical|thu y|veterinary|nutrition|dinh duong/.test(identity);
}

function isAirportGroundRole(identity: string) {
  return /check[- ]?in san bay|airport ground|passenger service|ground service|dich vu mat dat|nhan vien mat dat hang khong|quay check[- ]?in|gate agent|baggage service/.test(identity);
}

function isStudyAbroadConsultingRole(identity: string) {
  return /du hoc|tu van du hoc|study abroad|education consulting|visa du hoc|admissions quoc te|student recruitment/.test(identity);
}

function isEntryRestaurantRole(identity: string) {
  if (/manager|quan ly|giam doc|truong phong|supervisor|lead|leader|captain|bep truong|sous chef|f&b manager|fb manager/.test(identity)) return false;
  return /phuc vu|waiter|waitress|server|thu ngan nha hang|cashier restaurant|nhan vien ban hang an uong|nhan vien nha hang|runner|buss(er)?|barista|pha che|phu bep/.test(identity);
}

function isRestaurantManagerRole(identity: string) {
  return /quan ly nha hang|restaurant manager|f&b manager|fb manager|food and beverage manager|cua hang truong nha hang|quan ly f&b|giam sat nha hang|restaurant supervisor/.test(identity);
}

function hasTooGenericProfile(text: string) {
  const genericMatches = findTerms(text, termGroups.generic);
  if (genericMatches.length <= 5) return { flagged: false, matches: genericMatches };
  const concreteMatches = findTerms(text, concreteDomainTerms);
  return { flagged: concreteMatches.length < 3, matches: genericMatches };
}

function addIssue(
  issues: Map<string, Set<string>>,
  matchedTerms: Set<string>,
  issueType: string,
  terms: string[]
) {
  if (!terms.length) return;
  const bucket = issues.get(issueType) || new Set<string>();
  for (const term of terms) {
    bucket.add(term);
    matchedTerms.add(term);
  }
  issues.set(issueType, bucket);
}

function riskLevel(issueTypes: string[]): AuditRow['riskLevel'] {
  if (issueTypes.some(issue => highRiskIssueTypes.has(issue))) return 'HIGH';
  if (issueTypes.some(issue => mediumRiskIssueTypes.has(issue))) return 'MEDIUM';
  return 'LOW';
}

function csvEscape(value: unknown) {
  const text = Array.isArray(value) ? value.join('; ') : String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function auditProfile(profile: RoleProfile): AuditRow | null {
  const text = profileText(profile);
  const identity = roleIdentity(profile);
  const issues = new Map<string, Set<string>>();
  const matchedTerms = new Set<string>();

  if (!isHrRole(identity)) {
    addIssue(issues, matchedTerms, 'hr_contamination', findTerms(text, termGroups.hr));
  }
  if (!isCabinCrewRole(identity)) {
    addIssue(issues, matchedTerms, 'cabin_crew_contamination', findTerms(text, termGroups.cabin));
  }
  if (!isMedicalDentalRole(identity)) {
    addIssue(issues, matchedTerms, 'medical_dental_contamination', findTerms(text, termGroups.medicalDental));
  }
  if (isEntryRestaurantRole(identity)) {
    addIssue(issues, matchedTerms, 'too_high_level', findTerms(text, termGroups.restaurantManager));
  }
  if (isRestaurantManagerRole(identity)) {
    addIssue(issues, matchedTerms, 'too_low_level', findTerms(text, termGroups.restaurantServer));
  }
  if (!isAirportGroundRole(identity)) {
    const airportGroundTerms = findTerms(text, termGroups.airportGround)
      .filter(term => !(normalize(term) === 'visa' && isStudyAbroadConsultingRole(identity)));
    addIssue(issues, matchedTerms, 'airport_ground_contamination', airportGroundTerms);
  }

  const generic = hasTooGenericProfile(text);
  if (generic.flagged) addIssue(issues, matchedTerms, 'too_generic', generic.matches);

  const issueTypes = [...issues.keys()].sort();
  if (!issueTypes.length) return null;

  return {
    roleId: profile.key,
    titleVi: profile.title,
    industry: profile.industry || '',
    category: profile.segment || '',
    issueTypes,
    matchedTerms: [...matchedTerms].sort((a, b) => normalize(a).localeCompare(normalize(b))),
    riskLevel: riskLevel(issueTypes),
  };
}

function sortRows(rows: AuditRow[]) {
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  return rows.sort((a, b) => {
    const riskDiff = rank[a.riskLevel] - rank[b.riskLevel];
    if (riskDiff) return riskDiff;
    const issueDiff = b.issueTypes.length - a.issueTypes.length;
    if (issueDiff) return issueDiff;
    const termDiff = b.matchedTerms.length - a.matchedTerms.length;
    if (termDiff) return termDiff;
    return a.titleVi.localeCompare(b.titleVi, 'vi');
  });
}

function main() {
  const failOnFlagged = process.argv.includes('--fail-on-flagged');
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'data', 'role_profiles.json'), 'utf8')) as { profiles?: RoleProfile[] };
  const profiles = raw.profiles || [];
  const rows = sortRows(profiles.map(auditProfile).filter((row): row is AuditRow => Boolean(row)));

  const summary = {
    totalProfiles: profiles.length,
    cleanProfiles: profiles.length - rows.length,
    flaggedProfiles: rows.length,
    highRisk: rows.filter(row => row.riskLevel === 'HIGH').length,
    mediumRisk: rows.filter(row => row.riskLevel === 'MEDIUM').length,
    lowRisk: rows.filter(row => row.riskLevel === 'LOW').length,
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  const csvHeader = ['roleId', 'titleVi', 'industry', 'category', 'issueTypes', 'matchedTerms', 'riskLevel'];
  const csvRows = rows.map(row => csvHeader.map(key => csvEscape(row[key as keyof AuditRow])).join(','));
  writeFileSync(CSV_PATH, [csvHeader.join(','), ...csvRows].join('\n'), 'utf8');
  writeFileSync(JSON_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), summary, rows }, null, 2), 'utf8');

  console.log('STEP 3 ROLE PROFILE AUDIT SUMMARY');
  console.log('');
  console.log(`Total profiles: ${summary.totalProfiles}`);
  console.log(`Clean profiles: ${summary.cleanProfiles}`);
  console.log(`Flagged profiles: ${summary.flaggedProfiles}`);
  console.log(`High risk: ${summary.highRisk}`);
  console.log(`Medium risk: ${summary.mediumRisk}`);
  console.log(`Low risk: ${summary.lowRisk}`);
  console.log('');
  console.log('Top 20 flagged profiles:');
  rows.slice(0, 20).forEach((row, index) => {
    console.log(`${index + 1}. ${row.roleId} | ${row.titleVi} | ${row.issueTypes.join('; ')} | ${row.matchedTerms.join('; ')}`);
  });

  if (failOnFlagged) {
    if (summary.flaggedProfiles > 0) {
      console.log('');
      console.log('ROLE PROFILE CONTAMINATION GATE: FAIL');
      console.log(`Flagged profiles: ${summary.flaggedProfiles}`);
      process.exit(1);
    }
    console.log('');
    console.log('ROLE PROFILE CONTAMINATION GATE: PASS');
    process.exit(0);
  }
}

main();
