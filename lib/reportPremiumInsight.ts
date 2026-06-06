import { repairMojibakeText } from './mojibake';
import { getExactRoleProfile } from './roleProfiles';
import { inferRoleLevelBand, isExecutiveLevel } from './roleSeniority';
import { detectRoleSegment, isAirportGroundRole, normalizeRoleText } from './roleTaxonomy';

const AIRPORT_CHECKIN_FORBIDDEN_TERMS = [
  'cabin',
  'cabin crew',
  'senior cabin crew',
  'senior crew',
  'purser',
  'cabin leader',
  'cabin trainer',
  'international route',
  'in-flight',
  'flight attendant',
  'cabin safety',
  'english announcement',
  'announcement tieng anh',
  'announcement tiếng anh',
  'checklist cabin',
  'training cabin crew',
  'route readiness',
  'grooming cabin crew',
  'grooming',
];

const BROKEN_AIRPORT_CHECKIN_PHRASES = [
  'tu thao tac',
  'ho chieu',
  'hanh ly',
  'co kpi',
  'quay check-in',
  'khach',
  'can gate',
  'can supervisor',
  'bang chung',
  'luong',
];

function fmtM(n: number | null | undefined) {
  return n ? `${(n / 1_000_000).toFixed(1)}M` : '?M';
}

function formatPercentDisplay(percent: number) {
  return percent >= 100 ? 'Dưới Top 80%' : `Top ${percent}%`;
}

function hasAnyNormalizedTerm(text: string, terms: string[]) {
  const normalized = normalizeRoleText(text);
  return terms.some((term) => normalized.includes(normalizeRoleText(term)));
}

export function getBrokenAirportCheckinCopyHits(text: string) {
  const repaired = repairMojibakeText(text).toLowerCase();
  return BROKEN_AIRPORT_CHECKIN_PHRASES.filter((phrase) => repaired.includes(phrase));
}

function buildAirportGroundPremiumInsight(job: string, salary: number, percent: number, targetLabel?: string, targetSalary?: number) {
  const targetText = targetSalary && targetSalary > salary
    ? `${fmtM(targetSalary)}/tháng`
    : `mốc ${targetLabel || 'kế tiếp'}`;

  return `Bạn đang làm ${job || 'Nhân viên check-in sân bay'}, lương ${fmtM(salary)}/tháng, vị trí thị trường là ${formatPercentDisplay(percent)}. Muốn tăng giá trị, đừng kể chung chung là làm quầy; hãy chứng minh năng lực passenger service bằng bằng chứng đúng nghề: kiểm tra hộ chiếu/visa, in boarding pass chính xác, xử lý hành lý quá cước hoặc hành lý ký gửi, case khách trễ chuyến/thiếu giấy tờ, và feedback supervisor. Mốc gần nhất nên nhắm tới là ${targetLabel || 'mốc kế tiếp'} quanh ${targetText}. Trong 30 ngày tới, hãy lưu error log DCS/check-in, 3-5 case phối hợp gate/baggage service, và một checklist quầy check-in để dùng khi xin review lương hoặc apply Senior Passenger Service Agent.`;
}

function buildExecutivePremiumInsight(job: string, salary: number, percent: number, targetLabel?: string, targetSalary?: number, industry?: string | null) {
  const targetText = targetSalary && targetSalary > salary
    ? `${fmtM(targetSalary)}/tháng`
    : `mốc ${targetLabel || 'kế tiếp'}`;
  const normalizedJob = normalizeRoleText(job);
  const isCmo = /\bcmo\b|giam doc marketing|marketing director/.test(normalizedJob);
  const isCeo = /\bceo\b|tong giam doc|general director|managing director/.test(normalizedJob);
  const evidence = isCmo
    ? 'growth mandate, brand/revenue impact, marketing operating system, CAC/LTV, pipeline/revenue contribution, budget/media efficiency và board/CEO alignment'
    : isCeo
      ? 'P&L ownership, operating cadence, governance, revenue/profit growth, risk reduction, org design và board/owner mandate'
      : 'scope, P&L/revenue impact, quyền quyết định, operating dashboard, org/team design, decision log và board/owner update';
  void industry;

  return `Bạn đang ở vai trò ${job}, lương ${fmtM(salary)}/tháng, vị trí thị trường là ${formatPercentDisplay(percent)}. Bạn không cần một lộ trình tăng lương kiểu nhân viên. Thị trường trả cho quy mô scope, P&L/revenue impact, mandate, quyền quyết định, năng lực xây hệ thống và kết quả chiến lược. Bộ bằng chứng nên là ${evidence}. Mốc gần nhất nên nhắm tới là ${targetLabel || 'mốc kế tiếp'} quanh ${targetText}. Mục tiêu là định giá lại compensation package: base, bonus, equity/profit-sharing hoặc mandate lớn hơn.`;
}

function buildProfilePremiumInsight(job: string, salary: number, percent: number, targetLabel?: string, targetSalary?: number, industry?: string | null) {
  const profile = getExactRoleProfile(job, industry);
  if (!profile) return null;

  const targetText = targetSalary && targetSalary > salary
    ? `${fmtM(targetSalary)}/tháng`
    : `mốc ${targetLabel || 'kế tiếp'}`;
  const coreSkills = profile.skills.slice(0, 4).join(', ');
  const proofAsset = profile.language?.proofAsset || `case thật có ${profile.skills.slice(0, 3).join(', ')}, KPI trước/sau và feedback xác nhận`;
  const rolePath = profile.language?.rolePath || 'role tốt hơn trong cùng nghề';
  const mainSkill = profile.language?.mainSkill || coreSkills;

  return `Bạn đang làm ${profile.title}, lương ${fmtM(salary)}/tháng, vị trí thị trường là ${formatPercentDisplay(percent)}. Mốc gần nhất nên nhắm tới là ${targetLabel || 'mốc kế tiếp'} quanh ${targetText}. Đừng học lan man; hãy chứng minh đúng nghề bằng ${proofAsset}. Trong 30 ngày tới, chọn 1 việc thật liên quan trực tiếp tới ${coreSkills}, ghi số trước-sau, lưu bằng chứng và feedback xác nhận. Khi có 2-3 bằng chứng như vậy, bạn mới có lý do để xin review lương hoặc nhắm tới ${rolePath}. Kỹ năng nên ưu tiên trước: ${mainSkill}.`;
}

export function buildSafePremiumInsight(job: string, salary: number, percent: number, targetLabel?: string, targetSalary?: number, industry?: string | null) {
  if (isAirportGroundRole(job, industry)) {
    return buildAirportGroundPremiumInsight(job, salary, percent, targetLabel, targetSalary);
  }

  const levelBand = inferRoleLevelBand({ jobTitle: job, industry });
  if (isExecutiveLevel(levelBand)) {
    return buildExecutivePremiumInsight(job, salary, percent, targetLabel, targetSalary, industry);
  }

  const profileInsight = buildProfilePremiumInsight(job, salary, percent, targetLabel, targetSalary, industry);
  if (profileInsight) return profileInsight;

  const salaryText = fmtM(salary);
  const targetText = targetSalary && targetSalary > salary ? `${fmtM(targetSalary)}/tháng` : `mốc ${targetLabel || 'kế tiếp'}`;
  return `Bạn đang làm ${job}, lương ${salaryText}/tháng, vị trí thị trường là ${formatPercentDisplay(percent)}. Mốc gần nhất nên nhắm tới là ${targetLabel || 'mốc kế tiếp'} quanh ${targetText}. Đừng học lan man; hãy tạo 2-3 bằng chứng đúng nghề: việc bạn tự làm, số trước-sau, lỗi/chi phí/thời gian đã giảm và người xác nhận. Trong 30 ngày tới, chọn 1 việc thật, làm cho tốt hơn, lưu bằng chứng, rồi dùng nó để xin review lương hoặc lọc role trả cao hơn.`;
}

export function isDirtyPremiumInsightForJob(text: string, job: string, industry?: string | null) {
  const repaired = repairMojibakeText(text);
  const normalizedText = normalizeRoleText(repaired);
  if (!normalizedText || !job.trim()) return false;

  if (isAirportGroundRole(job, industry)) {
    return hasAnyNormalizedTerm(repaired, AIRPORT_CHECKIN_FORBIDDEN_TERMS)
      || getBrokenAirportCheckinCopyHits(repaired).length > 0;
  }

  const levelBand = inferRoleLevelBand({ jobTitle: job, industry });
  if (isExecutiveLevel(levelBand)) {
    return hasAnyNormalizedTerm(repaired, [
      'câu trả lời HR',
      'xin review',
      'xin review lương',
      'lên quản lý',
      'đi sâu chuyên môn',
      'đừng học lan man',
    ]);
  }

  const requested = detectRoleSegment(job, industry);
  if (requested === 'general' || requested === 'fresh') return false;
  const requestedText = normalizeRoleText(job);
  if (/nail|chuyen vien nail|tho nail|nail technician/.test(requestedText)) {
    return /facial|body treatment|deep tissue|hot stone|lieu trinh spa|tri lieu spa|phong tri lieu|checklist phong tri lieu|therapist roster|massage/.test(normalizedText);
  }
  const isMarketingLikeJob = requested === 'marketing' || /marketing|brand manager|category manager|cmo|campaign manager|trade marketing|product marketing/.test(requestedText);
  const marketingLeak = /facebook manager|fb manager|ads manager|meta ads|facebook ads|performance marketing|brand manager|marketing manager|social media manager|campaign manager|google ads|ga4|media buying/.test(normalizedText);
  if (!isMarketingLikeJob && marketingLeak) return true;
  if (requested === 'education' && /ielts|toeic|tesol|celta|cambridge|teacher utilization|trial-to-paid|class fill rate|language center|english center/.test(normalizedText)) return true;
  if (requested !== 'events' && /showreel|rate card|wedding mc|event host|livestream host/.test(normalizedText)) return true;
  const leakRoles = ['giao vien toan', 'giao vien tieng anh', 'tesol', 'celta', 'ielts', 'nha may', 'san xuat ky thuat'];
  return leakRoles.some((leak) => normalizedText.includes(leak)) && !leakRoles.some((leak) => requestedText.includes(leak));
}

export function sanitizePremiumInsightForRender(input: {
  text?: string | null;
  job: string;
  salary: number;
  percent: number;
  industry?: string | null;
  targetLabel?: string;
  targetSalary?: number;
}) {
  const repaired = input.text ? repairMojibakeText(input.text) : '';
  if (isAirportGroundRole(input.job, input.industry)) {
    return buildSafePremiumInsight(input.job, input.salary, input.percent, input.targetLabel, input.targetSalary, input.industry);
  }
  if (repaired && !isDirtyPremiumInsightForJob(repaired, input.job, input.industry)) return repaired;
  if (!repaired) return '';
  return buildSafePremiumInsight(input.job, input.salary, input.percent, input.targetLabel, input.targetSalary, input.industry);
}
