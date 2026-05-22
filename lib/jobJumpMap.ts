import { getCareerCompassContext } from '@/lib/careerCompassEngine';

export interface JobJumpRole {
  title: string;
  why: string;
  targetSalary: number;
  keywords: string[];
}

export interface JobJumpMap {
  headline: string;
  summary: string;
  targetRoles: JobJumpRole[];
  cvBullets: string[];
  interviewAnchor: string;
  internalRaiseAngle: string;
}

const roundToHalfMillion = (value: number) => Math.round(value / 500_000) * 500_000;

function detectSegment(jobTitle: string) {
  const normalized = jobTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/cong nhan|factory worker|machine operator|production operator|van hanh may|binh duong/.test(normalized)) {
    return 'factory';
  }
  if (/fresher|new graduate|sinh vien|moi tot nghiep|moi ra truong/.test(normalized)) {
    return 'fresh';
  }
  if (/developer|engineer|frontend|backend|fullstack|data|devops|qa|tester|it|software/.test(normalized)) {
    return 'it';
  }
  if (/marketing|content|seo|brand|growth|social/.test(normalized)) {
    return 'marketing';
  }
  if (/sales|kinh doanh|account executive|business development/.test(normalized)) {
    return 'sales';
  }
  if (/ke toan|finance|accountant|financial|ngan hang|bank/.test(normalized)) {
    return 'finance';
  }
  return 'general';
}

export function buildJobJumpMap(jobTitle: string, salary: number, percent: number): JobJumpMap {
  const compass = getCareerCompassContext(jobTitle, salary, percent);
  const segment = detectSegment(jobTitle);
  const targetBase = roundToHalfMillion(Math.max(compass.nextBandMin, salary * 1.18));
  const stretchBase = roundToHalfMillion(Math.max(targetBase * 1.15, salary * 1.3));

  if (segment === 'factory') {
    return {
      headline: 'Bản đồ nhảy bậc cho công nhân nhà máy',
      summary: 'Đừng chỉ xin tăng ca. Hướng tăng tiền tốt hơn là chứng minh năng suất, giảm lỗi, học thêm máy và bước lên tổ phó/tổ trưởng.',
      targetRoles: [
        {
          title: 'Công nhân vận hành máy FDI',
          why: 'Cùng công việc nhưng nhà máy FDI thường trả tốt hơn nếu có chuyên cần, an toàn lao động và biết vận hành máy ổn định.',
          targetSalary: targetBase,
          keywords: ['công nhân vận hành máy', 'machine operator', 'production operator', 'Bình Dương FDI'],
        },
        {
          title: 'QC / QA line cơ bản',
          why: 'Nếu bạn cẩn thận, ít lỗi và biết ghi nhận số liệu, QC là bước chuyển nhẹ nhưng tăng giá trị hơn lao động phổ thông.',
          targetSalary: roundToHalfMillion(targetBase * 1.08),
          keywords: ['QC line', 'QA factory', 'kiểm hàng', 'quality control Bình Dương'],
        },
        {
          title: 'Tổ phó / Tổ trưởng sản xuất',
          why: 'Đây là bước tăng lương rõ nhất: quản người, kiểm sản lượng, xử lý lỗi line và chịu trách nhiệm KPI.',
          targetSalary: stretchBase,
          keywords: ['tổ trưởng sản xuất', 'line leader', 'production leader', 'shift leader'],
        },
      ],
      cvBullets: [
        'Duy trì chuyên cần 98-100% trong 3 tháng liên tiếp, không vi phạm an toàn lao động.',
        'Theo dõi sản lượng theo ca và ghi lại số lượng lỗi/hoàn hàng trước-sau khi cải tiến thao tác.',
        'Hỗ trợ đào tạo người mới hoặc hỗ trợ line khác khi thiếu người, có xác nhận của tổ trưởng.',
      ],
      interviewAnchor: `Em đang nhắm mức ${targetBase.toLocaleString('vi-VN')}đ/tháng vì em có thể chứng minh chuyên cần, sản lượng ổn định và khả năng vận hành máy theo chuẩn an toàn.`,
      internalRaiseAngle: 'Xin review lương bằng 4 số: chuyên cần, sản lượng/ca, tỷ lệ lỗi, số lần hỗ trợ line hoặc đào tạo người mới.',
    };
  }

  if (segment === 'fresh') {
    return {
      headline: 'Bản đồ offer đầu đời cho sinh viên mới tốt nghiệp',
      summary: 'Mục tiêu không phải apply thật nhiều. Mục tiêu là biến 2-3 project/đồ án/thực tập thành bằng chứng để thoát offer thấp.',
      targetRoles: [
        {
          title: 'Junior đúng chuyên ngành',
          why: 'Đây là hướng ít rủi ro nhất: lấy offer đầu tiên, học nhanh trong 60-90 ngày rồi xin review lương.',
          targetSalary: targetBase,
          keywords: ['junior', 'fresher', 'graduate trainee', jobTitle],
        },
        {
          title: 'Assistant / Coordinator có KPI',
          why: 'Role vận hành, marketing, sales admin, HR coordinator dễ vào hơn nhưng phải chọn nơi có KPI rõ để tăng lương.',
          targetSalary: roundToHalfMillion(targetBase * 0.95),
          keywords: ['assistant', 'coordinator', 'admin executive', 'trainee'],
        },
        {
          title: 'Intern lên full-time nhanh',
          why: 'Nếu chưa có offer tốt, chọn internship có cơ hội chuyển chính thức và dùng 30 ngày đầu để lấy bằng chứng hiệu suất.',
          targetSalary: roundToHalfMillion(targetBase * 0.8),
          keywords: ['paid intern', 'thực tập sinh có lương', 'full-time conversion'],
        },
      ],
      cvBullets: [
        'Biến đồ án/project thành bullet có số: người dùng, doanh thu giả lập, thời gian xử lý, điểm số hoặc kết quả đo được.',
        'Viết 1 case study ngắn: vấn đề, việc bạn làm, kết quả, bài học, link/ảnh chứng minh.',
        'Chuẩn bị script xin review sau thử việc: mục tiêu 60 ngày, KPI đã đạt, mức lương mong muốn.',
      ],
      interviewAnchor: `Em kỳ vọng khoảng ${targetBase.toLocaleString('vi-VN')}đ/tháng nếu scope công việc có KPI rõ và có review sau thử việc.`,
      internalRaiseAngle: 'Ngay ngày đầu hãy hỏi tiêu chí để qua thử việc và điều kiện review lương sau 60-90 ngày.',
    };
  }

  const targetRolesBySegment: Record<string, JobJumpRole[]> = {
    it: [
      {
        title: `${compass.band === 'entry' ? 'Mid-level' : 'Senior'} ${jobTitle}`,
        why: 'Tăng lương nhanh nhất khi chứng minh được ownership: tự thiết kế, ship, monitor và sửa lỗi production.',
        targetSalary: targetBase,
        keywords: [jobTitle, 'system design', 'cloud', 'remote', 'product company'],
      },
      {
        title: 'Product / Platform team',
        why: 'Team sản phẩm trả cao hơn outsourcing khi bạn biết nói bằng impact, retention, cost saving hoặc reliability.',
        targetSalary: stretchBase,
        keywords: ['product company', 'platform engineer', 'SaaS', 'fintech', 'AI product'],
      },
      {
        title: 'Remote / English-facing role',
        why: 'Nếu tiếng Anh ổn, đây là cú nhảy bậc lương mạnh nhất mà không cần đổi ngành.',
        targetSalary: roundToHalfMillion(stretchBase * 1.25),
        keywords: ['remote', 'English', 'APAC', 'Singapore', 'contractor'],
      },
    ],
    marketing: [
      {
        title: 'Performance / Growth Marketing',
        why: 'Thị trường trả cao hơn cho người kéo được lead/revenue, không chỉ làm content hoặc social.',
        targetSalary: targetBase,
        keywords: ['growth marketing', 'performance marketing', 'paid ads', 'CRM'],
      },
      {
        title: 'Brand + Revenue owner',
        why: 'Nếu biết nối brand với doanh số, bạn thoát khỏi nhóm marketing làm task.',
        targetSalary: stretchBase,
        keywords: ['brand manager', 'campaign lead', 'go-to-market', 'product marketing'],
      },
      {
        title: 'Marketing lead tại SME tăng trưởng',
        why: 'SME cần người tự chạy hệ thống marketing, dễ deal theo KPI nếu bạn có case rõ.',
        targetSalary: roundToHalfMillion(stretchBase * 1.1),
        keywords: ['marketing lead', 'head of marketing', 'growth lead'],
      },
    ],
    sales: [
      {
        title: 'B2B Sales / Account Executive',
        why: 'Sales B2B có commission và deal size rõ, dễ tăng thu nhập nếu bạn biết quản pipeline.',
        targetSalary: targetBase,
        keywords: ['B2B sales', 'account executive', 'business development', 'SaaS sales'],
      },
      {
        title: 'Key Account / Enterprise Sales',
        why: 'Làm với khách lớn giúp tăng base salary, bonus và cơ hội lên quản lý.',
        targetSalary: stretchBase,
        keywords: ['key account', 'enterprise sales', 'corporate sales'],
      },
      {
        title: 'Sales Manager',
        why: 'Khi có bằng chứng doanh số và đào tạo được người khác, bạn có quyền deal lương quản lý.',
        targetSalary: roundToHalfMillion(stretchBase * 1.15),
        keywords: ['sales manager', 'team lead sales', 'regional sales'],
      },
    ],
    finance: [
      {
        title: 'FP&A / Finance Analyst',
        why: 'Vai trò phân tích tài chính trả tốt hơn nhóm nhập liệu/kế toán thuần nếu bạn biết Excel/BI/modeling.',
        targetSalary: targetBase,
        keywords: ['FP&A', 'financial analyst', 'Power BI', 'financial modeling'],
      },
      {
        title: 'Senior Accountant / Controller track',
        why: 'Muốn tăng lương trong finance phải đi từ đúng số liệu sang kiểm soát và ra quyết định.',
        targetSalary: stretchBase,
        keywords: ['senior accountant', 'controller', 'chief accountant', 'tax'],
      },
      {
        title: 'Fintech / MNC finance role',
        why: 'Fintech/MNC trả premium cho tiếng Anh, hệ thống, reporting và compliance.',
        targetSalary: roundToHalfMillion(stretchBase * 1.12),
        keywords: ['fintech finance', 'MNC finance', 'ACCA', 'CFA'],
      },
    ],
    general: [
      {
        title: `${jobTitle} tại công ty trả theo KPI`,
        why: 'Cùng một nghề nhưng nơi có KPI rõ thường dễ chứng minh giá trị và deal tăng lương hơn.',
        targetSalary: targetBase,
        keywords: [jobTitle, 'KPI', 'senior', 'executive'],
      },
      {
        title: `${jobTitle} tại FDI / MNC`,
        why: 'FDI/MNC thường có band lương rõ, phúc lợi tốt và review định kỳ.',
        targetSalary: stretchBase,
        keywords: [jobTitle, 'FDI', 'MNC', 'English'],
      },
      {
        title: `Lead / Senior ${jobTitle}`,
        why: 'Nếu đã có kết quả đo được, lên senior/lead là con đường tăng lương trực diện nhất.',
        targetSalary: roundToHalfMillion(stretchBase * 1.1),
        keywords: [`senior ${jobTitle}`, `lead ${jobTitle}`, 'team lead'],
      },
    ],
  };

  const roles = targetRolesBySegment[segment] ?? targetRolesBySegment.general;

  return {
    headline: 'Job Jump Map: hướng nhảy việc/xin tăng lương nhanh nhất',
    summary: `Mục tiêu là đi từ Top ${percent}% hiện tại lên band kế tiếp bằng bằng chứng thị trường, keyword apply đúng và câu anchor lương rõ ràng.`,
    targetRoles: roles,
    cvBullets: [
      `Chuyển mô tả công việc hiện tại thành 1 bullet có số: trước/sau, doanh thu, chi phí, thời gian, lỗi giảm hoặc năng suất tăng.`,
      `Gắn 1 case cụ thể với kỹ năng tạo khoảng cách lương: ${compass.topSkillGap}`,
      `Viết lại CV theo role mục tiêu: mỗi bullet phải chứng minh bạn đã làm được việc của band cao hơn.`,
    ],
    interviewAnchor: `Với benchmark thị trường và scope em có thể đảm nhận, em kỳ vọng khoảng ${targetBase.toLocaleString('vi-VN')}đ/tháng. Nếu role có ownership lớn hơn, em muốn trao đổi dải ${targetBase.toLocaleString('vi-VN')}đ - ${stretchBase.toLocaleString('vi-VN')}đ.`,
    internalRaiseAngle: `Dùng 30 ngày tới để tạo evidence log cho milestone: ${compass.nextMilestone}`,
  };
}
