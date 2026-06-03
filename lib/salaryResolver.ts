import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildBenchmarkMeta,
  buildPercentileThresholds,
  getNextTargetSalary,
  getPercentileBucket,
  getStrategicOpportunityTarget,
  type BenchmarkMeta,
  type PercentileThresholds,
  type SalaryBandInput,
} from '@/lib/salaryBenchmark';
import {
  getMarketLocation,
  getMinimumMonthlySalaryForMarket,
  normalizeMarketLocation,
  type MarketLocationKey,
} from '@/lib/locationBenchmark';
import { estimateCustomJobBenchmark } from '@/lib/customJobEstimator';
import { detectRoleSegment, getTourismRoleProfile, type RoleSegment } from '@/lib/roleTaxonomy';

export const EXPERIENCE_MULTIPLIER = {
  junior: 0.70,
  mid: 1.00,
  senior: 1.30,
} as const;

export type ExperienceKey = keyof typeof EXPERIENCE_MULTIPLIER;

export interface PublicSalaryData {
  industry?: string | null;
  job_title?: string | null;
  top_50: number;
  top_20: number | null;
  top_10: number | null;
  top_5: number | null;
}

export interface FullSalaryData extends PublicSalaryData {
  top_40?: number | null;
  top_30?: number | null;
  top_1?: number | null;
}

export interface PublicBenchmarkMeta extends Omit<BenchmarkMeta, 'thresholds'> {
  thresholdPreview: Array<{ label: string; salary: number | null; locked: boolean; active: boolean }>;
}

export interface ResolvedSalaryBenchmark {
  requestedJobTitle: string;
  matchedJobTitle: string | null;
  industry: string | null;
  matchType: 'exact' | 'alias' | 'similar_role' | 'industry_estimate' | 'legacy_salary_data' | 'ai_estimate' | 'national_fallback';
  hasDirectData: boolean;
  rawBands: SalaryBandInput;
  thresholds: PercentileThresholds;
  publicDbData: PublicSalaryData;
  fullDbData: FullSalaryData;
  benchmark: PublicBenchmarkMeta;
  nextTargetSalary: number;
  percentileBucket: number;
  lostMoney: number;
  isAboveMedian: boolean;
}

interface SalaryBenchmarkRow {
  canonical_job_title: string;
  industry: string | null;
  function_group: string | null;
  level: string | null;
  location: string | null;
  company_type: string | null;
  currency: string | null;
  salary_min: number | null;
  salary_median: number | null;
  salary_avg: number | null;
  salary_max: number | null;
  top_50: number | null;
  top_40: number | null;
  top_30: number | null;
  top_20: number | null;
  top_10: number | null;
  top_5: number | null;
  source_id: string | null;
  sample_size: number | null;
  confidence_score: number | null;
  notes: string | null;
}

interface LegacySalaryRow {
  top_50: number;
  top_20: number | null;
  top_10: number | null;
  top_5: number | null;
  industry: string | null;
  job_title: string | null;
}

interface SourceRow {
  id: string;
  source_name: string;
  source_tier: 'A' | 'B' | 'C' | 'D' | null;
}

const USD_TO_VND = 25_500;
const DEFAULT_BANDS: SalaryBandInput = { top_50: 15_000_000, top_20: null, top_10: null, top_5: null };

function getDisplayIndustry(jobTitle: string, matchedJobTitle: string | null, industry: string | null) {
  const roleText = normalizeTitle(`${jobTitle} ${matchedJobTitle || ''}`);
  if (/taxi|tai xe taxi/.test(roleText)) {
    return 'Vận tải / Taxi / Công nghệ gọi xe';
  }
  if (getTourismRoleProfile(jobTitle) || (matchedJobTitle && getTourismRoleProfile(matchedJobTitle))) {
    return 'Du lịch / Tour / Lữ hành';
  }
  return industry;
}

const MANUAL_BENCHMARK_ROWS: SalaryBenchmarkRow[] = [
  {
    canonical_job_title: 'Frontend Developer',
    industry: 'Technology / Software Engineering',
    function_group: 'Frontend web application engineering',
    level: 'Professional',
    location: 'Vietnam',
    company_type: 'Product company / Outsourcing / Startup',
    currency: 'VND',
    salary_min: 14_000_000,
    salary_median: 25_000_000,
    salary_avg: 28_000_000,
    salary_max: 85_000_000,
    top_50: 25_000_000,
    top_40: 30_000_000,
    top_30: 36_000_000,
    top_20: 45_000_000,
    top_10: 60_000_000,
    top_5: 75_000_000,
    source_id: null,
    sample_size: 140,
    confidence_score: 80,
    notes: 'Manual guardrail for frontend roles: React/Vue/Angular, UI implementation quality, web performance, API integration, testing, accessibility and production ownership.',
  },
  {
    canonical_job_title: 'Backend Developer',
    industry: 'Technology / Software Engineering',
    function_group: 'Backend/API/platform engineering',
    level: 'Professional',
    location: 'Vietnam',
    company_type: 'Product company / Outsourcing / Startup',
    currency: 'VND',
    salary_min: 16_000_000,
    salary_median: 28_000_000,
    salary_avg: 32_000_000,
    salary_max: 95_000_000,
    top_50: 28_000_000,
    top_40: 34_000_000,
    top_30: 40_000_000,
    top_20: 50_000_000,
    top_10: 68_000_000,
    top_5: 85_000_000,
    source_id: null,
    sample_size: 150,
    confidence_score: 80,
    notes: 'Manual guardrail for backend roles: API/service ownership, database design, reliability, debugging, security, observability and performance.',
  },
  {
    canonical_job_title: 'Fullstack Developer',
    industry: 'Technology / Software Engineering',
    function_group: 'Full-stack product engineering',
    level: 'Professional',
    location: 'Vietnam',
    company_type: 'Product company / Outsourcing / Startup',
    currency: 'VND',
    salary_min: 16_000_000,
    salary_median: 30_000_000,
    salary_avg: 34_000_000,
    salary_max: 100_000_000,
    top_50: 30_000_000,
    top_40: 36_000_000,
    top_30: 43_000_000,
    top_20: 55_000_000,
    top_10: 72_000_000,
    top_5: 90_000_000,
    source_id: null,
    sample_size: 130,
    confidence_score: 79,
    notes: 'Manual guardrail for fullstack roles: frontend/backend ownership, feature delivery, API/database integration, release quality and product impact.',
  },
  {
    canonical_job_title: 'QA/QC Engineer',
    industry: 'Technology / Software Quality',
    function_group: 'Software testing / Quality engineering',
    level: 'Professional',
    location: 'Vietnam',
    company_type: 'Product company / Outsourcing / Startup',
    currency: 'VND',
    salary_min: 12_000_000,
    salary_median: 22_000_000,
    salary_avg: 25_000_000,
    salary_max: 70_000_000,
    top_50: 22_000_000,
    top_40: 26_000_000,
    top_30: 31_000_000,
    top_20: 38_000_000,
    top_10: 50_000_000,
    top_5: 65_000_000,
    source_id: null,
    sample_size: 115,
    confidence_score: 77,
    notes: 'Manual guardrail for software QA roles: test design, automation, release quality, defect prevention, regression coverage and product risk.',
  },
  {
    canonical_job_title: 'DevOps Engineer',
    industry: 'Technology / Cloud Infrastructure',
    function_group: 'DevOps / SRE / Cloud operations',
    level: 'Professional',
    location: 'Vietnam',
    company_type: 'Product company / Outsourcing / Startup',
    currency: 'VND',
    salary_min: 20_000_000,
    salary_median: 38_000_000,
    salary_avg: 42_000_000,
    salary_max: 130_000_000,
    top_50: 38_000_000,
    top_40: 45_000_000,
    top_30: 55_000_000,
    top_20: 70_000_000,
    top_10: 95_000_000,
    top_5: 120_000_000,
    source_id: null,
    sample_size: 95,
    confidence_score: 78,
    notes: 'Manual guardrail for DevOps/SRE roles: cloud infra, CI/CD, incident response, reliability, cost control, security and observability.',
  },
  {
    canonical_job_title: 'Quản lý trung tâm ngoại ngữ',
    industry: 'Giáo dục - Trung tâm ngoại ngữ',
    function_group: 'Vận hành trung tâm giáo dục',
    level: 'Manager',
    location: 'Vietnam',
    company_type: 'Private education / Language center',
    currency: 'VND',
    salary_min: 14_000_000,
    salary_median: 18_000_000,
    salary_avg: 19_500_000,
    salary_max: 42_000_000,
    top_50: 18_000_000,
    top_40: 21_000_000,
    top_30: 24_000_000,
    top_20: 29_000_000,
    top_10: 38_000_000,
    top_5: 48_000_000,
    source_id: null,
    sample_size: 90,
    confidence_score: 76,
    notes: 'Manual fallback for language center manager roles: operations, enrollment, retention, teacher utilization, parent/customer complaint SLA.',
  },
  {
    canonical_job_title: 'Nhân viên tư vấn du học',
    industry: 'Giáo dục - Tư vấn du học / Admissions',
    function_group: 'Admissions counseling / Student recruitment',
    level: 'Staff',
    location: 'Vietnam',
    company_type: 'Private education / Study abroad agency',
    currency: 'VND',
    salary_min: 7_000_000,
    salary_median: 11_000_000,
    salary_avg: 12_500_000,
    salary_max: 30_000_000,
    top_50: 11_000_000,
    top_40: 13_000_000,
    top_30: 15_000_000,
    top_20: 18_000_000,
    top_10: 24_000_000,
    top_5: 32_000_000,
    source_id: null,
    sample_size: 80,
    confidence_score: 72,
    notes: 'Manual fallback for study abroad/admissions counselor roles: counseling, application/visa checklist, CRM follow-up, offer/visa/enrollment conversion.',
  },
  {
    canonical_job_title: 'Nhân viên tư vấn tuyển sinh',
    industry: 'Giáo dục - Tuyển sinh / Admissions',
    function_group: 'Enrollment counseling / Student recruitment',
    level: 'Staff',
    location: 'Vietnam',
    company_type: 'Private education / Language center / Private university',
    currency: 'VND',
    salary_min: 7_000_000,
    salary_median: 10_500_000,
    salary_avg: 12_000_000,
    salary_max: 28_000_000,
    top_50: 10_500_000,
    top_40: 12_500_000,
    top_30: 14_500_000,
    top_20: 17_500_000,
    top_10: 23_000_000,
    top_5: 30_000_000,
    source_id: null,
    sample_size: 90,
    confidence_score: 72,
    notes: 'Manual fallback for enrollment/admissions counselor roles at language centers and private schools/universities: lead qualification, program fit, CRM follow-up, payment/enrollment conversion.',
  },
  {
    canonical_job_title: 'Tài xế taxi',
    industry: 'Vận tải - Taxi / Công nghệ gọi xe',
    function_group: 'Lái xe chở khách / Dịch vụ vận tải cá nhân',
    level: 'Staff',
    location: 'Vietnam',
    company_type: 'Taxi company / Ride-hailing / Private transport service',
    currency: 'VND',
    salary_min: 7_000_000,
    salary_median: 11_000_000,
    salary_avg: 12_500_000,
    salary_max: 30_000_000,
    top_50: 11_000_000,
    top_40: 13_000_000,
    top_30: 15_000_000,
    top_20: 18_000_000,
    top_10: 24_000_000,
    top_5: 32_000_000,
    source_id: null,
    sample_size: 80,
    confidence_score: 70,
    notes: 'Manual fallback for taxi/ride-hailing drivers: trip completion, safety, route efficiency, customer rating, fuel/time cost and incident handling.',
  },
  {
    canonical_job_title: 'Phi công',
    industry: 'Hàng không - Flight deck',
    function_group: 'Pilot / Flight operations',
    level: 'Professional',
    location: 'Vietnam',
    company_type: 'Airline / Charter / Cargo aviation',
    currency: 'VND',
    salary_min: 45_000_000,
    salary_median: 80_000_000,
    salary_avg: 95_000_000,
    salary_max: 260_000_000,
    top_50: 80_000_000,
    top_40: 95_000_000,
    top_30: 110_000_000,
    top_20: 130_000_000,
    top_10: 180_000_000,
    top_5: 230_000_000,
    source_id: null,
    sample_size: 60,
    confidence_score: 70,
    notes: 'Manual fallback for pilot roles: First Officer/Captain track, type rating, recurrent/simulator check, flight hours/logbook, SOP/safety record and route-aircraft qualification.',
  },
  {
    canonical_job_title: 'Công nhân vận hành máy',
    industry: 'Sản xuất - Kỹ thuật',
    function_group: 'Sản xuất / Nhà máy',
    level: 'Staff',
    location: 'Vietnam',
    company_type: 'FDI / Manufacturing',
    currency: 'VND',
    salary_min: 8_000_000,
    salary_median: 11_000_000,
    salary_avg: 11_500_000,
    salary_max: 18_000_000,
    top_50: 11_000_000,
    top_40: 12_500_000,
    top_30: 14_000_000,
    top_20: 15_500_000,
    top_10: 18_000_000,
    top_5: 22_000_000,
    source_id: null,
    sample_size: 120,
    confidence_score: 72,
    notes: 'Manual fallback for factory operator roles when imported benchmark tables do not contain this title.',
  },
  {
    canonical_job_title: 'CMO (Giám đốc Marketing)',
    industry: 'Quản trị điều hành',
    function_group: 'Executive marketing / Growth mandate',
    level: 'Executive',
    location: 'Vietnam',
    company_type: 'Executive / Board-facing leadership',
    currency: 'VND',
    salary_min: 55_000_000,
    salary_median: 100_000_000,
    salary_avg: 120_000_000,
    salary_max: 300_000_000,
    top_50: 100_000_000,
    top_40: 113_500_000,
    top_30: 127_000_000,
    top_20: 141_000_000,
    top_10: 190_000_000,
    top_5: 260_000_000,
    source_id: null,
    sample_size: 60,
    confidence_score: 78,
    notes: 'Manual executive guardrail for CMO roles: revenue/growth mandate, budget ownership, CAC/LTV, pipeline contribution and board/CEO alignment.',
  },
  {
    canonical_job_title: 'CEO / Tổng giám đốc',
    industry: 'Quản trị điều hành',
    function_group: 'Executive P&L / General management',
    level: 'Executive',
    location: 'Vietnam',
    company_type: 'Executive / Owner-board mandate',
    currency: 'VND',
    salary_min: 100_000_000,
    salary_median: 180_000_000,
    salary_avg: 240_000_000,
    salary_max: 800_000_000,
    top_50: 180_000_000,
    top_40: 213_000_000,
    top_30: 246_000_000,
    top_20: 280_000_000,
    top_10: 420_000_000,
    top_5: 650_000_000,
    source_id: null,
    sample_size: 55,
    confidence_score: 78,
    notes: 'Manual executive guardrail for CEO roles: P&L mandate, operating authority, board/owner reporting, bonus/equity and profit-sharing package.',
  },
];

const VN_STOP_WORDS = new Set([
  'nhan', 'vien', 'chuyen', 'vien', 'truong', 'phong', 'giam', 'doc', 'senior',
  'junior', 'lead', 'manager', 'executive', 'staff', 'specialist', 'officer',
]);

const BUILTIN_JOB_ALIASES: Array<{ tokens: string[]; canonical: string }> = [
  { tokens: ['react', 'native'], canonical: 'Mobile Developer (iOS/Android)' },
  { tokens: ['android'], canonical: 'Mobile Developer (iOS/Android)' },
  { tokens: ['ios'], canonical: 'Mobile Developer (iOS/Android)' },
  { tokens: ['flutter'], canonical: 'Mobile Developer (iOS/Android)' },
  { tokens: ['mobile'], canonical: 'Mobile Developer (iOS/Android)' },
  { tokens: ['frontend'], canonical: 'Frontend Developer' },
  { tokens: ['front-end'], canonical: 'Frontend Developer' },
  { tokens: ['frintend'], canonical: 'Frontend Developer' },
  { tokens: ['fronted'], canonical: 'Frontend Developer' },
  { tokens: ['front', 'end', 'developer'], canonical: 'Frontend Developer' },
  { tokens: ['front', 'end'], canonical: 'Frontend Developer' },
  { tokens: ['react'], canonical: 'Frontend Developer' },
  { tokens: ['vue'], canonical: 'Frontend Developer' },
  { tokens: ['angular'], canonical: 'Frontend Developer' },
  { tokens: ['fullstack'], canonical: 'Fullstack Developer' },
  { tokens: ['full', 'stack'], canonical: 'Fullstack Developer' },
  { tokens: ['java'], canonical: 'Backend Developer' },
  { tokens: ['php'], canonical: 'Backend Developer' },
  { tokens: ['node'], canonical: 'Backend Developer' },
  { tokens: ['python'], canonical: 'Backend Developer' },
  { tokens: ['backend'], canonical: 'Backend Developer' },
  { tokens: ['back', 'end'], canonical: 'Backend Developer' },
  { tokens: ['data', 'engineer'], canonical: 'Data Engineer' },
  { tokens: ['data', 'scientist'], canonical: 'Data Scientist' },
  { tokens: ['data', 'analyst'], canonical: 'Data Analyst' },
  { tokens: ['ai'], canonical: 'Machine Learning Researcher' },
  { tokens: ['machine', 'learning'], canonical: 'Machine Learning Researcher' },
  { tokens: ['product', 'manager'], canonical: 'Product Manager' },
  { tokens: ['product', 'owner'], canonical: 'Product Manager' },
  { tokens: ['business', 'analyst'], canonical: 'Business Analyst (IT)' },
  { tokens: ['ba'], canonical: 'Business Analyst (IT)' },
  { tokens: ['qa'], canonical: 'QA/QC Engineer' },
  { tokens: ['qc'], canonical: 'QA/QC Engineer' },
  { tokens: ['tester'], canonical: 'QA/QC Engineer' },
  { tokens: ['devops'], canonical: 'DevOps Engineer' },
  { tokens: ['ui', 'ux'], canonical: 'UI/UX Designer' },
  { tokens: ['ux', 'ui'], canonical: 'UI/UX Designer' },
  { tokens: ['graphic'], canonical: 'Graphic Designer' },
  { tokens: ['designer'], canonical: 'Graphic Designer' },
  { tokens: ['ke', 'toan', 'truong'], canonical: 'Kế toán trưởng' },
  { tokens: ['ke', 'toan', 'thanh', 'toan'], canonical: 'Kế toán thanh toán' },
  { tokens: ['ke', 'toan', 'tong', 'hop'], canonical: 'Kế toán tổng hợp' },
  { tokens: ['ke', 'toan'], canonical: 'Kế toán tổng hợp' },
  { tokens: ['accountant'], canonical: 'Kế toán tổng hợp' },
  { tokens: ['chief', 'accountant'], canonical: 'Chief Accountant / Accounting Manager' },
  { tokens: ['tuyen', 'dung'], canonical: 'Chuyên viên tuyển dụng' },
  { tokens: ['recruiter'], canonical: 'Chuyên viên tuyển dụng' },
  { tokens: ['recruitment'], canonical: 'Chuyên viên tuyển dụng' },
  { tokens: ['hanh', 'chinh', 'nhan', 'su'], canonical: 'Nhân viên hành chính nhân sự' },
  { tokens: ['hrbp'], canonical: 'HR Business Partner (HRBP)' },
  { tokens: ['hr'], canonical: 'Nhân viên hành chính nhân sự' },
  { tokens: ['nhan', 'su'], canonical: 'Nhân viên hành chính nhân sự' },
  { tokens: ['cham', 'soc', 'khach', 'hang'], canonical: 'Nhân viên chăm sóc khách hàng' },
  { tokens: ['customer', 'service'], canonical: 'Nhân viên chăm sóc khách hàng' },
  { tokens: ['customer', 'success'], canonical: 'Nhân viên chăm sóc khách hàng' },
  { tokens: ['sales', 'director'], canonical: 'Giám đốc kinh doanh (Sales Director)' },
  { tokens: ['sales'], canonical: 'Sales Executive B2B' },
  { tokens: ['sale', 'admin'], canonical: 'Sales Executive B2B' },
  { tokens: ['sale'], canonical: 'Sales Executive B2B' },
  { tokens: ['kinh', 'doanh'], canonical: 'Nhân viên kinh doanh' },
  { tokens: ['marketing', 'director'], canonical: 'Marketing Director / CMO' },
  { tokens: ['marketing', 'manager'], canonical: 'Trưởng phòng Marketing' },
  { tokens: ['marketing'], canonical: 'Chuyên viên Marketing' },
  { tokens: ['content'], canonical: 'Chuyên viên Content Marketing' },
  { tokens: ['seo'], canonical: 'Chuyên viên SEO' },
  { tokens: ['quan', 'ly', 'trung', 'tam', 'ngoai', 'ngu'], canonical: 'Quản lý trung tâm ngoại ngữ' },
  { tokens: ['trung', 'tam', 'ngoai', 'ngu'], canonical: 'Quản lý trung tâm ngoại ngữ' },
  { tokens: ['language', 'center'], canonical: 'Quản lý trung tâm ngoại ngữ' },
  { tokens: ['english', 'center'], canonical: 'Quản lý trung tâm ngoại ngữ' },
  { tokens: ['teacher'], canonical: 'Giáo viên Tiếng Anh' },
  { tokens: ['giao', 'vien'], canonical: 'Giáo viên Tiếng Anh' },
  { tokens: ['bac', 'si'], canonical: 'Bác sĩ đa khoa' },
  { tokens: ['doctor'], canonical: 'Bác sĩ đa khoa' },
  { tokens: ['nurse'], canonical: 'Điều dưỡng viên' },
  { tokens: ['dieu', 'duong'], canonical: 'Điều dưỡng viên' },
  { tokens: ['duoc', 'si'], canonical: 'Dược sĩ bán lẻ (nhà thuốc)' },
  { tokens: ['pharmacist'], canonical: 'Dược sĩ bán lẻ (nhà thuốc)' },
  { tokens: ['luat', 'su'], canonical: 'Luật sư' },
  { tokens: ['lawyer'], canonical: 'Luật sư' },
  { tokens: ['bat', 'dong', 'san'], canonical: 'Môi giới bất động sản' },
  { tokens: ['moi', 'gioi'], canonical: 'Môi giới bất động sản' },
  { tokens: ['real', 'estate'], canonical: 'Môi giới bất động sản' },
  { tokens: ['ky', 'su', 'xay', 'dung'], canonical: 'Kỹ sư xây dựng' },
  { tokens: ['civil', 'engineer'], canonical: 'Kỹ sư xây dựng' },
  { tokens: ['cong', 'nhan', 'binh', 'duong'], canonical: 'Công nhân vận hành máy' },
  { tokens: ['cong', 'nhan', 'san', 'xuat'], canonical: 'Công nhân vận hành máy' },
  { tokens: ['factory', 'worker'], canonical: 'Công nhân vận hành máy' },
  { tokens: ['machine', 'operator'], canonical: 'Công nhân vận hành máy' },
  { tokens: ['production', 'operator'], canonical: 'Công nhân vận hành máy' },
  { tokens: ['cong', 'nhan'], canonical: 'Công nhân vận hành máy' },
  { tokens: ['worker'], canonical: 'Công nhân vận hành máy' },
  { tokens: ['fresher'], canonical: 'Nhân viên hành chính văn phòng' },
  { tokens: ['new', 'graduate'], canonical: 'Nhân viên hành chính văn phòng' },
  { tokens: ['sinh', 'vien', 'moi', 'tot', 'nghiep'], canonical: 'Nhân viên hành chính văn phòng' },
  { tokens: ['moi', 'ra', 'truong'], canonical: 'Nhân viên hành chính văn phòng' },
  { tokens: ['tiep', 'vien', 'hang', 'khong'], canonical: 'Tiếp viên hàng không' },
  { tokens: ['cabin', 'crew'], canonical: 'Tiếp viên hàng không' },
  { tokens: ['flight', 'attendant'], canonical: 'Tiếp viên hàng không' },
  { tokens: ['phi', 'cong'], canonical: 'Phi công' },
  { tokens: ['pilot'], canonical: 'Phi công' },
  { tokens: ['co', 'pho'], canonical: 'Phi công' },
  { tokens: ['first', 'officer'], canonical: 'Phi công' },
  { tokens: ['airline', 'pilot'], canonical: 'Phi công' },
  { tokens: ['dau', 'bep'], canonical: 'Đầu bếp (Chef)' },
  { tokens: ['chef'], canonical: 'Đầu bếp (Chef)' },
  { tokens: ['barista'], canonical: 'Barista (Pha chế cà phê)' },
  { tokens: ['taxi'], canonical: 'Tài xế taxi' },
  { tokens: ['taxi', 'driver'], canonical: 'Tài xế taxi' },
  { tokens: ['shipper'], canonical: 'Nhân viên giao hàng (Shipper)' },
  { tokens: ['tai', 'xe'], canonical: 'Tài xế xe máy (Xe ôm công nghệ)' },
  { tokens: ['driver'], canonical: 'Tài xế xe máy (Xe ôm công nghệ)' },
  { tokens: ['logistics'], canonical: 'Nhân viên kho vận' },
  { tokens: ['xuat', 'nhap', 'khau'], canonical: 'Nhân viên xuất nhập khẩu (Import-Export)' },
  { tokens: ['import', 'export'], canonical: 'Nhân viên xuất nhập khẩu (Import-Export)' },
  { tokens: ['purchasing'], canonical: 'Chuyên viên mua hàng (Purchasing)' },
  { tokens: ['buyer'], canonical: 'Chuyên viên mua hàng (Purchasing)' },
  { tokens: ['thu', 'ky'], canonical: 'Thư ký giám đốc' },
  { tokens: ['secretary'], canonical: 'Thư ký giám đốc' },
  { tokens: ['admin'], canonical: 'Nhân viên hành chính văn phòng' },
  { tokens: ['operation'], canonical: 'Quản lý vận hành tòa nhà' },
  { tokens: ['operations'], canonical: 'Quản lý vận hành tòa nhà' },
  { tokens: ['ceo'], canonical: 'CEO / Tổng giám đốc' },
  { tokens: ['cfo'], canonical: 'CFO (Giám đốc tài chính)' },
  { tokens: ['cto'], canonical: 'CTO' },
  { tokens: ['van', 'dong', 'vien'], canonical: 'Huấn luyện viên cá nhân (Personal Trainer)' },
  { tokens: ['athlete'], canonical: 'Huấn luyện viên cá nhân (Personal Trainer)' },
  { tokens: ['personal', 'trainer'], canonical: 'Huấn luyện viên cá nhân (Personal Trainer)' },
  { tokens: ['du', 'hoc'], canonical: 'Nhân viên tư vấn du học' },
  { tokens: ['tuyen', 'sinh'], canonical: 'Nhân viên tư vấn tuyển sinh' },
  { tokens: ['admissions'], canonical: 'Nhân viên tư vấn tuyển sinh' },
  { tokens: ['admission'], canonical: 'Nhân viên tư vấn tuyển sinh' },
];

export function normalizeTitle(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s/+.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveBuiltInAlias(jobTitle: string) {
  const normalized = normalizeTitle(jobTitle);
  const tokenSet = new Set(tokenizeTitle(jobTitle));
  return BUILTIN_JOB_ALIASES.find(alias =>
    alias.tokens.every(token => tokenSet.has(token) || (token.length >= 4 && normalized.includes(token)))
  )?.canonical ?? null;
}

function getManualBenchmarkRows(jobTitle: string) {
  const normalized = normalizeTitle(jobTitle);
  return MANUAL_BENCHMARK_ROWS.filter(row => normalizeTitle(row.canonical_job_title) === normalized);
}

function shouldPreferManualExecutiveBenchmark(jobTitle: string) {
  const normalized = normalizeTitle(jobTitle);
  return normalized === 'cmo giam doc marketing' || normalized === 'ceo / tong giam doc';
}

function isExecutiveBenchmarkTitle(jobTitle: string, matchedJobTitle?: string | null, industry?: string | null) {
  const text = normalizeTitle(`${jobTitle} ${matchedJobTitle || ''} ${industry || ''}`);
  return /\bcmo\b|\bceo\b|tong giam doc|giam doc marketing|chief executive|general director|quan tri dieu hanh/.test(text);
}

function tokenizeTitle(value: string) {
  return normalizeTitle(value)
    .split(' ')
    .filter(token => token.length >= 2 && !VN_STOP_WORDS.has(token));
}

function scoreBenchmarkMatch(queryTokens: string[], row: SalaryBenchmarkRow) {
  const title = normalizeTitle(row.canonical_job_title);
  const industry = normalizeTitle(row.industry ?? '');
  const functionGroup = normalizeTitle(row.function_group ?? '');
  const titleTokens = new Set(tokenizeTitle(row.canonical_job_title));
  const industryTokens = new Set(tokenizeTitle(row.industry ?? ''));
  const functionTokens = new Set(tokenizeTitle(row.function_group ?? ''));
  const normalizedQuery = queryTokens.join(' ');

  if (!queryTokens.length) return 0;
  if (title === normalizedQuery) return 220;
  if (title.includes(normalizedQuery)) return 150 + normalizedQuery.length;

  let score = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) score += 36;
    else if (title.includes(token)) score += 24;
    else if (functionTokens.has(token)) score += 16;
    else if (industryTokens.has(token) || industry.includes(token) || functionGroup.includes(token)) score += 10;
  }

  const coverage = score / Math.max(1, queryTokens.length);
  const firstToken = queryTokens[0];
  if (firstToken && titleTokens.has(firstToken)) score += 12;
  if (queryTokens.length >= 2 && coverage >= 24) score += 18;
  return score;
}

export function normalizeExperience(experience: unknown): ExperienceKey {
  return typeof experience === 'string' && experience in EXPERIENCE_MULTIPLIER
    ? experience as ExperienceKey
    : 'mid';
}

function applyMultiplier(raw: SalaryBandInput, multiplier: number): SalaryBandInput {
  const scale = (value: number | null | undefined) => value == null ? null : Math.round(value * multiplier);
  return {
    top_50: Math.max(500_000, Math.round(raw.top_50 * multiplier)),
    top_40: scale(raw.top_40),
    top_30: scale(raw.top_30),
    top_20: scale(raw.top_20),
    top_10: scale(raw.top_10),
    top_5: scale(raw.top_5),
    top_1: scale(raw.top_1),
  };
}

function applyLocationMultiplier(raw: SalaryBandInput, multiplier: number): SalaryBandInput {
  return applyMultiplier(raw, multiplier);
}

function convertSalary(value: number | null | undefined, currency: string | null | undefined) {
  if (value == null || Number.isNaN(value)) return null;
  if ((currency ?? '').toUpperCase() === 'USD') return Math.round(value * USD_TO_VND);
  return Math.round(value);
}

function estimateBandsFromRow(row: SalaryBenchmarkRow): SalaryBandInput {
  const currency = row.currency ?? 'VND';
  const median =
    convertSalary(row.top_50, currency) ??
    convertSalary(row.salary_median, currency) ??
    convertSalary(row.salary_avg, currency) ??
    averageNullable(convertSalary(row.salary_min, currency), convertSalary(row.salary_max, currency)) ??
    DEFAULT_BANDS.top_50;

  const max = convertSalary(row.salary_max, currency);
  const min = convertSalary(row.salary_min, currency);
  const top20 = convertSalary(row.top_20, currency) ?? (max ? Math.round(median + (max - median) * 0.45) : null);
  const top10 = convertSalary(row.top_10, currency) ?? (max ? Math.round(median + (max - median) * 0.70) : null);
  const top5 = convertSalary(row.top_5, currency) ?? max ?? null;

  return {
    top_50: median,
    top_40: convertSalary(row.top_40, currency),
    top_30: convertSalary(row.top_30, currency),
    top_20: top20 && top20 > median ? top20 : null,
    top_10: top10 && top10 > median ? top10 : null,
    top_5: top5 && top5 > median ? top5 : null,
    top_1: null,
    ...(min ? {} : {}),
  };
}

function averageNullable(a: number | null, b: number | null) {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return Math.round((a + b) / 2);
}

function weightedAverage(values: Array<{ value: number | null | undefined; weight: number }>) {
  const valid = values.filter(item => item.value != null && item.value > 0) as Array<{ value: number; weight: number }>;
  const weightSum = valid.reduce((sum, item) => sum + item.weight, 0);
  if (!valid.length || weightSum <= 0) return null;
  return Math.round(valid.reduce((sum, item) => sum + item.value * item.weight, 0) / weightSum);
}

function sourceTierWeight(source?: SourceRow) {
  if (!source) return 1;
  if (source.source_tier === 'A') return 1.35;
  if (source.source_tier === 'B') return 1.15;
  if (source.source_tier === 'C') return 0.95;
  return 0.75;
}

function aggregateRows(rows: SalaryBenchmarkRow[], sources: SourceRow[]) {
  const sourceMap = new Map(sources.map(source => [source.id, source]));
  const normalized = rows.map(row => {
    const source = row.source_id ? sourceMap.get(row.source_id) : undefined;
    const confidence = row.confidence_score ?? 60;
    const weight = (confidence / 100) * sourceTierWeight(source);
    return { row, bands: estimateBandsFromRow(row), weight, source };
  });

  const top50 = weightedAverage(normalized.map(item => ({ value: item.bands.top_50, weight: item.weight }))) ?? DEFAULT_BANDS.top_50;
  const top20 = weightedAverage(normalized.map(item => ({ value: item.bands.top_20, weight: item.weight })));
  const top10 = weightedAverage(normalized.map(item => ({ value: item.bands.top_10, weight: item.weight })));
  const top5 = weightedAverage(normalized.map(item => ({ value: item.bands.top_5, weight: item.weight })));
  const top40 = weightedAverage(normalized.map(item => ({ value: item.bands.top_40, weight: item.weight })));
  const top30 = weightedAverage(normalized.map(item => ({ value: item.bands.top_30, weight: item.weight })));
  const confidenceBase = weightedAverage(normalized.map(item => ({ value: item.row.confidence_score ?? 60, weight: item.weight }))) ?? 60;
  const sourceNames = Array.from(new Set(normalized.map(item => item.source?.source_name).filter(Boolean))) as string[];
  const sourceBonus = Math.min(10, Math.max(0, sourceNames.length - 1) * 4);
  const sampleBonus = rows.some(row => (row.sample_size ?? 0) >= 100) ? 4 : 0;
  const confidenceScore = Math.min(96, Math.round(confidenceBase + sourceBonus + sampleBonus));

  return {
    bands: { top_50: top50, top_40: top40, top_30: top30, top_20: top20, top_10: top10, top_5: top5 },
    confidenceScore,
    sources: sourceNames,
    industry: rows.find(row => row.industry)?.industry ?? null,
    matchedJobTitle: rows[0]?.canonical_job_title ?? null,
  };
}

function makeThresholdPreview(thresholds: PercentileThresholds, percent: number, includeLocked: boolean) {
  const rows = [
    { label: 'Top 80%', salary: thresholds.top_80, locked: false },
    { label: 'Top 70%', salary: thresholds.top_70, locked: false },
    { label: 'Top 60%', salary: thresholds.top_60, locked: false },
    { label: 'Top 50%', salary: thresholds.top_50, locked: false },
    { label: 'Top 40%', salary: thresholds.top_40, locked: false },
    { label: 'Top 30%', salary: thresholds.top_30, locked: false },
    { label: 'Top 20%', salary: thresholds.top_20, locked: false },
    { label: 'Top 10%', salary: includeLocked ? thresholds.top_10 : null, locked: !includeLocked },
    { label: 'Top 5%', salary: includeLocked ? thresholds.top_5 : null, locked: !includeLocked },
    { label: 'Top 1%', salary: includeLocked ? thresholds.top_1 : null, locked: !includeLocked },
  ];
  return rows.map(row => ({ ...row, active: Number(row.label.match(/\d+/)?.[0] ?? 0) === percent }));
}

function publicBenchmark(meta: BenchmarkMeta, includeLocked: boolean): PublicBenchmarkMeta {
  const { thresholds, ...rest } = meta;
  return {
    ...rest,
    thresholdPreview: makeThresholdPreview(thresholds, meta.percentileBucket, includeLocked),
  };
}

async function fetchSources(supabase: SupabaseClient, sourceIds: Array<string | null>) {
  const ids = Array.from(new Set(sourceIds.filter(Boolean))) as string[];
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('salary_sources')
    .select('id, source_name, source_tier')
    .in('id', ids);
  if (error || !data) return [];
  return data as SourceRow[];
}

async function fetchBenchmarkRows(supabase: SupabaseClient, canonicalTitle: string) {
  const { data, error } = await supabase
    .from('salary_benchmarks')
    .select('*')
    .ilike('canonical_job_title', canonicalTitle)
    .order('confidence_score', { ascending: false })
    .limit(12);
  if (error || !data?.length) return [];
  return data as SalaryBenchmarkRow[];
}

async function fetchFuzzyBenchmarkRows(supabase: SupabaseClient, jobTitle: string) {
  const queryTokens = tokenizeTitle(jobTitle);
  if (!queryTokens.length) return [];

  const { data, error } = await supabase
    .from('salary_benchmarks')
    .select('*')
    .order('confidence_score', { ascending: false })
    .limit(500);
  if (error || !data?.length) return [];

  const scored = (data as SalaryBenchmarkRow[])
    .map(row => ({ row, score: scoreBenchmarkMatch(queryTokens, row) }))
    .filter(item => item.score >= (queryTokens.length === 1 ? 46 : 62))
    .sort((a, b) => b.score - a.score || (b.row.confidence_score ?? 0) - (a.row.confidence_score ?? 0));

  const best = scored[0]?.row.canonical_job_title;
  if (!best) return [];
  return (data as SalaryBenchmarkRow[]).filter(row => row.canonical_job_title === best);
}

function shouldUseSimilarRoleFallback(jobTitle: string) {
  const segment = detectRoleSegment(jobTitle);
  return segment === 'general' || segment === 'fresh';
}

function isLooseSegment(segment: RoleSegment) {
  return segment === 'general' || segment === 'fresh';
}

function hasCompatibleResolvedSegment(jobTitle: string, rows: SalaryBenchmarkRow[]) {
  const querySegment = detectRoleSegment(jobTitle);
  if (isLooseSegment(querySegment)) return true;
  const resolvedSegment = detectRoleSegment(rows[0]?.canonical_job_title || jobTitle, rows[0]?.industry);
  return resolvedSegment === querySegment;
}

function filterCompatibleBenchmarkRows(jobTitle: string, rows: SalaryBenchmarkRow[]) {
  const querySegment = detectRoleSegment(jobTitle);
  if (!rows.length || isLooseSegment(querySegment)) return rows;
  return rows.filter(row => detectRoleSegment(row.canonical_job_title, row.industry) === querySegment);
}

async function resolveFromNewTables(supabase: SupabaseClient, jobTitle: string) {
  const trimmed = jobTitle.trim();

  const preferManualExecutiveBenchmark = shouldPreferManualExecutiveBenchmark(trimmed);
  let rows = preferManualExecutiveBenchmark ? getManualBenchmarkRows(trimmed) : await fetchBenchmarkRows(supabase, trimmed);
  let matchType: ResolvedSalaryBenchmark['matchType'] = 'exact';
  if (rows.length) rows = filterCompatibleBenchmarkRows(trimmed, rows);

  if (!rows.length && !preferManualExecutiveBenchmark) {
    rows = getManualBenchmarkRows(trimmed);
    matchType = rows.length ? 'exact' : matchType;
  }

  if (!rows.length) {
    const builtInAlias = resolveBuiltInAlias(trimmed);
    if (builtInAlias) {
      rows = await fetchBenchmarkRows(supabase, builtInAlias);
      if (rows.length) rows = filterCompatibleBenchmarkRows(trimmed, rows);
      if (!rows.length) rows = getManualBenchmarkRows(builtInAlias);
      if (rows.length && !hasCompatibleResolvedSegment(trimmed, rows)) rows = [];
      matchType = rows.length ? 'alias' : matchType;
    }
  }

  if (!rows.length) {
    const { data: aliasRows } = await supabase
      .from('job_aliases')
      .select('canonical_job_title, match_type, confidence_score')
      .ilike('alias_title', trimmed)
      .order('confidence_score', { ascending: false })
      .limit(1);
    const alias = aliasRows?.[0] as { canonical_job_title?: string; match_type?: string } | undefined;
    if (alias?.canonical_job_title) {
      rows = await fetchBenchmarkRows(supabase, alias.canonical_job_title);
      if (rows.length) rows = filterCompatibleBenchmarkRows(trimmed, rows);
      if (rows.length && !hasCompatibleResolvedSegment(trimmed, rows)) rows = [];
      matchType = alias.match_type === 'industry_estimate' ? 'industry_estimate' : 'alias';
    }
  }

  const allowSimilarRoleFallback = shouldUseSimilarRoleFallback(trimmed);

  if (!rows.length && allowSimilarRoleFallback) {
    const q = normalizeTitle(trimmed)
      .split(' ')
      .filter(token => token.length >= 3 && !VN_STOP_WORDS.has(token))
      .slice(0, 3);
    if (q.length) {
      const pattern = `%${q.join('%')}%`;
      const { data } = await supabase
        .from('salary_benchmarks')
        .select('*')
        .or(`canonical_job_title.ilike.${pattern},industry.ilike.${pattern},function_group.ilike.${pattern}`)
        .order('confidence_score', { ascending: false })
        .limit(8);
      rows = (data ?? []) as SalaryBenchmarkRow[];
      if (rows.length) rows = filterCompatibleBenchmarkRows(trimmed, rows);
      matchType = rows.length ? 'similar_role' : matchType;
    }
  }

  if (!rows.length && allowSimilarRoleFallback) {
    rows = await fetchFuzzyBenchmarkRows(supabase, trimmed);
    if (rows.length) rows = filterCompatibleBenchmarkRows(trimmed, rows);
    matchType = rows.length ? 'similar_role' : matchType;
  }

  if (!rows.length) return null;
  const sources = await fetchSources(supabase, rows.map(row => row.source_id));
  return { rows, sources, matchType };
}

async function resolveLegacySalaryData(supabase: SupabaseClient, jobTitle: string) {
  const { data, error } = await supabase
    .from('salary_data')
    .select('top_50, top_20, top_10, top_5, industry, job_title')
    .ilike('job_title', jobTitle.trim())
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as LegacySalaryRow;
}

export async function resolveSalaryBenchmark(
  supabase: SupabaseClient,
  jobTitle: string,
  salary: number,
  experience: ExperienceKey,
  includeLockedThresholds = false,
  marketLocationInput?: unknown
): Promise<ResolvedSalaryBenchmark> {
  const marketLocationKey: MarketLocationKey = normalizeMarketLocation(marketLocationInput);
  const marketLocation = getMarketLocation(marketLocationKey);
  const newTableResult = await resolveFromNewTables(supabase, jobTitle).catch(() => null);

  let rawBands: SalaryBandInput = DEFAULT_BANDS;
  let matchedJobTitle: string | null = null;
  let industry: string | null = null;
  let matchType: ResolvedSalaryBenchmark['matchType'] = 'national_fallback';
  let sources: string[] = ['NSO/GSO'];
  let confidenceScore = 46;
  let hasDirectData = false;

  if (newTableResult) {
    const aggregate = aggregateRows(newTableResult.rows, newTableResult.sources);
    rawBands = aggregate.bands;
    matchedJobTitle = aggregate.matchedJobTitle;
    industry = aggregate.industry;
    matchType = newTableResult.matchType;
    sources = aggregate.sources.length ? aggregate.sources : ['VSPI Salary Benchmark'];
    confidenceScore = aggregate.confidenceScore;
    hasDirectData = matchType === 'exact' || matchType === 'alias';
  } else {
    const legacy = await resolveLegacySalaryData(supabase, jobTitle);
    if (legacy) {
      rawBands = { top_50: legacy.top_50, top_20: legacy.top_20, top_10: legacy.top_10, top_5: legacy.top_5 };
      matchedJobTitle = legacy.job_title;
      industry = legacy.industry;
      matchType = 'legacy_salary_data';
      sources = ['VSPI legacy salary_data'];
      confidenceScore = legacy.top_10 && legacy.top_5 ? 78 : legacy.top_20 ? 68 : 56;
      hasDirectData = true;
    } else {
      const estimate = await estimateCustomJobBenchmark(jobTitle);
      rawBands = estimate.bands;
      matchedJobTitle = jobTitle.trim();
      industry = estimate.industry;
      matchType = 'ai_estimate';
      sources = estimate.sources;
      confidenceScore = estimate.confidenceScore;
      hasDirectData = false;
    }
  }

  const isExecutiveBenchmark = isExecutiveBenchmarkTitle(jobTitle, matchedJobTitle, industry);
  const multiplier = isExecutiveBenchmark ? 1 : EXPERIENCE_MULTIPLIER[experience];
  const locationMultiplier = isExecutiveBenchmark ? 1 : marketLocation.multiplier;
  const experienceAdjustedBands = applyMultiplier(rawBands, multiplier);
  const adjustedBands = {
    ...applyLocationMultiplier(experienceAdjustedBands, locationMultiplier),
    minimumMonthlySalary: getMinimumMonthlySalaryForMarket(marketLocationKey),
  };
  const thresholds = buildPercentileThresholds(adjustedBands);
  const percentileBucket = getPercentileBucket(salary, thresholds);
  const nextTargetSalary = getNextTargetSalary(salary, thresholds);
  const strategicTargetSalary = getStrategicOpportunityTarget(salary, percentileBucket, thresholds).salary;
  const lostMoney = Math.max(0, (Math.max(nextTargetSalary, strategicTargetSalary) - salary) * 12);
  const isAboveMedian = salary >= adjustedBands.top_50;
  const displayIndustry = getDisplayIndustry(jobTitle, matchedJobTitle, industry);

  const meta = buildBenchmarkMeta(
    salary,
    adjustedBands,
    hasDirectData,
    displayIndustry,
    undefined,
    {
      confidenceScore,
      sources,
      matchedJobTitle: matchedJobTitle ?? undefined,
      matchType,
      marketLocation: marketLocation.label,
      locationMultiplier,
      sourceType:
        matchType === 'ai_estimate' ? 'AI estimate chờ owner duyệt' :
        matchType === 'industry_estimate' ? 'Ước tính theo ngành' :
        matchType === 'similar_role' ? 'Benchmark từ nghề tương đương' :
        'Benchmark nhiều nguồn',
    }
  );

  return {
    requestedJobTitle: jobTitle,
    matchedJobTitle,
    industry: displayIndustry,
    matchType,
    hasDirectData,
    rawBands: adjustedBands,
    thresholds,
    publicDbData: {
      top_50: adjustedBands.top_50,
      top_20: adjustedBands.top_20,
      top_10: includeLockedThresholds ? thresholds.top_10 : null,
      top_5: includeLockedThresholds ? thresholds.top_5 : null,
      industry: displayIndustry,
      job_title: matchedJobTitle,
    },
    fullDbData: {
      top_50: adjustedBands.top_50,
      top_40: thresholds.top_40,
      top_30: thresholds.top_30,
      top_20: thresholds.top_20,
      top_10: thresholds.top_10,
      top_5: thresholds.top_5,
      top_1: thresholds.top_1,
      industry: displayIndustry,
      job_title: matchedJobTitle,
    },
    benchmark: publicBenchmark(meta, includeLockedThresholds),
    nextTargetSalary,
    percentileBucket,
    lostMoney,
    isAboveMedian,
  };
}
