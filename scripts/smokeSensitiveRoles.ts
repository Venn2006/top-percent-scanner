import { buildSafePremiumInsight, isDirtyPremiumInsightForJob } from '../lib/reportPremiumInsight';
import { getExactRoleProfile } from '../lib/roleProfiles';
import { normalizeRoleText } from '../lib/roleTaxonomy';

type SensitiveRoleCase = {
  title: string;
  industry?: string;
  required: string[];
  forbidden: string[];
};

const cases: SensitiveRoleCase[] = [
  {
    title: 'Nhân viên spa khách sạn',
    industry: 'Làm đẹp - Spa',
    required: ['massage', 'tri lieu', 'cham soc da', 'lieu trinh spa', 'phong tri lieu'],
    forbidden: ['don phong', 'housekeeping', 'buong phong', 'trai ga', 'giat la'],
  },
  {
    title: 'Chuyên viên nail',
    industry: 'Làm đẹp - Spa',
    required: ['gel', 've mong', 'acrylic', 'mong tay', 'khu trung dung cu'],
    forbidden: ['facial', 'body treatment', 'deep tissue', 'hot stone', 'phong tri lieu', 'spa therapist'],
  },
  {
    title: 'Barista (Pha chế cà phê)',
    industry: 'Nhà hàng - Khách sạn - Du lịch',
    required: ['barista', 'ca phe', 'espresso', 'latte art', 'may pha', 'quay bar'],
    forbidden: ['bep truong', 'sous chef', 'kitchen manager', 'food cost', 'mise en place'],
  },
  {
    title: 'Bartender',
    industry: 'Nhà hàng - Khách sạn - Du lịch',
    required: ['bartender', 'cocktail', 'mocktail', 'do uong', 'garnish', 'quay bar'],
    forbidden: ['bep truong', 'sous chef', 'kitchen manager', 'bep nong', 'line cook'],
  },
  {
    title: 'Đầu bếp (Chef)',
    industry: 'Nhà hàng - Khách sạn - Du lịch',
    required: ['so che', 'bep', 'mon an', 've sinh an toan thuc pham'],
    forbidden: ['phuc vu ban', 'check in', 'le tan', 'buong phong'],
  },
  {
    title: 'Nhân viên phục vụ bàn (Waiter/Waitress)',
    industry: 'Nhà hàng - Khách sạn - Du lịch',
    required: ['phuc vu', 'order', 'khach hang', 'ban an'],
    forbidden: ['bep truong', 'recipe card', 'line cook', 'bep nong'],
  },
  {
    title: 'Quản lý khách sạn',
    industry: 'Nhà hàng - Khách sạn - Du lịch',
    required: ['dat phong', 'cong suat buong', 'ota', 'nhan su', 'khieu nai'],
    forbidden: ['don phong ca nhan', 'trai ga', 'lau nha', 'giat la'],
  },
  {
    title: 'Lễ tân khách sạn',
    industry: 'Nhà hàng - Khách sạn - Du lịch',
    required: ['nhan phong', 'tra phong', 'dat phong', 'khach san'],
    forbidden: ['p&l', 'revpar ownership', 'bep truong', 'food cost'],
  },
  {
    title: 'Quản lý trung tâm ngoại ngữ',
    industry: 'Giáo dục',
    required: ['tuyen sinh', 'hoc vien', 'giao vien', 'phu huynh', 'lich hoc'],
    forbidden: ['chi giang day', 'cham bai', 'giao an ca nhan', 'so cuu y te'],
  },
  {
    title: 'Giáo viên tiếng Anh',
    industry: 'Giáo dục',
    required: ['giao an', 'hoc sinh', 'cham bai', 'tieng anh'],
    forbidden: ['van hanh trung tam', 'doanh thu trung tam', 'class fill rate', 'teacher utilization'],
  },
  {
    title: 'Chuyên viên C&B (Lương thưởng & Phúc lợi)',
    industry: 'Nhân sự',
    required: ['luong', 'phuc loi', 'bhxh', 'thue tncn', 'payroll'],
    forbidden: ['sourcing', 'phong van', 'time to hire', 'candidate pipeline'],
  },
  {
    title: 'Chuyên viên tuyển dụng',
    industry: 'Nhân sự',
    required: ['tuyen dung', 'ung vien', 'phong van', 'jd'],
    forbidden: ['tinh luong', 'thue tncn', 'bhxh hang thang', 'payroll'],
  },
  {
    title: 'Kỹ thuật viên điện lạnh',
    industry: 'Kỹ thuật - Thợ lành nghề',
    required: ['dien lanh', 'may lanh', 'gas', 'dan nong', 'dan lanh'],
    forbidden: ['nha khoa', 'benh nhan', 'treatment plan', 'rang ham mat'],
  },
  {
    title: 'Thợ điện công nghiệp',
    industry: 'Kỹ thuật - Thợ lành nghề',
    required: ['tu dien', 'motor', 'dau noi', 'bao tri', 'dien'],
    forbidden: ['gas lanh', 'may lanh dan dung', 'nha khoa', 'benh nhan'],
  },
  {
    title: 'Nhân viên y tế trường học',
    industry: 'Y tế - Chăm sóc sức khỏe',
    required: ['so cuu', 'hoc sinh', 'ho so suc khoe', 'thuoc', 'phu huynh'],
    forbidden: ['giao an', 'cham bai', 'ielts', 'tuyen sinh'],
  },
  {
    title: 'Kỹ thuật viên vật lý trị liệu',
    industry: 'Y tế - Chăm sóc sức khỏe',
    required: ['vat ly tri lieu', 'phuc hoi chuc nang', 'bai tap', 'theo doi tien trien'],
    forbidden: ['giao an', 'tuyen sinh', 'payroll', 'bhxh'],
  },
  {
    title: 'Nha sĩ',
    industry: 'Y tế - Chăm sóc sức khỏe',
    required: ['nha khoa', 'chan doan', 'rang mieng', 'x quang'],
    forbidden: ['sourcing', 'ung vien', 'recruitment funnel', 'payroll'],
  },
  {
    title: 'Brand Designer',
    industry: 'Marketing - Truyền thông',
    required: ['brand', 'designer', 'key visual', 'guideline', 'layout'],
    forbidden: ['media buying', 'campaign p&l', 'brand health ownership', 'sales quota'],
  },
  {
    title: 'Brand Manager',
    industry: 'Marketing - Truyền thông',
    required: ['brand', 'dinh vi thuong hieu', 'chien dich', 'ngan sach', 'nghien cuu thi truong'],
    forbidden: ['chi thiet ke key visual', 'figma la trong tam', 'layout thuần'],
  },
];

function hasTerm(text: string, term: string) {
  return normalizeRoleText(text).includes(normalizeRoleText(term));
}

function roleText(input: SensitiveRoleCase) {
  const profile = getExactRoleProfile(input.title, input.industry);
  const premiumInsight = buildSafePremiumInsight(input.title, 12_000_000, 50, 'Top 20%', 16_000_000, input.industry);
  return {
    profile,
    text: [
      profile?.title,
      profile?.industry,
      ...(profile?.skills || []),
      profile?.preview?.coreSkill,
      profile?.preview?.path,
      profile?.preview?.firstAction,
      profile?.preview?.cvBullet,
      profile?.language?.rolePath,
      profile?.language?.mainSkill,
      profile?.language?.proofAsset,
      profile?.language?.opportunityList,
      premiumInsight,
    ].filter(Boolean).join('\n'),
    premiumInsight,
  };
}

const failures = [] as Array<{
  title: string;
  reason: string;
  missingRequired?: string[];
  forbiddenHits?: string[];
}>;

for (const item of cases) {
  const { profile, text, premiumInsight } = roleText(item);
  if (!profile) {
    failures.push({ title: item.title, reason: 'missing_profile' });
    continue;
  }

  const requiredHits = item.required.filter(term => hasTerm(text, term));
  const forbiddenHits = item.forbidden.filter(term => hasTerm(text, term));
  const dirtyPremium = isDirtyPremiumInsightForJob(premiumInsight, item.title, item.industry);
  const minRequired = Math.min(3, item.required.length);
  if (requiredHits.length < minRequired) {
    failures.push({
      title: item.title,
      reason: 'missing_required_terms',
      missingRequired: item.required.filter(term => !requiredHits.includes(term)),
    });
  }
  if (forbiddenHits.length) {
    failures.push({ title: item.title, reason: 'forbidden_terms', forbiddenHits });
  }
  if (dirtyPremium) {
    failures.push({ title: item.title, reason: 'dirty_premium_insight' });
  }
}

const summary = {
  checked: cases.length,
  passed: cases.length - new Set(failures.map(f => f.title)).size,
  failedRoles: new Set(failures.map(f => f.title)).size,
  failures,
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exit(1);
