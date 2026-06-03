const DISPLAY_REPAIRS: Array<[RegExp, string]> = [
  [/\bBan do tang gia tri\b/g, 'Bản đồ tăng giá trị'],
  [/\bBan do tang luong\b/g, 'Bản đồ tăng lương'],
  [/\bbang chung\b/g, 'bằng chứng'],
  [/\bBang chung\b/g, 'Bằng chứng'],
  [/\bChung minh\b/g, 'Chứng minh'],
  [/\bchung minh\b/g, 'chứng minh'],
  [/\bco KPI\b/g, 'có KPI'],
  [/\bKPI can bam\b/g, 'KPI cần bám'],
  [/\bEm nham muc\b/g, 'Em nhắm mức'],
  [/\bem co the\b/g, 'em có thể'],
  [/\btro len\b/g, 'trở lên'],
  [/\bd\/thang\b/g, 'đ/tháng'],
  [/\btu kham\b/g, 'từ khám'],
  [/\btu xu ly\b/g, 'từ xử lý'],
  [/\btu van\b/g, 'tư vấn'],
  [/\btu minh\b/g, 'tự mình'],
  [/\btu thao tac\b/g, 'từ thao tác'],
  [/\btoi uu\b/g, 'tối ưu'],
  [/\bnhay viec\b/g, 'nhảy việc'],
  [/\bphong van\b/g, 'phỏng vấn'],
  [/\bky nang\b/g, 'kỹ năng'],
  [/\bnang luc\b/g, 'năng lực'],
  [/\bnang cao\b/g, 'nâng cao'],
  [/\bphuc vu\b/g, 'phục vụ'],
  [/\bthu ngan\b/g, 'thu ngân'],
  [/\bkhach san\b/g, 'khách sạn'],
  [/\bKhach san\b/g, 'Khách sạn'],
  [/\bkhach\b/g, 'khách'],
  [/\bluong\b/g, 'lương'],
  [/\bho chieu\b/g, 'hộ chiếu'],
  [/\bhanh ly\b/g, 'hành lý'],
  [/\bquay check-in\b/g, 'quầy check-in'],
  [/\bcan gate\b/g, 'cần gate'],
  [/\bcan supervisor\b/g, 'cần supervisor'],
];

export function repairReportDisplayText(value: string) {
  return DISPLAY_REPAIRS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

export function repairReportDisplayTextDeep<T>(value: T): T {
  if (typeof value === 'string') return repairReportDisplayText(value) as T;
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => repairReportDisplayTextDeep(item)) as T;

  const repaired: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    repaired[key] = repairReportDisplayTextDeep(item);
  }
  return repaired as T;
}
