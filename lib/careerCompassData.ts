export type SalaryBand = 'entry' | 'mid' | 'senior' | 'lead' | 'executive'

export interface BandRange {
  min: number
  max: number
  label: string
}

export interface CareerLadderStep {
  band: SalaryBand
  title: string          // Tên giai đoạn: "Junior Developer"
  salary: string         // "8–15 triệu"
  duration: string       // "12–18 tháng"
  unlock: string[]       // 3 việc cần làm để lên giai đoạn này
  warning?: string       // Bẫy phổ biến ở giai đoạn này
}

export interface CareerCompassEntry {
  jobGroup: string
  keywords: string[]
  salaryBands: Record<SalaryBand, BandRange>
  painPoints: Record<SalaryBand, string>
  opportunities: Record<SalaryBand, string>
  nextMilestone: Record<SalaryBand, string>
  marketInsight: string
  topSkillGap: string
  negotiationScript?: Record<SalaryBand, { interview: string; raise: string }>
  careerLadder: CareerLadderStep[]  // Lộ trình từng giai đoạn
}

export const CAREER_COMPASS: Record<string, CareerCompassEntry> = {

  // ── 1. CÔNG NGHỆ THÔNG TIN ──────────────────────────────────────────────
  IT: {
    jobGroup: 'Công nghệ thông tin',
    keywords: [
      'developer', 'kỹ sư', 'lập trình', 'software', 'it ', ' it', 'backend',
      'frontend', 'fullstack', 'full-stack', 'devops', 'data engineer',
      'data scientist', 'machine learning', 'ai engineer', 'ml engineer',
      'mobile', 'android', 'ios', 'react', 'nodejs', 'python', 'java',
      'cloud', 'sre', 'platform engineer', 'qa engineer', 'tester',
      'cto', 'vp engineering', 'tech lead', 'engineering manager',
    ],
    salaryBands: {
      entry:     { min:  8_000_000, max: 15_000_000, label: 'Junior / Fresher IT (8–15 triệu)' },
      mid:       { min: 15_000_000, max: 25_000_000, label: 'Mid-level Developer (15–25 triệu)' },
      senior:    { min: 25_000_000, max: 40_000_000, label: 'Senior Engineer (25–40 triệu)' },
      lead:      { min: 40_000_000, max: 70_000_000, label: 'Tech Lead / Engineering Manager (40–70 triệu)' },
      executive: { min: 70_000_000, max: 150_000_000, label: 'CTO / VP Engineering (70–150 triệu+)' },
    },
    painPoints: {
      entry:     'Cạnh tranh cực cao với hàng nghìn fresher mỗi năm — lương thấp nhưng áp lực học liên tục, dễ bị stuck ở mức 10–12 triệu nếu không có định hướng rõ ràng.',
      mid:       'Bẫy comfort zone 20 triệu — đủ sống nhưng không đủ để tích lũy tài sản. Nhiều mid-dev bị kẹt 3–5 năm ở band này vì thiếu kỹ năng system design và leadership.',
      senior:    'Ceiling 35–40 triệu nếu không chuyển sang management hoặc startup equity. Thị trường remote quốc tế trả gấp 3–5x nhưng đòi hỏi tiếng Anh C1+ và portfolio quốc tế.',
      lead:      'Áp lực giữ team + deliver + 1-on-1 trong khi thị trường remote USD trả gấp 3–5x. Nhiều Tech Lead giỏi đang bị undercompensated nghiêm trọng so với giá trị thực.',
      executive: 'Equity Việt Nam quá thấp so với Singapore/remote USD — nhiều CTO giỏi đang chảy máu chất xám ra nước ngoài. Mức 70–100 triệu ở VN tương đương $3,000–4,000 USD, trong khi remote CTO role trả $15,000–25,000/tháng.',
    },
    opportunities: {
      entry:     'Thị trường IT VN thiếu 500,000 nhân lực đến 2025. Fresher có portfolio thực chiến + tiếng Anh tốt có thể nhảy lên mid trong 12–18 tháng.',
      mid:       'Chuyển sang system design + mentoring để unlock senior band. Hoặc target remote job USD — tăng thu nhập 3–5x mà không cần đổi ngành.',
      senior:    'Hai con đường: (1) IC track — Staff/Principal Engineer 50–80 triệu; (2) Management track — EM/Director 60–100 triệu. Cả hai đều cần leadership skill.',
      lead:      'Startup equity + remote USD là game changer. Một Tech Lead ở startup Series A có thể nhận equity trị giá 500 triệu–2 tỷ sau 3–4 năm.',
      executive: 'Fractional CTO cho 2–3 startup đồng thời — mô hình đang bùng nổ ở VN. Thu nhập 150–300 triệu/tháng với lịch làm việc linh hoạt hơn.',
    },
    nextMilestone: {
      entry:     'Hoàn thành 1 side project có user thực → đưa lên GitHub → apply mid-level trong 6 tháng.',
      mid:       'Lead 1 feature end-to-end, viết technical doc, mentor 1 junior → đủ điều kiện apply senior trong 12 tháng.',
      senior:    'Dẫn dắt 1 technical decision ảnh hưởng toàn team, present architecture review → target lead band.',
      lead:      'Xây dựng engineering culture, hiring process, OKR cho team → chuẩn bị cho Director/VP role.',
      executive: 'Xây dựng board-level tech strategy, M&A due diligence, hoặc pivot sang fractional/advisory để tối đa hóa thu nhập.',
    },
    marketInsight: 'Thị trường IT Việt Nam tăng trưởng 15–20%/năm, thiếu hụt 500,000 nhân lực đến 2025. Senior+ có thể negotiate lương tăng 30–50% khi nhảy việc.',
    topSkillGap: 'System Design + Cloud Architecture (AWS/GCP) + tiếng Anh kỹ thuật — 3 kỹ năng này tạo ra khoảng cách lương lớn nhất trong ngành IT Việt Nam.',
    careerLadder: [
      {
        band: 'entry',
        title: 'Junior / Fresher Developer',
        salary: '8–15 triệu',
        duration: '12–18 tháng',
        unlock: [
          'Hoàn thành 1 side project có user thực, đẩy lên GitHub với README rõ ràng',
          'Đạt TOEIC 600+ hoặc giao tiếp kỹ thuật cơ bản bằng tiếng Anh',
          'Nắm vững 1 framework chính (React/Spring/Django) ở mức production-ready',
        ],
        warning: 'Bẫy: Học quá nhiều ngôn ngữ, không sâu cái nào. Chọn 1 stack, đi sâu đến khi có thể ship feature thật.',
      },
      {
        band: 'mid',
        title: 'Mid-level Developer',
        salary: '15–25 triệu',
        duration: '2–3 năm',
        unlock: [
          'Lead 1 feature end-to-end: design → code → test → deploy → monitor',
          'Viết technical documentation đủ để người khác đọc và maintain',
          'Mentor được ít nhất 1 junior — giải thích được "tại sao" không chỉ "làm thế nào"',
        ],
        warning: 'Bẫy: Comfort zone 20 triệu. Đủ sống nhưng không đủ tích lũy. Nếu không học system design sau 2 năm mid, bạn sẽ kẹt ở đây 5 năm.',
      },
      {
        band: 'senior',
        title: 'Senior Engineer',
        salary: '25–40 triệu',
        duration: '2–4 năm',
        unlock: [
          'Dẫn dắt 1 technical decision ảnh hưởng toàn team, present architecture review',
          'Đạt TOEIC 750+ hoặc phỏng vấn được bằng tiếng Anh với foreign manager',
          'Có 1 contribution đáng kể: open source, tech blog, hoặc internal tool được team dùng',
        ],
        warning: 'Bẫy: Ceiling 35-40 triệu nếu không chuyển sang management hoặc target remote USD. Thị trường quốc tế trả gấp 3-5x — tiếng Anh là rào cản duy nhất.',
      },
      {
        band: 'lead',
        title: 'Tech Lead / Engineering Manager',
        salary: '40–70 triệu',
        duration: '2–5 năm',
        unlock: [
          'Xây dựng engineering culture: code review process, hiring bar, onboarding playbook',
          'Deliver OKR cho team 2 quý liên tiếp với đủ người và đúng deadline',
          'Hire được ít nhất 3 engineer chất lượng — biết phân biệt A-player và B-player',
        ],
        warning: 'Bẫy: Làm việc của Director nhưng nhận lương Lead. Nếu bạn đang manage 5+ người mà không có title/comp tương xứng — negotiate hoặc nhảy.',
      },
      {
        band: 'executive',
        title: 'CTO / VP Engineering',
        salary: '70–150 triệu+',
        duration: 'Không giới hạn',
        unlock: [
          'Xây dựng board-level tech strategy, present được cho investor/board',
          'Build engineering org từ đầu hoặc scale từ 10 lên 50+ người',
          'Có track record: product bạn build đang có user thực và revenue',
        ],
        warning: 'Bẫy: Equity VN quá thấp so với Singapore/remote USD. Nhiều CTO giỏi đang nhận 100 triệu VN trong khi remote CTO role trả $15,000-25,000/tháng.',
      },
    ],
  },

  // ── 2. TÀI CHÍNH / NGÂN HÀNG ────────────────────────────────────────────
  FINANCE: {
    jobGroup: 'Tài chính / Ngân hàng',
    keywords: [
      'finance', 'tài chính', 'ngân hàng', 'bank', 'kế toán', 'accountant',
      'kiểm toán', 'audit', 'chứng khoán', 'investment', 'financial analyst',
      'treasury', 'risk', 'compliance', 'credit', 'loan', 'insurance',
      'bảo hiểm', 'fintech', 'cfo', 'controller', 'tax', 'thuế',
    ],
    salaryBands: {
      entry:     { min:  7_000_000, max: 12_000_000, label: 'Nhân viên Tài chính / Kế toán mới (7–12 triệu)' },
      mid:       { min: 12_000_000, max: 20_000_000, label: 'Chuyên viên Tài chính (12–20 triệu)' },
      senior:    { min: 20_000_000, max: 35_000_000, label: 'Senior Analyst / Trưởng nhóm (20–35 triệu)' },
      lead:      { min: 35_000_000, max: 60_000_000, label: 'Trưởng phòng / Finance Manager (35–60 triệu)' },
      executive: { min: 60_000_000, max: 120_000_000, label: 'CFO / Giám đốc Tài chính (60–120 triệu+)' },
    },
    painPoints: {
      entry:     'Học 4 năm tài chính nhưng lương thực tế không khác ngành khác, áp lực KPI và OT không lương. Nhiều bạn entry bị kẹt ở 8–10 triệu dù bằng cấp tốt.',
      mid:       'Biết nhiều về tiền của người khác nhưng lương không đủ để đầu tư cho chính mình. Bẫy "chuyên viên mãi mãi" — làm tốt nhưng không được thăng tiến vì thiếu kỹ năng quản lý.',
      senior:    'Ceiling 30–35 triệu nếu không có CFA/ACCA hoặc không chuyển sang investment banking/PE. Áp lực deadline báo cáo tài chính và audit mùa vụ rất cao.',
      lead:      'Trách nhiệm lớn nhưng lương không tương xứng so với áp lực. Nhiều Finance Manager ở VN đang bị undercompensated 20–30% so với thị trường khu vực.',
      executive: 'CFO ở công ty nội địa thường bị giới hạn bởi tư duy của chủ doanh nghiệp. Cơ hội thực sự nằm ở MNC, PE fund, hoặc startup Series B+.',
    },
    opportunities: {
      entry:     'Chứng chỉ CPA/ACCA tăng lương 30–50% ngay lập tức. Fintech đang trả cao hơn ngân hàng truyền thống 20–40% cho cùng vị trí.',
      mid:       'Data analytics + Power BI/Python cho tài chính là kỹ năng hiếm, tăng giá trị 40–60%. Target fintech hoặc MNC để thoát bẫy lương thấp.',
      senior:    'CFA Level 1–2 + kinh nghiệm M&A/IPO mở cửa vào investment banking (50–100 triệu). Hoặc chuyển sang FP&A tại MNC.',
      lead:      'CFO track tại startup tăng trưởng nhanh — cơ hội nhận equity + bonus performance-based vượt xa lương cố định.',
      executive: 'Board advisor, independent director, hoặc fractional CFO cho 2–3 công ty — mô hình thu nhập 150–300 triệu/tháng.',
    },
    nextMilestone: {
      entry:     'Đăng ký CPA Việt Nam hoặc ACCA Foundation trong 6 tháng — chứng chỉ này tăng lương 30% ngay khi pass.',
      mid:       'Học Power BI + Python cơ bản cho tài chính, xây 1 dashboard tự động → apply senior trong 12 tháng.',
      senior:    'Dẫn dắt 1 dự án M&A hoặc IPO nhỏ, lấy CFA Level 1 → mở cửa vào investment banking.',
      lead:      'Xây dựng financial model cho chiến lược 3 năm của công ty, present lên Board → chuẩn bị CFO role.',
      executive: 'Xây dựng mạng lưới PE/VC, tham gia advisory board 1–2 startup → tối đa hóa thu nhập và ảnh hưởng.',
    },
    marketInsight: 'Fintech Việt Nam tăng trưởng 30%/năm, trả lương cao hơn ngân hàng truyền thống 20–40%. Chứng chỉ quốc tế (CFA, ACCA) là yếu tố tăng lương nhanh nhất ngành này.',
    topSkillGap: 'Financial Modeling nâng cao + Data Analytics (Python/Power BI) + chứng chỉ quốc tế CFA/ACCA — 3 yếu tố tạo ra khoảng cách lương lớn nhất ngành tài chính.',
    careerLadder: [
      {
        band: 'entry',
        title: 'Nhân viên Tài chính / Kế toán',
        salary: '7–12 triệu',
        duration: '12–24 tháng',
        unlock: [
          'Đăng ký CPA Việt Nam hoặc ACCA Foundation — pass 1 module đầu tiên',
          'Thành thạo Excel nâng cao: VLOOKUP, Pivot Table, Power Query',
          'Hiểu được P&L, Balance Sheet, Cash Flow Statement của công ty đang làm',
        ],
        warning: 'Bẫy: Làm kế toán thủ công mãi mà không học automation. Người biết Power BI/Python đang nhận gấp đôi làm cùng công việc.',
      },
      {
        band: 'mid',
        title: 'Chuyên viên Tài chính',
        salary: '12–20 triệu',
        duration: '2–3 năm',
        unlock: [
          'Xây được 1 financial model từ đầu (3-statement model hoặc DCF)',
          'Học Power BI hoặc Python cơ bản — tự động hóa ít nhất 1 báo cáo định kỳ',
          'Pass CPA hoặc ACCA Part 1 — chứng chỉ này tăng lương 30% ngay lập tức',
        ],
        warning: 'Bẫy: Biết nhiều về tiền của người khác nhưng lương không đủ đầu tư cho mình. Nếu không có chứng chỉ quốc tế sau 3 năm, bạn sẽ bị junior mới ra trường có ACCA vượt qua.',
      },
      {
        band: 'senior',
        title: 'Senior Analyst / Trưởng nhóm',
        salary: '20–35 triệu',
        duration: '2–4 năm',
        unlock: [
          'Dẫn dắt 1 dự án M&A due diligence hoặc tham gia IPO preparation',
          'Lấy CFA Level 1 hoặc ACCA full qualification',
          'Xây financial model được CFO/Board dùng để ra quyết định chiến lược',
        ],
        warning: 'Bẫy: Ceiling 30-35 triệu ở công ty nội địa. Fintech và MNC đang trả 40-60 triệu cho cùng skill set. Nếu không nhảy sau 3 năm senior, bạn đang để tiền trên bàn.',
      },
      {
        band: 'lead',
        title: 'Finance Manager / Trưởng phòng',
        salary: '35–60 triệu',
        duration: '3–5 năm',
        unlock: [
          'Own P&L của 1 business unit hoặc toàn công ty',
          'Build và manage finance team 3-5 người',
          'Present financial strategy lên Board/Investor — biết nói ngôn ngữ business, không chỉ accounting',
        ],
        warning: 'Bẫy: Finance Manager ở công ty nội địa bị giới hạn bởi tư duy chủ doanh nghiệp. Cơ hội thực sự ở MNC, PE fund, hoặc startup Series B+.',
      },
      {
        band: 'executive',
        title: 'CFO / Giám đốc Tài chính',
        salary: '60–120 triệu+',
        duration: 'Không giới hạn',
        unlock: [
          'Lead fundraising round (Series A/B) hoặc IPO process',
          'Build financial infrastructure từ đầu cho startup tăng trưởng nhanh',
          'Có network với PE/VC fund và investment banking community',
        ],
        warning: 'Bẫy: CFO ở công ty nội địa thường bị giới hạn bởi tư duy chủ. Fractional CFO cho 2-3 startup = 150-300 triệu/tháng với lịch linh hoạt hơn.',
      },
    ],
  },

  // ── 3. MARKETING / TRUYỀN THÔNG ─────────────────────────────────────────
  MARKETING: {
    jobGroup: 'Marketing / Truyền thông',
    keywords: [
      'marketing', 'digital marketing', 'content', 'seo', 'sem', 'ads',
      'brand', 'pr ', ' pr', 'truyền thông', 'copywriter', 'social media',
      'performance marketing', 'growth', 'cmo', 'marketing manager',
      'media buyer', 'influencer', 'community', 'email marketing',
    ],
    salaryBands: {
      entry:     { min:  6_000_000, max: 10_000_000, label: 'Nhân viên Marketing / Content mới (6–10 triệu)' },
      mid:       { min: 10_000_000, max: 18_000_000, label: 'Chuyên viên Marketing (10–18 triệu)' },
      senior:    { min: 18_000_000, max: 30_000_000, label: 'Senior Marketing / Team Lead (18–30 triệu)' },
      lead:      { min: 30_000_000, max: 55_000_000, label: 'Marketing Manager / Head of Marketing (30–55 triệu)' },
      executive: { min: 55_000_000, max: 100_000_000, label: 'CMO / VP Marketing (55–100 triệu+)' },
    },
    painPoints: {
      entry:     'Ngành marketing đông người, lương entry thấp nhất trong các ngành văn phòng. Nhiều bạn làm content 2–3 năm vẫn dưới 10 triệu vì không có kỹ năng đo lường ROI.',
      mid:       'Làm nhiều nhưng khó chứng minh giá trị bằng số. Bẫy "creative mà không có data" — sếp không thấy impact nên không tăng lương.',
      senior:    'Ceiling 25–28 triệu nếu không có kinh nghiệm quản lý budget lớn hoặc không chứng minh được revenue impact trực tiếp.',
      lead:      'Áp lực KPI doanh thu trong khi budget bị cắt. Nhiều Marketing Manager đang làm việc của CMO nhưng nhận lương của senior.',
      executive: 'CMO ở công ty nội địa thường bị giới hạn bởi tư duy "marketing = chi phí". Cơ hội thực sự ở MNC, startup tăng trưởng nhanh, hoặc agency quốc tế.',
    },
    opportunities: {
      entry:     'Performance marketing (Meta Ads, Google Ads) + analytics là kỹ năng khan hiếm, tăng lương 50–80% so với content thuần túy.',
      mid:       'Growth hacking + marketing automation + A/B testing — 3 kỹ năng này đưa mid marketer lên senior trong 12 tháng.',
      senior:    'Revenue-focused marketing (pipeline generation, CAC/LTV optimization) mở cửa vào MNC và startup Series A+.',
      lead:      'CMO track tại startup + equity, hoặc agency owner — hai con đường thu nhập 100–300 triệu/tháng.',
      executive: 'Fractional CMO cho 3–5 startup, hoặc xây agency chuyên biệt — mô hình thu nhập không giới hạn.',
    },
    nextMilestone: {
      entry:     'Lấy chứng chỉ Google Analytics + Meta Blueprint trong 3 tháng → apply performance marketing role tăng lương 50%.',
      mid:       'Xây 1 case study có số liệu ROI cụ thể (tăng X% conversion, giảm Y% CAC) → apply senior trong 6 tháng.',
      senior:    'Quản lý budget 500 triệu+, báo cáo revenue impact trực tiếp lên C-level → chuẩn bị Head of Marketing.',
      lead:      'Xây dựng marketing strategy 12 tháng với P&L rõ ràng → target CMO hoặc agency founder.',
      executive: 'Xây personal brand, speak tại conference, publish case study → tăng giá trị advisory và fractional role.',
    },
    marketInsight: 'Performance marketing và growth hacking đang trả cao hơn brand marketing 40–60%. Marketer biết đọc data và tối ưu funnel đang được săn đón mạnh nhất 2026.',
    topSkillGap: 'Marketing Analytics (GA4, Mixpanel) + Performance Marketing (Meta/Google Ads) + Revenue Attribution — kỹ năng đo lường ROI là yếu tố tăng lương nhanh nhất ngành.',
    careerLadder: [
      { band: 'entry', title: 'Nhân viên Marketing / Content', salary: '6–10 triệu', duration: '12–18 tháng',
        unlock: ['Lấy chứng chỉ Google Analytics 4 + Meta Blueprint (miễn phí, 2-4 tuần)', 'Chạy được 1 campaign ads thực tế với budget nhỏ và đo được ROAS', 'Xây 1 case study có số liệu: tăng X% traffic, Y leads, Z% conversion'],
        warning: 'Bẫy: Làm content mãi mà không học đo lường. Content writer và performance marketer cùng 2 năm kinh nghiệm nhưng lương chênh nhau 50-80%.' },
      { band: 'mid', title: 'Chuyên viên Marketing', salary: '10–18 triệu', duration: '2–3 năm',
        unlock: ['Manage được budget ads 50-200 triệu/tháng với ROAS target rõ ràng', 'Xây A/B test framework và đọc được statistical significance', 'Báo cáo được revenue attribution: campaign nào đóng góp bao nhiêu % doanh thu'],
        warning: 'Bẫy: Creative mà không có data. Sếp không thấy impact = không tăng lương. Mỗi campaign phải có 1 số đo được.' },
      { band: 'senior', title: 'Senior Marketing / Team Lead', salary: '18–30 triệu', duration: '2–3 năm',
        unlock: ['Own marketing budget 500 triệu+/năm và chịu trách nhiệm P&L marketing', 'Build và lead team 3-5 người, establish process và KPI framework', 'Present marketing ROI trực tiếp lên C-level bằng ngôn ngữ revenue, không phải impressions'],
        warning: 'Bẫy: Ceiling 25-28 triệu nếu không chứng minh được revenue impact trực tiếp. "Em tăng brand awareness" không bằng "em mang về 2 tỷ pipeline".' },
      { band: 'lead', title: 'Marketing Manager / Head of Marketing', salary: '30–55 triệu', duration: '3–5 năm',
        unlock: ['Own marketing strategy 12 tháng với P&L rõ ràng', 'Build marketing machine: automation, funnel, attribution model', 'Hire và develop team — biết phân biệt A-player marketer'],
        warning: 'Bẫy: Marketing Manager ở công ty nội địa thường bị coi là cost center. Cơ hội thực sự ở startup tăng trưởng nhanh nơi marketing = revenue engine.' },
      { band: 'executive', title: 'CMO / VP Marketing', salary: '55–100 triệu+', duration: 'Không giới hạn',
        unlock: ['Build go-to-market strategy cho product launch hoặc market expansion', 'Own brand equity và customer acquisition cost ở company level', 'Có network với media, agency, và distribution partners'],
        warning: 'Bẫy: CMO ở công ty nội địa bị giới hạn bởi tư duy "marketing = chi phí". Fractional CMO cho 3-5 startup = 100-300 triệu/tháng.' },
    ],
  },

  // ── 4. KINH DOANH / BÁN HÀNG ────────────────────────────────────────────
  SALES: {
    jobGroup: 'Kinh doanh / Bán hàng',
    keywords: [
      'sales', 'kinh doanh', 'bán hàng', 'business development', 'bd ',
      'account manager', 'account executive', 'b2b', 'b2c', 'telesales',
      'key account', 'regional sales', 'sales manager', 'cso',
      'commercial', 'revenue', 'partnership', 'channel sales',
    ],
    salaryBands: {
      entry:     { min:  7_000_000, max: 12_000_000, label: 'Nhân viên Kinh doanh mới (7–12 triệu + commission)' },
      mid:       { min: 15_000_000, max: 25_000_000, label: 'Chuyên viên Kinh doanh (15–25 triệu)' },
      senior:    { min: 25_000_000, max: 45_000_000, label: 'Senior Sales / Key Account (25–45 triệu)' },
      lead:      { min: 45_000_000, max: 80_000_000, label: 'Sales Manager / Trưởng phòng KD (45–80 triệu)' },
      executive: { min: 80_000_000, max: 150_000_000, label: 'Sales Director / CSO (80–150 triệu+)' },
    },
    painPoints: {
      entry:     'Thu nhập biến động mạnh theo commission — tháng tốt 15 triệu, tháng xấu 7 triệu. Áp lực quota hàng tháng tạo stress cao, tỷ lệ burnout trong 12 tháng đầu rất lớn.',
      mid:       'Commission ceiling khi đã khai thác hết territory. Nhiều sales mid bị kẹt vì không có kỹ năng quản lý team hoặc strategic account planning.',
      senior:    'Áp lực quota tăng mỗi năm trong khi territory không mở rộng. Nhiều senior sales đang làm việc của manager nhưng không được thăng tiến vì thiếu kỹ năng coaching.',
      lead:      'Chịu trách nhiệm doanh số của cả team nhưng không có quyền quyết định về sản phẩm/giá. Áp lực từ cả trên lẫn dưới — dễ burnout ở vị trí này.',
      executive: 'Sales Director ở công ty nội địa thường bị giới hạn bởi sản phẩm và chiến lược. Cơ hội thực sự ở MNC, SaaS company, hoặc startup với equity.',
    },
    opportunities: {
      entry:     'B2B SaaS sales đang trả commission cao nhất thị trường — OTE (On-Target Earnings) 25–40 triệu ngay từ năm đầu nếu đúng công ty.',
      mid:       'Enterprise sales + solution selling mở cửa vào MNC với OTE 40–70 triệu. Kỹ năng MEDDIC/SPIN selling là differentiator lớn.',
      senior:    'Sales leadership track: xây team, coaching, forecasting → Sales Manager với thu nhập 50–80 triệu + bonus.',
      lead:      'Revenue Operations (RevOps) là role mới nổi, kết hợp sales + data + process — lương 60–100 triệu, ít cạnh tranh.',
      executive: 'Fractional CSO hoặc sales consultant cho startup — thu nhập 100–200 triệu/tháng với lịch linh hoạt.',
    },
    nextMilestone: {
      entry:     'Vượt quota 120%+ trong 2 quý liên tiếp, học SPIN Selling → đủ điều kiện apply mid-level với base cao hơn.',
      mid:       'Đóng 1 enterprise deal 1 tỷ+, xây case study → apply senior hoặc nhảy sang B2B SaaS tăng OTE 50%.',
      senior:    'Mentor 2–3 junior sales, xây playbook cho team → chuẩn bị Sales Manager role.',
      lead:      'Xây sales process từ đầu, hire và train team 5+ người, đạt team quota 3 quý liên tiếp → target Director.',
      executive: 'Xây go-to-market strategy, mở thị trường mới, hoặc pivot sang advisory/fractional để tối đa hóa thu nhập.',
    },
    marketInsight: 'B2B SaaS và enterprise sales đang trả OTE cao nhất thị trường, gấp 2–3x so với retail/FMCG sales. Kỹ năng solution selling + CRM (Salesforce/HubSpot) là yếu tố tăng lương nhanh nhất.',
    topSkillGap: 'Enterprise/Solution Selling + CRM Analytics + Sales Forecasting — kỹ năng chuyển từ "bán hàng cảm tính" sang "bán hàng dựa trên data" tạo ra khoảng cách lương lớn nhất.',
    careerLadder: [
      { band: 'entry', title: 'Nhân viên Kinh doanh', salary: '7–12 triệu + commission', duration: '12–18 tháng',
        unlock: ['Vượt quota 120%+ trong 2 quý liên tiếp — đây là proof of concept duy nhất', 'Học SPIN Selling hoặc Challenger Sale — đọc sách, apply ngay vào cuộc gọi thực', 'Dùng CRM (HubSpot free) để track pipeline — biết conversion rate của mình'],
        warning: 'Bẫy: Thu nhập biến động mạnh theo commission. Tháng tốt 15 triệu, tháng xấu 7 triệu. Nếu quota không thực tế, nhảy sớm — đừng waste 1 năm.' },
      { band: 'mid', title: 'Chuyên viên Kinh doanh', salary: '15–25 triệu', duration: '2–3 năm',
        unlock: ['Close được 1 enterprise deal 500 triệu+ và viết case study về process', 'Xây account plan cho top 10 khách hàng — biết upsell và cross-sell', 'Học forecasting: dự báo được pipeline accuracy 80%+ mỗi tháng'],
        warning: 'Bẫy: Commission ceiling khi đã khai thác hết territory. Nếu không có kỹ năng quản lý team sau 3 năm mid, bạn sẽ bị junior mới vào vượt qua về OTE.' },
      { band: 'senior', title: 'Senior Sales / Key Account', salary: '25–45 triệu', duration: '2–3 năm',
        unlock: ['Mentor 2-3 junior sales và xây sales playbook cho team', 'Own strategic accounts — biết navigate multi-stakeholder deals', 'Đạt President Club hoặc top 10% sales performance trong công ty'],
        warning: 'Bẫy: Áp lực quota tăng mỗi năm trong khi territory không mở rộng. Nếu đang làm việc của Sales Manager mà không có title — negotiate hoặc nhảy.' },
      { band: 'lead', title: 'Sales Manager / Trưởng phòng KD', salary: '45–80 triệu', duration: '3–5 năm',
        unlock: ['Build sales team từ đầu: hire, train, establish quota model', 'Đạt team quota 3 quý liên tiếp với attrition thấp', 'Xây sales process: từ lead gen → qualification → close → expansion'],
        warning: 'Bẫy: Chịu trách nhiệm doanh số của cả team nhưng không có quyền quyết định về sản phẩm/giá. Revenue Operations (RevOps) là escape route — lương 60-100 triệu, ít cạnh tranh.' },
      { band: 'executive', title: 'Sales Director / CSO', salary: '80–150 triệu+', duration: 'Không giới hạn',
        unlock: ['Own go-to-market strategy và revenue target ở company level', 'Build và scale sales org từ 10 lên 50+ người', 'Có network với enterprise buyers và channel partners'],
        warning: 'Bẫy: Sales Director ở công ty nội địa bị giới hạn bởi sản phẩm. Fractional CSO cho startup = 100-200 triệu/tháng với lịch linh hoạt.' },
    ],
  },

  // ── 5. Y TẾ / SỨC KHOẺ ─────────────────────────────────────────────────
  HEALTHCARE: {
    jobGroup: 'Y tế / Sức khoẻ',
    keywords: [
      'bác sĩ', 'y tá', 'dược', 'y tế', 'nurse', 'doctor', 'pharmacist',
      'điều dưỡng', 'kỹ thuật viên', 'xét nghiệm', 'chẩn đoán hình ảnh',
      'vật lý trị liệu', 'nha sĩ', 'dentist', 'optometrist', 'midwife',
      'healthcare', 'medical', 'clinical', 'hospital', 'bệnh viện',
    ],
    salaryBands: {
      entry:     { min:  6_000_000, max: 10_000_000, label: 'Nhân viên Y tế mới / Intern (6–10 triệu)' },
      mid:       { min: 12_000_000, max: 20_000_000, label: 'Bác sĩ / Dược sĩ có kinh nghiệm (12–20 triệu)' },
      senior:    { min: 20_000_000, max: 40_000_000, label: 'Chuyên khoa / Senior Clinician (20–40 triệu)' },
      lead:      { min: 40_000_000, max: 70_000_000, label: 'Trưởng khoa / Medical Director (40–70 triệu)' },
      executive: { min: 70_000_000, max: 120_000_000, label: 'Giám đốc Y khoa / CEO Bệnh viện (70–120 triệu+)' },
    },
    painPoints: {
      entry:     'Đào tạo 6 năm y khoa nhưng lương intern/resident chỉ 6–8 triệu — thấp hơn nhiều ngành khác. Áp lực trực đêm, ca dài, rủi ro nghề nghiệp cao.',
      mid:       'Chênh lệch lương công/tư rất lớn: bác sĩ bệnh viện công 12–15 triệu vs phòng khám tư 25–40 triệu. Nhiều bác sĩ giỏi đang bị giữ lại bởi hệ thống công lập.',
      senior:    'Ceiling ở bệnh viện công do hệ thống ngạch bậc cứng nhắc. Cơ hội thực sự ở bệnh viện tư, phòng khám quốc tế, hoặc tự mở phòng khám.',
      lead:      'Trưởng khoa phải cân bằng giữa quản lý hành chính và thực hành lâm sàng — áp lực kép. Lương không tương xứng với trách nhiệm pháp lý.',
      executive: 'Giám đốc y khoa ở bệnh viện tư có thu nhập tốt nhưng áp lực KPI doanh thu xung đột với đạo đức y khoa — đây là tension lớn nhất ở vị trí này.',
    },
    opportunities: {
      entry:     'Bệnh viện tư và phòng khám quốc tế trả gấp 2–3x bệnh viện công. Chứng chỉ chuyên khoa quốc tế (MRCP, MRCS) mở cửa vào hệ thống y tế cao cấp.',
      mid:       'Telemedicine và digital health đang bùng nổ — bác sĩ có kỹ năng digital có thể tư vấn online, tăng thu nhập 50–100% so với lương cố định.',
      senior:    'Mở phòng khám chuyên khoa hoặc tham gia chuỗi phòng khám tư — thu nhập 50–150 triệu/tháng với đúng chuyên khoa.',
      lead:      'Healthcare management + MBA mở cửa vào C-suite của bệnh viện tư lớn hoặc tập đoàn y tế.',
      executive: 'Healthcare consulting, medical advisory cho pharma/medtech, hoặc xây chuỗi phòng khám — mô hình thu nhập không giới hạn.',
    },
    nextMilestone: {
      entry:     'Hoàn thành chuyên khoa cơ bản, apply vào bệnh viện tư hoặc phòng khám quốc tế → tăng lương 2–3x ngay lập tức.',
      mid:       'Lấy 1 chứng chỉ chuyên khoa quốc tế, xây thương hiệu cá nhân online → tăng thu nhập từ tư vấn online.',
      senior:    'Mở phòng khám hoặc tham gia chuỗi phòng khám tư với equity → target 50–100 triệu/tháng.',
      lead:      'Học healthcare management/MBA, xây network với investors y tế → chuẩn bị C-suite role.',
      executive: 'Xây chuỗi phòng khám, advisory cho pharma, hoặc healthtech startup → tối đa hóa thu nhập và impact.',
    },
    marketInsight: 'Thị trường y tế tư nhân Việt Nam tăng trưởng 15–20%/năm. Bác sĩ chuyên khoa tại bệnh viện tư đang được trả gấp 2–4x so với bệnh viện công cùng vị trí.',
    topSkillGap: 'Chứng chỉ chuyên khoa quốc tế + Digital Health literacy + Healthcare Management — 3 yếu tố tạo ra khoảng cách lương lớn nhất ngành y tế Việt Nam.',
    careerLadder: [
      { band: 'entry', title: 'Nhân viên Y tế / Intern', salary: '6–10 triệu', duration: '12–24 tháng',
        unlock: ['Hoàn thành chuyên khoa cơ bản và đạt chứng chỉ hành nghề', 'Apply vào bệnh viện tư hoặc phòng khám quốc tế — lương gấp 2-3x bệnh viện công', 'Học 1 kỹ năng digital health: telemedicine platform hoặc EMR system'],
        warning: 'Bẫy: Ở lại bệnh viện công vì "ổn định". Bệnh viện tư trả gấp 2-3x — sự ổn định đó đang cost bạn 5-10 triệu/tháng.' },
      { band: 'mid', title: 'Bác sĩ / Dược sĩ có kinh nghiệm', salary: '12–20 triệu', duration: '3–5 năm',
        unlock: ['Lấy 1 chứng chỉ chuyên khoa quốc tế (MRCP, MRCS, ACLS, hoặc tương đương)', 'Xây thương hiệu cá nhân online: fanpage tư vấn sức khỏe hoặc YouTube', 'Tư vấn online 2-3 ca/tuần — test model trước khi scale'],
        warning: 'Bẫy: Chênh lệch lương công/tư rất lớn nhưng nhiều bác sĩ giỏi bị giữ lại bởi hệ thống công lập. Chứng chỉ quốc tế là vé thoát.' },
      { band: 'senior', title: 'Chuyên khoa / Senior Clinician', salary: '20–40 triệu', duration: '3–5 năm',
        unlock: ['Mở phòng khám chuyên khoa hoặc tham gia chuỗi phòng khám tư với equity', 'Xây network với bệnh viện tư lớn và tập đoàn y tế', 'Học healthcare management hoặc MBA để hiểu P&L của cơ sở y tế'],
        warning: 'Bẫy: Ceiling ở bệnh viện công do ngạch bậc cứng nhắc. Phòng khám tư chuyên khoa đúng ngành = 50-150 triệu/tháng.' },
      { band: 'lead', title: 'Trưởng khoa / Medical Director', salary: '40–70 triệu', duration: '3–5 năm',
        unlock: ['Quản lý khoa với P&L rõ ràng — biết balance clinical quality và business metrics', 'Build và train team bác sĩ/điều dưỡng', 'Establish clinical protocol và quality standard cho cơ sở'],
        warning: 'Bẫy: Áp lực KPI doanh thu xung đột với đạo đức y khoa. Chọn tổ chức có culture đúng — đây là quyết định quan trọng nhất ở level này.' },
      { band: 'executive', title: 'Giám đốc Y khoa / CEO Bệnh viện', salary: '70–120 triệu+', duration: 'Không giới hạn',
        unlock: ['Xây chuỗi phòng khám hoặc lead M&A trong healthcare sector', 'Có network với PE/VC đang đầu tư vào healthcare VN', 'Advisory cho pharma/medtech company'],
        warning: 'Bẫy: Healthcare M&A đang bùng nổ ở VN. Equity trong hospital group trước khi M&A = life-changing money. Đừng chỉ nhận lương.' },
    ],
  },

  // ── 6. QUẢN LÝ TRUNG TÂM NGOẠI NGỮ ────────────────────────────────────
  LANGUAGE_CENTER: {
    jobGroup: 'Giáo dục - Trung tâm ngoại ngữ',
    keywords: [
      'quản lý trung tâm ngoại ngữ', 'quan ly trung tam ngoai ngu',
      'trung tâm ngoại ngữ', 'trung tam ngoai ngu',
      'english center manager', 'language center manager',
      'academic center manager', 'center manager ngoại ngữ',
      'quản lý trung tâm tiếng anh', 'quan ly trung tam tieng anh',
      'english center', 'language center',
    ],
    salaryBands: {
      entry:     { min: 10_000_000, max: 14_000_000, label: 'Điều phối / Assistant Center Manager (10–14 triệu)' },
      mid:       { min: 14_000_000, max: 21_000_000, label: 'Quản lý trung tâm ngoại ngữ (14–21 triệu)' },
      senior:    { min: 21_000_000, max: 29_000_000, label: 'Center Manager mạnh vận hành & tuyển sinh (21–29 triệu)' },
      lead:      { min: 29_000_000, max: 42_000_000, label: 'Cluster / Academic Operations Lead (29–42 triệu)' },
      executive: { min: 42_000_000, max: 80_000_000, label: 'Giám đốc vận hành chuỗi / Growth giáo dục (42–80 triệu+)' },
    },
    painPoints: {
      entry:     'Bạn đang làm nhiều việc vận hành nhưng giá trị chưa được quy đổi thành số: lớp có đủ học viên không, trial có thành paid không, phụ huynh complaint bao lâu thì xử lý xong.',
      mid:       'Bẫy của quản lý trung tâm là bị nhìn như người trực ca cao cấp. Nếu không chứng minh enrollment, retention và utilization, lương dễ bị neo ở vùng 14–18 triệu.',
      senior:    'Bạn có thể đang giữ trung tâm chạy ổn nhưng chưa đóng gói được thành năng lực tăng trưởng. Thiếu dashboard là thiếu bằng chứng để đòi band cao hơn.',
      lead:      'Muốn vượt 30 triệu, bạn không chỉ quản 1 trung tâm. Bạn phải chứng minh mô hình vận hành có thể nhân rộng sang nhiều cơ sở hoặc nhiều chương trình.',
      executive: 'Ở cấp chuỗi, thị trường trả cho năng lực P&L, tăng trưởng tuyển sinh, kiểm soát churn và chuẩn hóa chất lượng giáo viên, không trả thêm cho việc bận hơn.',
    },
    opportunities: {
      entry:     'Chỉ cần dựng dashboard học viên active, trial-to-paid, class fill rate và complaint SLA, bạn đã khác nhóm chỉ “quản lý lịch học”.',
      mid:       'Trung tâm tư nhân trả cao hơn cho người kéo được enrollment và retention, đặc biệt nếu chứng minh được revenue per class và teacher utilization.',
      senior:    'Bước nhảy lương rõ nhất là từ vận hành một điểm sang Academic Operations / Growth cho nhiều điểm hoặc nhiều chương trình.',
      lead:      'Người biết chuẩn hóa curriculum, train giáo viên và giảm churn có thể deal bonus KPI hoặc scope cluster thay vì chỉ tăng lương cố định.',
      executive: 'Nếu biến mô hình vận hành thành playbook mở cơ sở mới, bạn có thể đi lên Head of Operations / Growth hoặc tự build trung tâm.',
    },
    nextMilestone: {
      entry:     'Trong 30 ngày: lập bảng 8 KPI trung tâm, lấy số nền và chọn 1 chỉ số kéo lên rõ nhất.',
      mid:       'Trong 60–90 ngày: tăng trial-to-paid hoặc retention bằng 1 quy trình tư vấn/phụ huynh/teacher follow-up có số trước-sau.',
      senior:    'Đóng gói 1 case study tăng enrollment/retention hoặc giảm complaint để xin scope lớn hơn và band 21–29 triệu.',
      lead:      'Chuẩn hóa playbook vận hành cho nhiều lớp/cơ sở: lịch giáo viên, class fill rate, parent SLA, renewal và revenue per class.',
      executive: 'Xây dashboard P&L và playbook mở rộng cơ sở/chương trình, từ đó deal Head of Operations / Growth hoặc revenue-linked bonus.',
    },
    marketInsight: 'Trung tâm ngoại ngữ trả cao cho người chứng minh được tuyển sinh, giữ chân học viên, tối ưu lịch giáo viên và kiểm soát complaint. Đây là nghề vận hành + tăng trưởng, không phải L&D nội bộ.',
    topSkillGap: 'Enrollment funnel + retention/churn dashboard + teacher utilization + parent complaint SLA — bộ bằng chứng quyết định band lương quản lý trung tâm ngoại ngữ.',
    careerLadder: [
      { band: 'entry', title: 'Điều phối / Assistant Center Manager', salary: '10–14 triệu', duration: '3–6 tháng',
        unlock: ['Lập dashboard học viên active, trial-to-paid, class fill rate, teacher utilization', 'Chuẩn hóa checklist mở/đóng lớp và xử lý complaint phụ huynh', 'Có 1 case giảm lỗi vận hành hoặc tăng tỷ lệ lấp lớp'],
        warning: 'Bẫy: làm rất nhiều việc nhưng không có số. Không có số thì thị trường chỉ thấy bạn là điều phối viên bận rộn.' },
      { band: 'mid', title: 'Quản lý trung tâm ngoại ngữ', salary: '14–21 triệu', duration: '6–12 tháng',
        unlock: ['Tăng 1 chỉ số chính: trial-to-paid, retention, renewal hoặc revenue per class', 'Đóng gói quy trình follow-up học viên/phụ huynh bằng số trước-sau', 'Xin scope quản thêm tuyển sinh, lịch giáo viên hoặc chất lượng lớp'],
        warning: 'Bẫy: chỉ quản ca, xử lý sự vụ và chờ tăng lương theo thâm niên. Band cao trả cho tác động lên doanh thu và retention.' },
      { band: 'senior', title: 'Center Manager mạnh vận hành & tuyển sinh', salary: '21–29 triệu', duration: '6–12 tháng',
        unlock: ['Làm case study 1 trang chứng minh tăng enrollment/retention hoặc giảm churn', 'Thiết kế dashboard tuần cho chủ trung tâm/area manager', 'Train lại giáo viên/tư vấn viên theo 1 playbook có KPI'],
        warning: 'Bẫy: trung tâm chạy ổn nhưng không ai thấy bạn tạo bao nhiêu tiền hoặc giảm bao nhiêu rủi ro.' },
      { band: 'lead', title: 'Cluster / Academic Operations Lead', salary: '29–42 triệu', duration: '12 tháng',
        unlock: ['Nhân playbook sang nhiều lớp/cơ sở', 'Gắn KPI vận hành với bonus: retention, renewal, complaint SLA, class fill rate', 'Đề xuất scope cluster hoặc growth project có mục tiêu doanh thu rõ'],
        warning: 'Bẫy: nhận thêm việc nhưng không đổi title, KPI và bonus. Scope lớn phải đi kèm cơ chế trả lớn.' },
      { band: 'executive', title: 'Head of Operations / Growth giáo dục', salary: '42–80 triệu+', duration: 'Không giới hạn',
        unlock: ['Xây P&L dashboard cho chuỗi/cụm trung tâm', 'Chuẩn hóa playbook mở lớp/chương trình mới', 'Deal revenue-linked bonus, profit share hoặc quyền vận hành cơ sở mới'],
        warning: 'Bẫy: chỉ nhận lương fixed khi bạn đang tạo mô hình tăng trưởng có thể nhân rộng.' },
    ],
  },

  // ── 7. GIÁO DỤC ─────────────────────────────────────────────────────────
  EDUCATION: {
    jobGroup: 'Giáo dục / Đào tạo',
    keywords: [
      'giáo viên', 'giảng viên', 'teacher', 'tutor', 'đào tạo', 'training',
      'education', 'học viện', 'trường', 'school', 'university', 'lecturer',
      'instructor', 'coach', 'mentor', 'e-learning', 'curriculum',
      'academic', 'professor', 'hiệu trưởng', 'principal',
    ],
    salaryBands: {
      entry:     { min:  5_000_000, max:  8_000_000, label: 'Giáo viên mới / Trợ giảng (5–8 triệu)' },
      mid:       { min:  8_000_000, max: 15_000_000, label: 'Giáo viên có kinh nghiệm (8–15 triệu)' },
      senior:    { min: 15_000_000, max: 25_000_000, label: 'Giáo viên Senior / Tổ trưởng (15–25 triệu)' },
      lead:      { min: 25_000_000, max: 40_000_000, label: 'Trưởng bộ môn / Quản lý đào tạo (25–40 triệu)' },
      executive: { min: 40_000_000, max: 80_000_000, label: 'Hiệu trưởng / Giám đốc Học viện (40–80 triệu+)' },
    },
    painPoints: {
      entry:     'Lương giáo viên mới thấp nhất trong các ngành đòi hỏi bằng đại học — 5–7 triệu sau 4 năm học. Áp lực soạn giáo án, chấm bài, họp hành liên tục ngoài giờ dạy.',
      mid:       'Lương tăng chậm theo thâm niên, không theo năng lực. Giáo viên giỏi và giáo viên trung bình nhận lương gần như nhau trong hệ thống công lập.',
      senior:    'Ceiling 20–22 triệu ở trường công dù có 10–15 năm kinh nghiệm. Nhiều giáo viên giỏi đang bị "giam" bởi hệ thống ngạch bậc cứng nhắc.',
      lead:      'Tổ trưởng/Trưởng bộ môn phải làm thêm quản lý hành chính nhưng phụ cấp không đáng kể. Áp lực từ cả giáo viên lẫn ban giám hiệu.',
      executive: 'Hiệu trưởng trường công bị ràng buộc bởi quy định nhà nước. Cơ hội thực sự ở hệ thống trường tư, quốc tế, hoặc tự xây trung tâm.',
    },
    opportunities: {
      entry:     'Trường quốc tế và trung tâm tiếng Anh trả 12–20 triệu cho giáo viên mới có chứng chỉ IELTS 7.0+ hoặc CELTA/DELTA.',
      mid:       'Xây khoá học online trên Edumall/Kyna/YouTube — thu nhập thụ động 5–20 triệu/tháng song song lương chính.',
      senior:    'Corporate training và L&D (Learning & Development) tại doanh nghiệp trả 25–40 triệu — cao hơn trường học 50–100%.',
      lead:      'Xây trung tâm đào tạo hoặc edtech startup — thu nhập 50–150 triệu/tháng với đúng mô hình.',
      executive: 'Edtech founder, education consultant quốc tế, hoặc advisory cho hệ thống giáo dục — mô hình thu nhập không giới hạn.',
    },
    nextMilestone: {
      entry:     'Lấy chứng chỉ IELTS 7.0+ hoặc CELTA, apply trường quốc tế → tăng lương 2–3x ngay lập tức.',
      mid:       'Quay 5–10 video bài giảng, đăng lên Edumall/YouTube → xây thu nhập thụ động 3–10 triệu/tháng.',
      senior:    'Chuyển sang corporate training hoặc L&D tại doanh nghiệp → tăng lương 50–100% so với trường học.',
      lead:      'Xây trung tâm đào tạo nhỏ hoặc franchise giáo dục → target 50–100 triệu/tháng.',
      executive: 'Xây edtech platform, advisory cho Bộ GD&ĐT hoặc tổ chức quốc tế → tối đa hóa thu nhập và impact.',
    },
    marketInsight: 'Edtech Việt Nam tăng trưởng 20%/năm. Giáo viên chuyển sang corporate training hoặc online course có thể tăng thu nhập 2–5x so với dạy trường truyền thống.',
    topSkillGap: 'Instructional Design + E-learning Production + Corporate Training facilitation — 3 kỹ năng giúp giáo viên thoát khỏi mức lương thấp của hệ thống trường học truyền thống.',
    careerLadder: [
      { band: 'entry', title: 'Giáo viên mới / Trợ giảng', salary: '5–8 triệu', duration: '12–18 tháng',
        unlock: ['Lấy IELTS 7.0+ hoặc CELTA — vé vào trường quốc tế, tăng lương 2-3x ngay', 'Quay 3-5 video bài giảng ngắn, đăng YouTube — test xem nội dung của mình có người xem không', 'Dạy thêm 2-3 học sinh tư — xây kết quả thật và xin lời nhận xét thật từ học viên/phụ huynh'],
        warning: 'Bẫy: Ở lại trường công vì "ổn định". Trường quốc tế trả 12-20 triệu cho giáo viên mới có IELTS 7.0+ — sự ổn định đó đang cost bạn 5-12 triệu/tháng.' },
      { band: 'mid', title: 'Giáo viên có kinh nghiệm', salary: '8–15 triệu', duration: '2–3 năm',
        unlock: ['Launch 1 online course trên Edumall/Kyna với ít nhất 50 học viên enrolled', 'Xây curriculum cho 1 chương trình học hoàn chỉnh — không chỉ dạy theo giáo án có sẵn', 'Tiếp cận 1 doanh nghiệp để dạy corporate training — thử nghiệm model mới'],
        warning: 'Bẫy: Lương tăng chậm theo thâm niên, không theo năng lực. Giáo viên giỏi và giáo viên trung bình nhận lương gần như nhau trong hệ thống công lập.' },
      { band: 'senior', title: 'Giáo viên Senior / Tổ trưởng', salary: '15–25 triệu', duration: '2–3 năm',
        unlock: ['Chuyển sang corporate training tại doanh nghiệp — lương 25-40 triệu, cao hơn trường học 50-100%', 'Xây online course portfolio với 200+ học viên và 4.5+ rating', 'Establish personal brand: LinkedIn, YouTube, hoặc podcast về chuyên môn'],
        warning: 'Bẫy: Ceiling 20-22 triệu ở trường công dù có 10-15 năm kinh nghiệm. Corporate training là escape route rõ ràng nhất.' },
      { band: 'lead', title: 'Trưởng bộ môn / Quản lý đào tạo', salary: '25–40 triệu', duration: '3–5 năm',
        unlock: ['Xây trung tâm đào tạo nhỏ hoặc franchise giáo dục', 'Build L&D department cho doanh nghiệp 200+ nhân sự', 'Establish curriculum IP — content bạn tạo ra phải là tài sản của bạn, không phải của trường'],
        warning: 'Bẫy: Xây system cho người khác mà không có equity. Nếu bạn đang build training program tạo ra doanh thu cho tổ chức — negotiate revenue share.' },
      { band: 'executive', title: 'Hiệu trưởng / Giám đốc Học viện', salary: '40–80 triệu+', duration: 'Không giới hạn',
        unlock: ['Xây edtech platform hoặc chuỗi trung tâm đào tạo', 'Attract VC funding cho edtech startup', 'Advisory cho Bộ GD&ĐT hoặc tổ chức giáo dục quốc tế'],
        warning: 'Bẫy: Edtech VN đang attract VC funding. Equity trước Series A = potential 10-50x return. Đừng chỉ nhận lương khi bạn đang build institution.' },
    ],
  },

  // ── 7. SẢN XUẤT / KỸ THUẬT ──────────────────────────────────────────────
  ENGINEERING: {
    jobGroup: 'Sản xuất / Kỹ thuật',
    keywords: [
      'kỹ sư cơ khí', 'kỹ sư điện', 'kỹ sư xây dựng', 'sản xuất',
      'manufacturing', 'mechanical engineer', 'electrical engineer',
      'civil engineer', 'structural', 'qc', 'qa', 'quality control',
      'quality assurance', 'process engineer', 'production', 'lean',
      'six sigma', 'maintenance', 'bảo trì', 'vận hành', 'operations',
      'supply chain', 'logistics', 'procurement', 'warehouse',
      'công nhân', 'công nhân vận hành', 'factory worker', 'machine operator',
      'production operator', 'operator', 'bình dương', 'binh duong',
    ],
    salaryBands: {
      entry:     { min:  7_000_000, max: 12_000_000, label: 'Kỹ sư / Nhân viên Kỹ thuật mới (7–12 triệu)' },
      mid:       { min: 12_000_000, max: 20_000_000, label: 'Kỹ sư có kinh nghiệm (12–20 triệu)' },
      senior:    { min: 20_000_000, max: 35_000_000, label: 'Senior Engineer / Tổ trưởng (20–35 triệu)' },
      lead:      { min: 35_000_000, max: 60_000_000, label: 'Trưởng phòng Kỹ thuật / Plant Manager (35–60 triệu)' },
      executive: { min: 60_000_000, max: 100_000_000, label: 'Giám đốc Kỹ thuật / COO (60–100 triệu+)' },
    },
    painPoints: {
      entry:     'Lương kỹ sư mới không cao hơn nhiều so với lao động phổ thông, trong khi đào tạo 4–5 năm. Môi trường nhà máy áp lực, ca kíp, ít cơ hội học hỏi mới.',
      mid:       'Bẫy "chuyên gia kỹ thuật" — giỏi về kỹ thuật nhưng không có kỹ năng quản lý nên khó thăng tiến. Lương tăng chậm theo thâm niên.',
      senior:    'Ceiling 30–35 triệu nếu không có chứng chỉ quốc tế (PMP, Six Sigma Black Belt) hoặc không chuyển sang FDI/MNC.',
      lead:      'Plant Manager/Trưởng phòng kỹ thuật chịu trách nhiệm an toàn lao động, năng suất, chất lượng — áp lực rất lớn với lương không tương xứng.',
      executive: 'COO/Giám đốc kỹ thuật ở công ty nội địa thường bị giới hạn bởi ngân sách đầu tư công nghệ. Cơ hội thực sự ở FDI, MNC, hoặc tự xây doanh nghiệp.',
    },
    opportunities: {
      entry:     'FDI và MNC trả cao hơn công ty nội địa 30–50% cho cùng vị trí. Chứng chỉ tiếng Anh + kỹ thuật là vé vào FDI.',
      mid:       'Lean Manufacturing + Six Sigma Green Belt là kỹ năng khan hiếm, tăng lương 30–50%. Automation/PLC programming đang được trả rất cao.',
      senior:    'Chứng chỉ PMP + Six Sigma Black Belt mở cửa vào MNC với lương 35–50 triệu. Hoặc chuyển sang project management.',
      lead:      'Operations excellence consulting — tư vấn cho nhà máy tối ưu quy trình, thu nhập 60–120 triệu/tháng.',
      executive: 'Industrial automation startup, manufacturing consultant quốc tế, hoặc xây doanh nghiệp sản xuất — mô hình thu nhập không giới hạn.',
    },
    nextMilestone: {
      entry:     'Lấy chứng chỉ tiếng Anh B2+ và 1 chứng chỉ kỹ thuật quốc tế, apply FDI → tăng lương 30–50%.',
      mid:       'Hoàn thành Six Sigma Green Belt, dẫn dắt 1 dự án cải tiến quy trình tiết kiệm 10%+ chi phí → apply senior.',
      senior:    'Lấy PMP + Six Sigma Black Belt, quản lý dự án 10 tỷ+ → chuẩn bị Plant Manager role.',
      lead:      'Xây hệ thống KPI cho toàn nhà máy, đạt OEE 85%+ → target COO hoặc consulting.',
      executive: 'Xây doanh nghiệp sản xuất hoặc consulting firm, advisory cho FDI mới vào VN → tối đa hóa thu nhập.',
    },
    marketInsight: 'FDI vào Việt Nam tăng mạnh 2025–2026, tạo ra nhu cầu lớn cho kỹ sư có kinh nghiệm. Kỹ sư biết tiếng Anh + automation đang được trả cao hơn 40–60% so với kỹ sư truyền thống.',
    topSkillGap: 'Industrial Automation (PLC/SCADA) + Lean Six Sigma + tiếng Anh kỹ thuật — 3 kỹ năng tạo ra khoảng cách lương lớn nhất trong ngành sản xuất Việt Nam.',
    careerLadder: [
      { band: 'entry', title: 'Kỹ sư / Nhân viên Kỹ thuật mới', salary: '7–12 triệu', duration: '12–18 tháng',
        unlock: ['Lấy chứng chỉ tiếng Anh B2+ — vé vào FDI, tăng lương 30-50% ngay', 'Học PLC programming cơ bản (Siemens S7 hoặc Allen Bradley) — kỹ năng khan hiếm nhất', 'Apply vào FDI/MNC — cùng vị trí nhưng lương cao hơn công ty nội địa 30-50%'],
        warning: 'Bẫy: Ở lại công ty nội địa vì "gần nhà". FDI trả cao hơn 30-50% cho cùng vị trí — sự tiện lợi đó đang cost bạn 3-5 triệu/tháng.' },
      { band: 'mid', title: 'Kỹ sư có kinh nghiệm', salary: '12–20 triệu', duration: '2–3 năm',
        unlock: ['Hoàn thành Six Sigma Green Belt — chứng chỉ này tăng lương 30-50%', 'Dẫn dắt 1 dự án cải tiến quy trình tiết kiệm 10%+ chi phí — có số liệu cụ thể', 'Học automation: PLC, SCADA, hoặc robot programming — đây là future-proof skill'],
        warning: 'Bẫy: Giỏi kỹ thuật nhưng không có kỹ năng quản lý = khó thăng tiến. Sau 3 năm mid, phải chọn: IC track (chuyên sâu kỹ thuật) hoặc management track.' },
      { band: 'senior', title: 'Senior Engineer / Tổ trưởng', salary: '20–35 triệu', duration: '2–4 năm',
        unlock: ['Lấy PMP + Six Sigma Black Belt — trifecta mở cửa MNC', 'Quản lý dự án 10 tỷ+ từ đầu đến cuối', 'Xây technical documentation và training material cho team'],
        warning: 'Bẫy: Ceiling 30-35 triệu nếu không có chứng chỉ quốc tế hoặc không chuyển sang FDI/MNC. Operations excellence consulting = 60-120 triệu/tháng.' },
      { band: 'lead', title: 'Trưởng phòng Kỹ thuật / Plant Manager', salary: '35–60 triệu', duration: '3–5 năm',
        unlock: ['Xây hệ thống KPI cho toàn nhà máy, đạt OEE 85%+', 'Implement Lean Manufacturing hoặc TPM program', 'Build và manage engineering team 10-20 người'],
        warning: 'Bẫy: Plant Manager chịu trách nhiệm an toàn lao động, năng suất, chất lượng — áp lực rất lớn với lương không tương xứng. Operations consulting là exit strategy tốt nhất.' },
      { band: 'executive', title: 'Giám đốc Kỹ thuật / COO', salary: '60–100 triệu+', duration: 'Không giới hạn',
        unlock: ['Lead digital transformation / Industry 4.0 cho nhà máy', 'Build manufacturing consulting firm hoặc advisory cho FDI mới vào VN', 'Có network với industrial automation vendors và FDI investors'],
        warning: 'Bẫy: COO ở công ty nội địa bị giới hạn bởi ngân sách đầu tư công nghệ. Industrial automation startup = massive value creation opportunity.' },
    ],
  },

  // ── 8. THIẾT KẾ / SÁNG TẠO ──────────────────────────────────────────────
  DESIGN: {
    jobGroup: 'Thiết kế / Sáng tạo',
    keywords: [
      'designer', 'thiết kế', 'ux', 'ui', 'ux/ui', 'graphic', 'creative',
      'architect', 'kiến trúc', 'interior', 'nội thất', 'motion',
      'video editor', 'animator', 'illustrator', 'art director',
      'product designer', 'design lead', 'creative director',
      'photography', 'nhiếp ảnh', '3d', 'cad',
    ],
    salaryBands: {
      entry:     { min:  7_000_000, max: 12_000_000, label: 'Designer mới / Junior (7–12 triệu)' },
      mid:       { min: 12_000_000, max: 22_000_000, label: 'Designer có kinh nghiệm (12–22 triệu)' },
      senior:    { min: 22_000_000, max: 40_000_000, label: 'Senior Designer / Design Lead (22–40 triệu)' },
      lead:      { min: 40_000_000, max: 70_000_000, label: 'Head of Design / Art Director (40–70 triệu)' },
      executive: { min: 65_000_000, max: 120_000_000, label: 'Creative Director / VP Design (65–120 triệu+)' },
    },
    painPoints: {
      entry:     'Designer mới bị undervalued nghiêm trọng ở Việt Nam — làm nhiều nhưng lương thấp. Nhiều công ty coi design là "vẽ vời" thay vì chiến lược kinh doanh.',
      mid:       'Bẫy "pixel pusher" — thực thi tốt nhưng không được tham gia vào quyết định sản phẩm. Lương 15–18 triệu sau 3–4 năm là dấu hiệu đang bị undercompensated.',
      senior:    'Ceiling 30–35 triệu nếu không chuyển sang product design hoặc không có portfolio quốc tế. Thị trường remote trả gấp 3–5x cho senior UX/product designer.',
      lead:      'Head of Design phải cân bằng giữa creative vision và business metrics — áp lực kép. Nhiều design lead đang làm việc của VP nhưng nhận lương của senior.',
      executive: 'Creative Director ở agency Việt Nam thường bị giới hạn bởi budget client nhỏ. Cơ hội thực sự ở MNC, tech company, hoặc tự xây studio/agency.',
    },
    opportunities: {
      entry:     'UX/Product design đang trả cao hơn graphic design 50–80%. Chứng chỉ Google UX Design hoặc portfolio Figma tốt là vé vào tech company.',
      mid:       'Remote design job cho công ty nước ngoài — tăng thu nhập 3–5x. Hoặc freelance cho agency quốc tế qua Upwork/Toptal.',
      senior:    'Product design tại tech startup + equity, hoặc design consultant — thu nhập 50–100 triệu/tháng.',
      lead:      'Design system leadership, design ops — role mới nổi tại MNC và tech company lớn, lương 60–100 triệu.',
      executive: 'Xây design studio/agency, advisory cho startup, hoặc remote Creative Director cho MNC — mô hình thu nhập không giới hạn.',
    },
    nextMilestone: {
      entry:     'Xây portfolio 3–5 case study UX có user research + metrics → apply product designer role tăng lương 50–80%.',
      mid:       'Dẫn dắt 1 design sprint, đo lường impact bằng số (tăng conversion X%, giảm drop-off Y%) → apply senior.',
      senior:    'Xây design system cho toàn sản phẩm, mentor 2–3 junior → chuẩn bị Head of Design role.',
      lead:      'Xây design culture, hiring process, OKR cho design team → target Creative Director hoặc VP Design.',
      executive: 'Xây studio/agency, speak tại design conference, publish case study → tăng giá trị advisory và remote role.',
    },
    marketInsight: 'UX/Product design đang được trả cao hơn graphic design 50–80% tại Việt Nam. Designer biết đo lường business impact đang được săn đón mạnh nhất bởi tech company và startup.',
    topSkillGap: 'UX Research + Design Systems + Business Metrics (conversion, retention) — kỹ năng chuyển từ "làm đẹp" sang "tạo ra giá trị kinh doanh đo được" là yếu tố tăng lương nhanh nhất.',
    careerLadder: [
      { band: 'entry', title: 'Designer mới / Junior', salary: '7–12 triệu', duration: '12–18 tháng',
        unlock: ['Xây portfolio 3-5 case study UX có user research + metrics (không chỉ mockup đẹp)', 'Học Figma đến mức proficient — components, auto layout, prototyping', 'Apply vào tech company/startup — lương cao hơn agency 50-80%'],
        warning: 'Bẫy: Portfolio chỉ có mockup đẹp mà không có user research và metrics. "Design của em tăng X% conversion" > "design của em đẹp".' },
      { band: 'mid', title: 'Designer có kinh nghiệm', salary: '12–22 triệu', duration: '2–3 năm',
        unlock: ['Dẫn dắt 1 design sprint end-to-end: research → prototype → test → measure', 'Xây design system được engineer dùng — đây là leverage lớn nhất của designer', 'Đo được business impact: task completion rate, conversion rate, NPS improvement'],
        warning: 'Bẫy: Pixel pusher — thực thi tốt nhưng không được tham gia vào quyết định sản phẩm. Nếu không có seat at the table sau 3 năm, nhảy sang product-focused company.' },
      { band: 'senior', title: 'Senior Designer / Design Lead', salary: '22–40 triệu', duration: '2–3 năm',
        unlock: ['Own product design end-to-end cho 1 product có user thực', 'Mentor 2-3 junior designer và establish design review process', 'Present design strategy lên C-level bằng ngôn ngữ business metrics'],
        warning: 'Bẫy: Ceiling 30-35 triệu nếu không chuyển sang product design hoặc không có portfolio quốc tế. Remote design job USD = gấp 3-5x lương VN.' },
      { band: 'lead', title: 'Head of Design / Art Director', salary: '40–70 triệu', duration: '3–5 năm',
        unlock: ['Build design team và establish design culture', 'Align design OKR với business OKR — biết nói ngôn ngữ revenue', 'Xây design ops: process, tools, documentation, hiring bar'],
        warning: 'Bẫy: Head of Design đang làm việc của VP Product nhưng nhận lương của senior. Nếu không có equity ở startup — negotiate hoặc move on.' },
      { band: 'executive', title: 'Creative Director / VP Design', salary: '65–120 triệu+', duration: 'Không giới hạn',
        unlock: ['Own brand equity và product design strategy ở company level', 'Build design studio/agency hoặc remote Creative Director cho MNC', 'Có network với tech investors và product leaders'],
        warning: 'Bẫy: Creative Director ở agency VN bị giới hạn bởi budget client nhỏ. Remote Creative Director cho MNC = 3-5x lương VN với cùng skill set.' },
    ],
  },

  // ── FALLBACK ─────────────────────────────────────────────────────────────
  FALLBACK: {
    jobGroup: 'Thị trường lao động chung',
    keywords: [],
    salaryBands: {
      entry:     { min:  6_000_000, max: 10_000_000, label: 'Nhân viên mới (6–10 triệu)' },
      mid:       { min: 10_000_000, max: 18_000_000, label: 'Nhân viên có kinh nghiệm (10–18 triệu)' },
      senior:    { min: 18_000_000, max: 30_000_000, label: 'Chuyên viên Senior (18–30 triệu)' },
      lead:      { min: 30_000_000, max: 55_000_000, label: 'Trưởng phòng / Team Lead (30–55 triệu)' },
      executive: { min: 55_000_000, max: 120_000_000, label: 'Giám đốc / C-level (55–120 triệu+)' },
    },
    painPoints: {
      entry:     'Lương entry thấp hơn kỳ vọng sau nhiều năm học tập. Thiếu định hướng rõ ràng để tăng thu nhập nhanh trong 12–24 tháng đầu.',
      mid:       'Bẫy comfort zone — thu nhập đủ sống nhưng không đủ để tích lũy tài sản. Thiếu kỹ năng đàm phán lương và định vị giá trị bản thân.',
      senior:    'Ceiling lương rõ ràng nếu không có kỹ năng quản lý hoặc chuyên môn đặc thù. Nhiều senior đang bị undercompensated 20–30% so với thị trường.',
      lead:      'Trách nhiệm tăng nhưng lương không tăng tương xứng. Thiếu kỹ năng quản lý chiến lược và tư duy P&L.',
      executive: 'C-level ở công ty nội địa thường bị giới hạn bởi quy mô và tư duy của chủ doanh nghiệp. Cơ hội thực sự ở MNC, startup tăng trưởng nhanh, hoặc tự kinh doanh.',
    },
    opportunities: {
      entry:     'Kỹ năng dùng công cụ năng suất hiện đại + tiếng Anh là combo tăng lương nhanh nhất hiện tại, bất kể ngành nghề.',
      mid:       'Chuyên môn hóa sâu vào 1 lĩnh vực cụ thể + kỹ năng quản lý dự án → thoát bẫy lương trung bình.',
      senior:    'Leadership skills + data-driven decision making → mở cửa vào management track với lương 40–60 triệu.',
      lead:      'P&L ownership + strategic thinking → C-suite track hoặc tự kinh doanh.',
      executive: 'Advisory, board member, hoặc fractional executive — mô hình thu nhập linh hoạt và không giới hạn.',
    },
    nextMilestone: {
      entry:     'Xác định 1 kỹ năng chuyên biệt để phát triển sâu, lấy 1 chứng chỉ liên quan → apply mid-level trong 12 tháng.',
      mid:       'Dẫn dắt 1 dự án có impact đo được bằng số, học kỹ năng quản lý cơ bản → apply senior trong 12 tháng.',
      senior:    'Mentor 2–3 junior, xây quy trình cho team, đo lường impact → chuẩn bị lead role.',
      lead:      'Xây team từ đầu, đạt KPI team 3 quý liên tiếp, học tư duy chiến lược → target C-suite.',
      executive: 'Xây mạng lưới advisory, tham gia board, hoặc fractional role → tối đa hóa thu nhập và ảnh hưởng.',
    },
    marketInsight: 'Thị trường lao động Việt Nam 2026 đang tăng trưởng mạnh, lương tăng trung bình 8–10%/năm. Người biết dùng công cụ năng suất hiện đại và có kỹ năng tiếng Anh đang được trả cao hơn 30–50% so với mặt bằng chung.',
    topSkillGap: 'Năng lực dùng công cụ năng suất hiện đại + tiếng Anh giao tiếp + kỹ năng đàm phán lương — 3 kỹ năng nền tảng tạo ra khoảng cách thu nhập lớn nhất bất kể ngành nghề.',
    careerLadder: [
      { band: 'entry', title: 'Nhân viên mới', salary: '6–10 triệu', duration: '12–18 tháng',
        unlock: ['Xác định 1 kỹ năng chuyên biệt để phát triển sâu — đừng học dàn trải', 'Lấy 1 chứng chỉ liên quan đến ngành — bất kỳ chứng chỉ nào cũng tốt hơn không có', 'Học cách dùng các công cụ hỗ trợ công việc để tăng năng suất 2-3x trong công việc hiện tại'],
        warning: 'Bẫy: Làm đúng việc được giao mà không chủ động học thêm. Sau 2 năm, người học thêm sẽ nhận lương gấp đôi người chỉ làm đủ việc.' },
      { band: 'mid', title: 'Nhân viên có kinh nghiệm', salary: '10–18 triệu', duration: '2–3 năm',
        unlock: ['Dẫn dắt 1 dự án nhỏ có impact đo được bằng số', 'Học kỹ năng quản lý cơ bản: planning, delegation, feedback', 'Xây personal brand trong ngành: LinkedIn, tham gia community, speak tại meetup nhỏ'],
        warning: 'Bẫy: Comfort zone — thu nhập đủ sống nhưng không đủ tích lũy. Nếu không có kỹ năng quản lý sau 3 năm mid, bạn sẽ bị junior mới vào vượt qua.' },
      { band: 'senior', title: 'Chuyên viên Senior', salary: '18–30 triệu', duration: '2–4 năm',
        unlock: ['Mentor 2-3 junior và xây quy trình cho team', 'Đo lường impact của mình bằng số: tiết kiệm X giờ, tăng Y% efficiency', 'Học tư duy chiến lược: hiểu được business model của công ty đang làm'],
        warning: 'Bẫy: Ceiling lương rõ ràng nếu không có kỹ năng quản lý hoặc chuyên môn đặc thù. Nhiều senior đang bị undercompensated 20-30% so với thị trường.' },
      { band: 'lead', title: 'Trưởng phòng / Team Lead', salary: '30–55 triệu', duration: '3–5 năm',
        unlock: ['Xây team từ đầu: hire, train, establish KPI', 'Own P&L của 1 bộ phận hoặc project lớn', 'Học tư duy chiến lược: OKR, business strategy, stakeholder management'],
        warning: 'Bẫy: Trách nhiệm tăng nhưng lương không tăng tương xứng. Nếu đang làm việc của Director mà nhận lương Manager — negotiate hoặc nhảy.' },
      { band: 'executive', title: 'Giám đốc / C-level', salary: '55–120 triệu+', duration: 'Không giới hạn',
        unlock: ['Xây mạng lưới advisory, tham gia board, hoặc fractional role', 'Own company-level strategy và P&L', 'Có track record: business bạn lead đang có revenue và growth'],
        warning: 'Bẫy: C-level ở công ty nội địa thường bị giới hạn bởi quy mô và tư duy chủ. Fractional executive cho 2-3 startup = 150-300 triệu/tháng với lịch linh hoạt.' },
    ],
  },
}
