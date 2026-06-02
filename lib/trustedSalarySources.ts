export type TrustedSalarySourceTier = 'A' | 'B' | 'C' | 'D';

export interface TrustedSalarySource {
  name: string;
  shortLabel: string;
  label: string;
  detail: string;
  href: string;
  tier: TrustedSalarySourceTier;
  sourceYear: number;
  methodology: string;
  licenseNote: string;
}

export const TRUSTED_SALARY_SOURCES: TrustedSalarySource[] = [
  {
    name: 'NSO/GSO Labour Force Survey',
    shortLabel: 'NSO/GSO',
    label: 'NSO/GSO Labour Force Survey',
    detail: 'Bối cảnh lực lượng lao động, thu nhập bình quân và sanity-check vĩ mô.',
    href: 'https://www.nso.gov.vn/en/data-and-statistics/2025/12/press-release-social-economic-situation-in-the-3rd-quarter-and-the-9-months-of-2025/',
    tier: 'A',
    sourceYear: 2025,
    methodology: 'Official labour-force and earnings statistics used for macro validation, not as direct role-level salary tables.',
    licenseNote: 'Public statistics; cite NSO/GSO and do not imply direct percentile microdata access.',
  },
  {
    name: 'Vietnam Minimum Wage Zones',
    shortLabel: 'Lương tối thiểu vùng',
    label: 'Nghị định 293/2025/NĐ-CP về lương tối thiểu vùng',
    detail: 'Sàn pháp lý theo 4 vùng lương, dùng để chặn benchmark thấp bất hợp lý.',
    href: 'https://vanban.chinhphu.vn/',
    tier: 'A',
    sourceYear: 2026,
    methodology: 'Legal wage floor guardrail for low-income and frontline roles by region.',
    licenseNote: 'Public legal document; cite the Government legal document portal.',
  },
  {
    name: 'Adecco Vietnam Salary Guide 2026',
    shortLabel: 'Adecco',
    label: 'Adecco Vietnam Salary Guide 2026',
    detail: 'Salary guide cho nhiều function, cấp bậc và thị trường Hà Nội/TP.HCM.',
    href: 'https://www.adecco.com/en-vn/salary-guide',
    tier: 'A',
    sourceYear: 2026,
    methodology: 'Recruitment salary guide used as role/function benchmark reference.',
    licenseNote: 'Cite source; do not republish proprietary salary tables without permission.',
  },
  {
    name: 'ManpowerGroup Vietnam Salary Guide 2025',
    shortLabel: 'Manpower',
    label: 'ManpowerGroup Vietnam Salary Guide 2025',
    detail: '700+ roles, 12 nhóm ngành, gross monthly wage theo USD/VND quy đổi.',
    href: 'https://www.manpower.com.vn/en/insights/blogs/2024/12/manpowergroup-vietnam-releases-salary-guide-2025',
    tier: 'A',
    sourceYear: 2025,
    methodology: 'Recruitment salary guide used for cross-industry salary band validation.',
    licenseNote: 'Cite ManpowerGroup Vietnam Salary Guide 2025.',
  },
  {
    name: 'Talentnet-Mercer Vietnam Total Remuneration Survey 2025',
    shortLabel: 'Talentnet-Mercer',
    label: 'Talentnet-Mercer Vietnam Total Remuneration Survey 2025',
    detail: 'Total remuneration tham chiếu cho doanh nghiệp lớn, manager và executive.',
    href: 'https://www.talentnetgroup.com/vn/vi/phan-tich-chuyen-sau/rewards-vi/bao-cao-luong-thi-truong-lao-dong-viet-nam-2025',
    tier: 'A',
    sourceYear: 2025,
    methodology: 'Total remuneration reference for large-company and leadership compensation sanity checks.',
    licenseNote: 'Cite Talentnet-Mercer; avoid copying proprietary report tables.',
  },
  {
    name: 'ITviec Vietnam IT Salary Report',
    shortLabel: 'ITviec',
    label: 'ITviec Vietnam IT Salary Report',
    detail: 'Benchmark riêng cho nhóm công nghệ: developer, QA, data, DevOps, product tech.',
    href: 'https://itviec.com/report/vietnam-it-salary-and-recruitment-market',
    tier: 'A',
    sourceYear: 2025,
    methodology: 'IT salary report used only for technology roles and tech hiring signals.',
    licenseNote: 'Cite ITviec report; do not generalize IT data to non-IT jobs.',
  },
  {
    name: 'CareerViet VietnamSalary',
    shortLabel: 'CareerViet',
    label: 'CareerViet / VietnamSalary',
    detail: 'Tra cứu dải lương tuyển dụng theo chức danh, kinh nghiệm và địa điểm.',
    href: 'https://vietnamsalary.careerviet.vn/',
    tier: 'A',
    sourceYear: 2026,
    methodology: 'Public salary lookup used as job-posting market signal.',
    licenseNote: 'Reference only; respect CareerViet terms.',
  },
  {
    name: 'TopCV Salary Tool and Market Reports',
    shortLabel: 'TopCV',
    label: 'TopCV Salary Tool & Market Reports',
    detail: 'Tín hiệu tuyển dụng, nhu cầu ứng viên và mức lương theo thị trường việc làm.',
    href: 'https://www.topcv.vn/cong-cu-tra-cuu-muc-luong',
    tier: 'A',
    sourceYear: 2026,
    methodology: 'Job-market signal used for demand and public salary lookup cross-checking.',
    licenseNote: 'Reference only; respect TopCV terms.',
  },
  {
    name: 'VietnamWorks/Navigos Salary and Talent Signals',
    shortLabel: 'VietnamWorks',
    label: 'VietnamWorks / Navigos',
    detail: 'Tín hiệu tuyển dụng, talent guide và khảo sát ứng viên/nhà tuyển dụng.',
    href: 'https://www.vietnamworks.com/',
    tier: 'B',
    sourceYear: 2026,
    methodology: 'Recruitment ecosystem signal used for hiring demand and salary sanity checks.',
    licenseNote: 'Reference only; cite source and do not imply official endorsement.',
  },
  {
    name: 'Reeracoen Vietnam Salary Guide 2025/2026',
    shortLabel: 'Reeracoen',
    label: 'Reeracoen Vietnam Salary Guide 2025/2026',
    detail: 'Salary guide cho nhóm FDI/Japan-facing, manufacturing, back-office và sales.',
    href: 'https://www.reeracoen.com.vn/en/events/vietnam-salary-guide-2025-2026',
    tier: 'B',
    sourceYear: 2026,
    methodology: 'Recruitment salary guide used for FDI/Japan-facing and cross-functional benchmarks.',
    licenseNote: 'Cite Reeracoen; do not republish proprietary tables.',
  },
  {
    name: 'PERSOLKELLY Vietnam Salary Guide',
    shortLabel: 'PERSOLKELLY',
    label: 'PERSOLKELLY Vietnam Salary Guide',
    detail: 'Salary guide theo function, ngành, cấp bậc và thị trường APAC/Vietnam.',
    href: 'https://www.persolkelly.com.vn/',
    tier: 'B',
    sourceYear: 2025,
    methodology: 'Recruitment consultant salary guide used for professional and specialist roles.',
    licenseNote: 'Cite PERSOLKELLY; verify current report page before public citation.',
  },
  {
    name: 'Michael Page Vietnam Salary Benchmark',
    shortLabel: 'Michael Page',
    label: 'Michael Page Vietnam Salary Benchmark',
    detail: 'Benchmark cho professional, specialist, manager và leadership roles.',
    href: 'https://www.michaelpage.com.vn/salary-guide',
    tier: 'B',
    sourceYear: 2026,
    methodology: 'Recruitment salary benchmark used for white-collar and management roles.',
    licenseNote: 'Cite Michael Page; do not copy proprietary benchmark tables.',
  },
  {
    name: 'Robert Walters Vietnam Salary Survey',
    shortLabel: 'Robert Walters',
    label: 'Robert Walters Vietnam Salary Survey',
    detail: 'Salary survey cho white-collar, specialist và leadership compensation.',
    href: 'https://www.robertwalters.com.vn/our-services/salary-survey.html',
    tier: 'B',
    sourceYear: 2026,
    methodology: 'Recruitment salary survey used for professional, finance, legal, sales, tech and leadership checks.',
    licenseNote: 'Cite Robert Walters; do not republish proprietary salary tables.',
  },
  {
    name: 'ILOSTAT and World Bank Labour Macrodata',
    shortLabel: 'ILO/World Bank',
    label: 'ILOSTAT / World Bank labour macrodata',
    detail: 'Bối cảnh vĩ mô để kiểm tra employment, wage trend và labour-market trend.',
    href: 'https://ilostat.ilo.org/data/',
    tier: 'C',
    sourceYear: 2026,
    methodology: 'Macro labour data used for context and sanity checks only, not direct salary percentile calculation.',
    licenseNote: 'Public/open data; cite ILOSTAT or World Bank where used.',
  },
];

export const RESULT_SOURCE_CHIP_LABELS = [
  ...TRUSTED_SALARY_SOURCES
    .filter(source => source.name !== 'Vietnam Minimum Wage Zones')
    .map(source => source.shortLabel),
];

export const CORE_SALARY_SOURCE_NAMES = TRUSTED_SALARY_SOURCES
  .filter(source => source.tier === 'A' || source.tier === 'B')
  .map(source => source.name);

export const CERTIFICATE_SOURCE_LINE = 'GSO · Adecco · ITviec · TopCV+';
