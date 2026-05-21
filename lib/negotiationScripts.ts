/**
 * Kịch bản đàm phán lương theo ngành + band — mỗi ngành khác nhau hoàn toàn.
 * Dùng trong PremiumSection Chương 3.
 */

import type { SalaryBand } from './careerCompassData';

export interface NegotiationScript {
  interview: string; // Khi phỏng vấn công ty mới
  raise: string;     // Khi xin tăng lương
  tip: string;       // Mẹo đặc thù ngành
}

// Fallback generic nếu ngành chưa có script riêng
const GENERIC: Record<SalaryBand, NegotiationScript> = {
  entry: {
    interview: 'Em tìm hiểu qua báo cáo VSPI rằng dải lương chuẩn cho vị trí này ở mức {bandRange}. Em tin rằng với khả năng học nhanh và tinh thần chủ động, em có thể đóng góp giá trị tương xứng với mức {nextBandMin}. Anh/chị có thể chia sẻ thêm về ngân sách vị trí này không ạ?',
    raise: 'Em có tham khảo dữ liệu thị trường — với kinh nghiệm hiện tại và những kết quả em đạt được, mức lương em đang thấp hơn trung vị ngành khoảng {salaryGap}. Em đề xuất điều chỉnh lên {nextBandMin} để phù hợp với giá trị em mang lại.',
    tip: 'Mẹo: Đừng nêu số trước. Hỏi "Ngân sách công ty dành cho vị trí này là bao nhiêu?" rồi mới anchor.',
  },
  mid: {
    interview: 'Theo dữ liệu VSPI 2026, mức lương chuẩn cho vị trí này với 3-5 năm kinh nghiệm dao động {bandRange}. Với thành tích cụ thể em đã đạt được ở công ty trước, em kỳ vọng mức {nextBandMin}. Anh/chị thấy hợp lý không?',
    raise: 'Em đã có 6 tháng đóng góp ổn định — cụ thể là [nêu 1-2 thành tích có số]. Theo thị trường, vị trí của em đang ở dải {bandRange}. Em đề xuất mức {nextBandMin} để phản ánh đúng giá trị hiện tại.',
    tip: 'Mẹo: Luôn mang theo 1 con số cụ thể (tiết kiệm X giờ, tăng Y% doanh thu). Cảm tính = bị từ chối.',
  },
  senior: {
    interview: 'Với 5+ năm kinh nghiệm và track record cụ thể, em nhìn vào dải {bandRange} cho vị trí này. Em quan tâm đến tổng package (base + bonus + equity nếu có) hơn chỉ base salary. Công ty có thể chia sẻ cấu trúc comp?',
    raise: 'Em muốn trao đổi thẳng thắn: dữ liệu thị trường cho thấy vị trí em đang gánh vác có dải lương {bandRange}. Em đang nhận {salary}, thấp hơn {salaryGap} so với benchmark. Em đề xuất điều chỉnh kèm kế hoạch đóng góp cụ thể cho Q tiếp theo.',
    tip: 'Mẹo: Senior không xin tăng lương — Senior negotiate package. Hỏi về equity, RSU, signing bonus, remote flexibility.',
  },
  lead: {
    interview: 'Ở level này, em quan tâm đến impact và autonomy hơn base salary. Tuy nhiên, em cũng cần đảm bảo comp phản ánh đúng trách nhiệm. Market rate cho role này là {bandRange}. Em kỳ vọng total comp ở mức {nextBandMin}+.',
    raise: 'Em muốn discuss career progression: em đang lead team X người, deliver Y project, nhưng comp chưa phản ánh scope. Thị trường đang trả {bandRange} cho role tương đương. Em đề xuất review lên {nextBandMin}.',
    tip: 'Mẹo: Ở level Lead, đừng chỉ nói về mình — nói về team bạn build, process bạn tạo, revenue bạn enable.',
  },
  executive: {
    interview: 'Ở C-level, tôi quan tâm đến vision của Board và equity structure hơn base salary. Total comp tôi nhìn vào bao gồm equity, bonus, và authority. Xin hỏi cấu trúc ownership và decision-making power cho role này?',
    raise: 'Tôi muốn propose một structure mới: base giữ nguyên, nhưng performance bonus tied to [specific metric] và equity vesting schedule. Đây là cách align incentive giữa tôi và công ty dài hạn.',
    tip: 'Mẹo: Executive không negotiate lương — negotiate equity, vesting, board seat, và exit clause.',
  },
};

// ── Kịch bản theo ngành cụ thể ──────────────────────────────────────────────
const IT_SCRIPTS: Record<SalaryBand, NegotiationScript> = {
  entry: {
    interview: 'Em có portfolio thực chiến trên GitHub với [X] project, bao gồm [tên project có user thực]. Theo khảo sát ITviec 2026, Fresher có portfolio + tiếng Anh tốt đang nhận {bandRange}. Em kỳ vọng mức {nextBandMin} — anh/chị review portfolio em nhé?',
    raise: 'Trong 6 tháng qua em đã tự học và ship [tên feature]. Em cũng đang contribute vào code review cho junior khác. Theo ITviec, mid-level cùng stack đang nhận {nextBandMin}. Em đề xuất tăng lên mức đó.',
    tip: 'Mẹo IT Fresher: Portfolio > Bằng cấp. Mang GitHub URL vào buổi phỏng vấn, show code trực tiếp.',
  },
  mid: {
    interview: 'Em đã ship [X] feature end-to-end, viết technical doc cho team, và mentor 1 junior. Theo TopDev + ITviec 2026, mid-level [stack của bạn] đang nhận {bandRange}. Em target mức {nextBandMin} vì em đã làm được việc của senior ở scope nhỏ.',
    raise: 'Em muốn discuss: em đang own [tên module/service], on-call rotation, và đã giảm latency API X%. Theo thị trường, role này đáng {bandRange}. Em đề xuất tăng lên {nextBandMin} kèm clear path lên senior trong 12 tháng.',
    tip: 'Mẹo IT Mid: Nêu technical impact bằng số (giảm X% latency, tăng Y% test coverage, tiết kiệm Z giờ/sprint).',
  },
  senior: {
    interview: 'Em đã architect [tên system], dẫn dắt technical decision cho team [X] người. Em cũng từng present architecture review ở [context]. Với 5+ năm experience, em nhìn vào dải {bandRange} + equity nếu startup. Total comp em kỳ vọng là {nextBandMin}.',
    raise: 'Em muốn nói thẳng: em đang nhận {salary}, thấp hơn benchmark Senior Engineer khoảng {salaryGap}. Trong khi đó em đang own system design, hiring, và mentoring. Em đề xuất {nextBandMin} hoặc em sẽ phải cân nhắc các opportunity khác.',
    tip: 'Mẹo Senior IT: Có backup offer (remote USD hoặc startup). Nói "em có opportunity khác" không phải đe dọa — là thực tế.',
  },
  lead: {
    interview: 'Tôi đã build engineering team từ 3 lên 15 người, establish hiring process, và deliver OKR 3 quý liên tiếp. Ở level Tech Lead/EM, tôi nhìn vào {bandRange} + equity meaningful. Total comp tôi expect là {nextBandMin}+ all-in.',
    raise: 'Team tôi deliver 100% OKR 3 quý liên tiếp, attrition = 0, và tôi đã hire 5 engineer chất lượng. Comp hiện tại chưa phản ánh impact này. Tôi propose {nextBandMin} base + performance bonus tied to team OKR.',
    tip: 'Mẹo Tech Lead: Nói bằng ngôn ngữ business — team output, delivery speed, hiring quality, retention rate.',
  },
  executive: {
    interview: 'Tôi quan tâm đến 3 thứ: equity structure, engineering budget authority, và reporting line. Base salary là secondary. Hãy discuss vision kỹ thuật 3 năm và ownership tôi sẽ có.',
    raise: 'Proposal của tôi: convert 20% base thành equity vesting 4 năm. Đây là cách tôi commit dài hạn và Board cũng benefit từ alignment incentive.',
    tip: 'Mẹo CTO: Đừng negotiate salary — negotiate equity, cap table visibility, và exit clause.',
  },
};

const FINANCE_SCRIPTS: Record<SalaryBand, NegotiationScript> = {
  entry: {
    interview: 'Em vừa pass CPA/đang học ACCA, và có thể chạy được Power BI cho báo cáo tài chính. Theo khảo sát Adecco 2026, nhân viên tài chính có chứng chỉ đang nhận {bandRange}. Em kỳ vọng mức {nextBandMin} — đặc biệt nếu role đòi hỏi OT mùa audit.',
    raise: 'Trong 6 tháng qua em đã tự động hóa 3 báo cáo hàng tuần bằng Excel + Power Query, tiết kiệm team 8 giờ/tuần. Em đề xuất tăng lên {nextBandMin} — phản ánh đúng skill data analytics em đang mang lại.',
    tip: 'Mẹo Tài chính Entry: CPA/ACCA + Power BI = tăng lương 30% ngay. Mang số liệu "tiết kiệm X giờ" vào buổi review.',
  },
  mid: {
    interview: 'Em có 3-5 năm kinh nghiệm trong FP&A/audit, familiar với IFRS và đã lead 1 đợt audit thành công. Market rate cho vị trí này ở fintech/MNC là {bandRange}. Em target {nextBandMin} all-in.',
    raise: 'Em đã dẫn dắt budget planning cho bộ phận, và financial model em xây giúp tiết kiệm 500 triệu chi phí vận hành/năm. Với benchmark thị trường {bandRange}, em đề xuất điều chỉnh lên {nextBandMin}.',
    tip: 'Mẹo Finance Mid: Nêu số tiền bạn giúp công ty tiết kiệm/tránh rủi ro — đây là ngôn ngữ CFO hiểu nhất.',
  },
  senior: {
    interview: 'Em đã lead M&A due diligence / IPO preparation / FP&A strategy cho company [quy mô X]. Em target {bandRange} + performance bonus tied to deal completion.',
    raise: 'Financial model em xây đã được Board approve cho chiến lược 3 năm. Em đang nhận {salary} — thấp hơn market {salaryGap}. Propose {nextBandMin} + bonus tied to P&L target.',
    tip: 'Mẹo Finance Senior: M&A + IPO experience = golden ticket. Nêu deal size bạn từng touch.',
  },
  lead: {
    interview: 'Tôi đã build Finance team và establish SOX/internal control framework. Comp tôi nhìn vào: {bandRange} base + bonus 20-30% tied to P&L. Equity nếu startup.',
    raise: 'Team tôi deliver clean audit 2 năm liên tiếp, cost reduction 15% YoY. Propose CFO track comp: {nextBandMin} + equity.',
    tip: 'Mẹo Finance Lead: Nói bằng P&L impact — cost reduction %, cash flow improvement, audit risk eliminated.',
  },
  executive: {
    interview: 'Ở CFO level tôi quan tâm: equity, board seat, và authority over capital allocation. Base secondary. Hãy discuss fundraising plan và my role trong investor relations.',
    raise: 'Propose restructure comp: reduce base 10% → convert equity vesting. Tôi muốn skin in the game và Board nên muốn CFO aligned dài hạn.',
    tip: 'Mẹo CFO: Đàm phán equity trước ngày IPO/fundraise. Sau đó giá equity sẽ khác hoàn toàn.',
  },
};

const MARKETING_SCRIPTS: Record<SalaryBand, NegotiationScript> = {
  entry: {
    interview: 'Em có case study cụ thể: campaign [X] em chạy đã tăng conversion Y% và giảm CAC Z%. Em biết đo lường ROI bằng GA4 + Meta Pixel — không chỉ sáng tạo content. Market rate cho performance marketer entry là {bandRange}. Em kỳ vọng {nextBandMin}.',
    raise: 'Trong Q vừa rồi em đã tăng lead quality 40% bằng cách tối ưu audience targeting. Đây không phải content writer — đây là growth skill. Em đề xuất tăng lên {nextBandMin} phản ánh đúng value measurement-driven.',
    tip: 'Mẹo Marketing Entry: ĐỪNG nói "em viết content" — nói "em tăng X% conversion". Có số = có quyền.',
  },
  mid: {
    interview: 'Em đã quản lý budget 200-500 triệu/tháng ads spend, đạt ROAS 4x consistently. Em familiar với funnel optimization, A/B testing, và marketing automation. Target: {bandRange}. Expect: {nextBandMin}.',
    raise: 'Campaign Q vừa rồi em deliver: revenue attribution 2 tỷ, CAC giảm 30%, pipeline tăng 50%. Với impact này, em propose {nextBandMin} — hoặc em sẽ cần evaluate các offer đang có.',
    tip: 'Mẹo Marketing Mid: Revenue attribution là vũ khí mạnh nhất. "Em mang về X tỷ doanh thu" > "em chạy ads".',
  },
  senior: {
    interview: 'Em đã build và lead marketing team [X] người, own P&L marketing budget [Y tỷ/năm], và deliver pipeline [Z tỷ]. Ở level Head of Marketing, em nhìn vào {bandRange} + bonus tied to revenue.',
    raise: 'Marketing team em build đang generate 40% total pipeline. Đó không phải cost center — đó là revenue engine. Comp em cần reflect: {nextBandMin} + performance bonus 20%.',
    tip: 'Mẹo Senior Marketing: Frame marketing as revenue driver, không phải cost center. Nói "revenue generated" không phải "budget spent".',
  },
  lead: {
    interview: 'Tôi đã scale marketing từ 0 → [X] tỷ pipeline, build team [Y] người, establish brand positioning trong thị trường cạnh tranh. Expect: {bandRange} + equity + performance bonus.',
    raise: 'Marketing ORG tôi build đang run autonomous. Revenue attribution: [X] tỷ/năm. Propose CMO comp: {nextBandMin} base + 25% bonus + equity.',
    tip: 'Mẹo Marketing Lead: Ở level này bạn đang bán "đã build machine chạy không cần bạn" — đó là value cao nhất.',
  },
  executive: {
    interview: 'Ở CMO level: equity + board visibility + marketing budget authority. Tôi cần understand unit economics và growth model trước khi discuss comp.',
    raise: 'Propose: keep base flat, increase equity 2x. Tôi muốn comp tied to company growth metrics — nếu marketing drive 50% revenue, comp phải reflect.',
    tip: 'Mẹo CMO: Tie comp to LTV/CAC ratio improvement — đây là metric Board nhìn vào.',
  },
};

// ── Export function lấy script theo ngành + band ─────────────────────────────
const INDUSTRY_SCRIPTS: Record<string, Record<SalaryBand, NegotiationScript>> = {
  IT: IT_SCRIPTS,
  FINANCE: FINANCE_SCRIPTS,
  MARKETING: MARKETING_SCRIPTS,
};

export function getNegotiationScript(
  industryKey: string,
  band: SalaryBand
): NegotiationScript {
  const scripts = INDUSTRY_SCRIPTS[industryKey] || GENERIC;
  return scripts[band] || GENERIC[band];
}

// Helper: thay placeholder trong script bằng số liệu thực
export function fillScript(
  template: string,
  vars: {
    bandRange: string;
    nextBandMin: string;
    salary: string;
    salaryGap: string;
  }
): string {
  return template
    .replace(/\{bandRange\}/g, vars.bandRange)
    .replace(/\{nextBandMin\}/g, vars.nextBandMin)
    .replace(/\{salary\}/g, vars.salary)
    .replace(/\{salaryGap\}/g, vars.salaryGap);
}
