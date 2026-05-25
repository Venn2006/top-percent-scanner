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

function normalizeJob(jobTitle: string) {
  return jobTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function detectSegment(jobTitle: string) {
  const normalized = normalizeJob(jobTitle);

  if (/mc\b|nguoi dan|dan chuong trinh|host|su kien|event host|livestream host|presenter|moderator|wedding mc/.test(normalized)) {
    return 'events';
  }
  if (/dau bep|chef|bep truong|bep pho|sous chef|cook|nha hang|restaurant|f&b|fnb|kitchen/.test(normalized)) {
    return 'fnb';
  }
  if (/trung tam ngoai ngu|english center|language center|giao vien|teacher|giang day|dao tao|l&d|learning|tesol/.test(normalized)) {
    return 'education';
  }
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
  if (/sales|kinh doanh|account executive|business development|tu van|ban hang/.test(normalized)) {
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

  if (segment === 'fnb') {
    return {
      headline: 'Hướng tăng lương cho bếp: từ làm món sang chứng minh hiệu quả vận hành',
      summary: 'Đầu bếp không tăng giá trị bằng nói “em nấu tốt”. Tăng giá trị bằng food cost, waste rate, tốc độ ra món, rating khách và khả năng giữ chuẩn món khi đông khách.',
      targetRoles: [
        {
          title: 'Đầu bếp tại chuỗi nhà hàng có KPI vận hành',
          why: 'Chuỗi nhà hàng/bếp trung tâm thường có số đo rõ: food cost, waste, tốc độ ra món, rating khách. Có số thì dễ chứng minh giá trị hơn bếp nhỏ trả theo cảm tính.',
          targetSalary: targetBase,
          keywords: ['Chef', 'Chuỗi nhà hàng', 'Food cost', 'Kitchen KPI'],
        },
        {
          title: 'Sous Chef / Ca trưởng bếp',
          why: 'Nếu bạn giữ được chất lượng món, training phụ bếp và kiểm soát ca đông khách, đây là bước lên lương tự nhiên nhất trong nghề bếp.',
          targetSalary: stretchBase,
          keywords: ['Sous Chef', 'Ca trưởng bếp', 'Training bếp', 'Kiểm soát ca'],
        },
        {
          title: 'Bếp khách sạn / catering / bếp trung tâm',
          why: 'Những nơi này trả cao hơn khi bạn có kỷ luật vận hành, an toàn vệ sinh, chuẩn cost định lượng và khả năng phục vụ volume lớn.',
          targetSalary: roundToHalfMillion(stretchBase * 1.1),
          keywords: ['Khách sạn', 'Catering', 'Bếp trung tâm', 'HACCP'],
        },
      ],
      cvBullets: [
        'Ghi rõ số liệu bếp: food cost %, waste rate, số suất/ca, thời gian ra món, rating khách hoặc số lỗi món giảm.',
        'Đóng gói 3 món/signature item thành recipe card có định lượng, cost, quy trình ra món và tiêu chuẩn plating.',
        'Chứng minh đã training phụ bếp/ca mới hoặc giữ chất lượng món ổn định trong giờ cao điểm.',
      ],
      interviewAnchor: `Em đang nhắm mức ${targetBase.toLocaleString('vi-VN')}đ/tháng vì em có thể chứng minh bằng food cost, waste rate, tốc độ ra món và chất lượng món ổn định theo ca.`,
      internalRaiseAngle: 'Xin review bằng 5 số nghề bếp: food cost, waste rate, tốc độ ra món, rating/complaint, số người trong bếp bạn training được.',
    };
  }

  if (segment === 'events') {
    return {
      headline: 'Hướng tăng fee cho MC: từ “dẫn ổn” sang hồ sơ sân khấu có bằng chứng',
      summary: 'MC tăng giá bằng showreel, feedback khách/agency, khả năng xử lý live, rate card rõ và portfolio theo format sự kiện.',
      targetRoles: [
        {
          title: 'MC sự kiện corporate / activation',
          why: 'Khách doanh nghiệp trả tốt hơn khi bạn có showreel, hiểu brief, giữ timeline và xử lý sân khấu mượt.',
          targetSalary: targetBase,
          keywords: ['MC corporate', 'Activation', 'Showreel', 'Briefing'],
        },
        {
          title: 'Host livestream / talkshow / brand event',
          why: 'Format này cần nhịp dẫn, tương tác khách mời, giữ năng lượng và tạo chuyển đổi rõ hơn MC phổ thông.',
          targetSalary: stretchBase,
          keywords: ['Livestream host', 'Talkshow', 'Brand event', 'Rate card'],
        },
        {
          title: 'MC premium có gói script + rehearsal',
          why: 'Khi bạn bán thêm chuẩn bị kịch bản, rehearsal và phương án xử lý sự cố, giá trị không còn chỉ tính theo giờ lên sân khấu.',
          targetSalary: roundToHalfMillion(stretchBase * 1.1),
          keywords: ['Script', 'Rehearsal', 'Feedback khách', 'Booking lead'],
        },
      ],
      cvBullets: [
        'Tạo showreel 60-90 giây có mở màn, chuyển đoạn, tương tác khán giả và xử lý tình huống.',
        'Lưu feedback khách/agency, số show đã dẫn, format sự kiện và mức phí trung bình/show.',
        'Làm rate card 3 tầng: event nhỏ, corporate/wedding premium, livestream/activation.',
      ],
      interviewAnchor: `Em đề xuất mức ${targetBase.toLocaleString('vi-VN')}đ/tháng hoặc fee tương đương vì em có showreel, feedback khách và quy trình briefing/rehearsal rõ trước khi lên sân khấu.`,
      internalRaiseAngle: 'Tăng giá bằng showreel, feedback, rate card và case xử lý sân khấu; không nói chung chung “em dẫn tốt”.',
    };
  }

  if (segment === 'education') {
    return {
      headline: 'Hướng tăng lương ngành giáo dục: biến đứng lớp/vận hành thành số tuyển sinh và retention',
      summary: 'Ngành giáo dục trả thêm khi bạn chứng minh được học viên vào lớp, học viên ở lại, lớp lấp đầy, complaint giảm và giáo viên vận hành ổn.',
      targetRoles: [
        {
          title: 'Academic Operations / Center Manager',
          why: 'Vai trò này trả cao hơn khi bạn có dashboard học viên active, trial-to-paid, retention, class fill rate và complaint SLA.',
          targetSalary: targetBase,
          keywords: ['Center Manager', 'Retention', 'Trial-to-paid', 'Class fill rate'],
        },
        {
          title: 'Training Lead / Curriculum Coordinator',
          why: 'Nếu có nền tảng học thuật, hãy biến nó thành chuẩn đào tạo giáo viên, curriculum và kết quả học viên đo được.',
          targetSalary: stretchBase,
          keywords: ['Training Lead', 'Curriculum', 'Teacher training', 'Learning outcome'],
        },
        {
          title: 'Growth Manager giáo dục',
          why: 'Kết hợp vận hành + tuyển sinh + giữ chân học viên là hướng tăng lương mạnh hơn làm tác vụ rời rạc.',
          targetSalary: roundToHalfMillion(stretchBase * 1.1),
          keywords: ['Education growth', 'Enrollment', 'Renewal', 'Revenue per class'],
        },
      ],
      cvBullets: [
        'Đưa số học viên active, retention/churn, trial-to-paid, class fill rate và complaint SLA vào hồ sơ.',
        'Viết 1 case tăng enrollment/retention hoặc giảm complaint bằng quy trình cụ thể.',
        'Chứng minh đã chuẩn hóa giáo viên/lịch lớp/curriculum, không chỉ “quản lý trung tâm”.',
      ],
      interviewAnchor: `Em kỳ vọng khoảng ${targetBase.toLocaleString('vi-VN')}đ/tháng vì em có thể chứng minh bằng enrollment, retention, trial-to-paid, class fill rate và complaint SLA.`,
      internalRaiseAngle: 'Xin review bằng dashboard tuần: tuyển sinh, giữ chân học viên, lấp lớp, tận dụng giáo viên và complaint SLA.',
    };
  }

  if (segment === 'factory') {
    return {
      headline: 'Bản đồ nhảy bậc cho công nhân nhà máy',
      summary: 'Đừng chỉ xin tăng ca. Hướng tăng tiền tốt hơn là chứng minh năng suất, giảm lỗi, học thêm máy và bước lên tổ phó/tổ trưởng.',
      targetRoles: [
        {
          title: 'Công nhân vận hành máy FDI',
          why: 'Nhà máy FDI thường trả tốt hơn nếu có chuyên cần, an toàn lao động và biết vận hành máy ổn định.',
          targetSalary: targetBase,
          keywords: ['vận hành máy', 'machine operator', 'production operator', 'FDI'],
        },
        {
          title: 'QC / QA line cơ bản',
          why: 'Nếu bạn cẩn thận, ít lỗi và biết ghi nhận số liệu, QC là bước chuyển nhẹ nhưng tăng giá trị hơn lao động phổ thông.',
          targetSalary: roundToHalfMillion(targetBase * 1.08),
          keywords: ['QC line', 'QA factory', 'kiểm hàng', 'quality control'],
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
        'Theo dõi sản lượng theo ca và ghi lại số lỗi trước/sau khi cải tiến thao tác.',
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
        keywords: ['product company', 'platform engineer', 'SaaS', 'fintech', 'automation product'],
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
        why: 'Nếu biết nối brand với doanh số, bạn thoát khỏi nhóm marketing chỉ làm việc lẻ.',
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
        title: `${jobTitle} tại đơn vị có KPI và lộ trình review rõ`,
        why: 'Cùng một nghề nhưng nơi có chỉ số đo được, scope rõ và lịch review lương minh bạch thường dễ chứng minh giá trị hơn nơi trả theo cảm tính.',
        targetSalary: targetBase,
        keywords: [jobTitle, 'KPI nghề', 'review lương', 'bằng chứng'],
      },
      {
        title: `${jobTitle} ở môi trường trả premium hơn`,
        why: 'Môi trường lớn hơn, khách hàng khó hơn hoặc tiêu chuẩn vận hành cao hơn thường trả thêm nếu bạn chứng minh được output.',
        targetSalary: stretchBase,
        keywords: [jobTitle, 'premium segment', 'senior', 'specialist'],
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
    headline: 'Hướng nhảy việc hoặc xin tăng lương nhanh nhất',
    summary: `Mục tiêu là đi từ Top ${percent}% hiện tại lên mốc lương kế tiếp bằng bằng chứng thị trường, từ khóa tìm việc đúng và câu nói lương rõ ràng.`,
    targetRoles: roles,
    cvBullets: [
      'Chuyển mô tả công việc hiện tại thành 1 bullet có số: trước/sau, doanh thu, chi phí, thời gian, lỗi giảm hoặc năng suất tăng.',
      `Gắn 1 case cụ thể với kỹ năng tạo khoảng cách lương: ${compass.topSkillGap}`,
      'Viết lại CV theo role mục tiêu: mỗi bullet phải chứng minh bạn đã làm được việc của band cao hơn.',
    ],
    interviewAnchor: `Với benchmark thị trường và scope em có thể đảm nhận, em kỳ vọng khoảng ${targetBase.toLocaleString('vi-VN')}đ/tháng. Nếu role có ownership lớn hơn, em muốn trao đổi dải ${targetBase.toLocaleString('vi-VN')}đ - ${stretchBase.toLocaleString('vi-VN')}đ.`,
    internalRaiseAngle: `Dùng 30 ngày tới để tạo evidence log cho milestone: ${compass.nextMilestone}`,
  };
}
