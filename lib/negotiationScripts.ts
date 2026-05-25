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
    raise: 'Propose restructure comp: reduce base 10% → convert equity vesting. Tôi muốn đồng lợi ích dài hạn với Board và chịu trách nhiệm trực tiếp bằng kết quả tài chính.',
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
const SALES_SCRIPTS: Record<SalaryBand, NegotiationScript> = {
  entry: {
    interview: 'Em đã vượt quota 120% trong 2 quý liên tiếp ở công ty trước, với pipeline tự build từ cold outreach. Theo khảo sát Navigos 2026, sales entry có track record nhận {bandRange}. Em kỳ vọng base {nextBandMin} + commission structure rõ ràng — anh/chị có thể chia sẻ OTE plan không?',
    raise: 'Q vừa rồi em close được [X] deal, vượt quota 130%, và tự build thêm [Y] prospect mới cho pipeline. Em đề xuất tăng base lên {nextBandMin} — commission giữ nguyên. Đây là mức phản ánh đúng contribution em mang lại.',
    tip: 'Mẹo Sales Entry: Luôn hỏi OTE (On-Target Earnings) thay vì chỉ base. Base thấp + commission cao = bẫy nếu quota không thực tế.',
  },
  mid: {
    interview: 'Em đã manage key account portfolio [X tỷ ARR], win rate 35%, và average deal size [Y triệu]. Theo thị trường B2B SaaS, mid-level sales nhận {bandRange} OTE. Em target {nextBandMin} base + commission 15-20% on quota.',
    raise: 'Em đã close [X] enterprise deal trong năm, tổng revenue [Y tỷ], và maintain churn rate < 5% cho existing accounts. Với benchmark {bandRange}, em propose {nextBandMin} base + review commission structure.',
    tip: 'Mẹo Sales Mid: Nêu win rate + average deal size + churn rate. Ba số này nói lên tất cả về chất lượng sales của bạn.',
  },
  senior: {
    interview: 'Em đã build và own territory [X tỷ/năm], mentor 3 junior sales, và establish playbook cho team. Ở Senior level, em nhìn vào {bandRange} base + uncapped commission + quarterly bonus. Total OTE expect: {nextBandMin}.',
    raise: 'Team chăm sóc khách hàng của em đã đạt 150% chỉ tiêu quý vừa rồi. Em cũng đã viết bộ hướng dẫn bán hàng giúp nhân sự mới bắt nhịp nhanh hơn 40%. Em đề xuất mức {nextBandMin} base + bậc hoa hồng senior.',
    tip: 'Mẹo Senior Sales: Nếu bạn đang làm việc của Sales Manager (coaching, playbook, forecasting) mà nhận lương Senior — đó là lúc negotiate hoặc nhảy.',
  },
  lead: {
    interview: 'Tôi đã build sales team từ 0 → [X] người, establish quota model, hiring process, và deliver [Y tỷ] ARR. Expect: {bandRange} base + team performance bonus + equity nếu startup.',
    raise: 'Team tôi deliver 120% team quota 3 quý liên tiếp, attrition = 1 người/năm, và tôi đã hire 5 AE chất lượng. Propose Sales Director comp: {nextBandMin} + 25% bonus tied to team ARR.',
    tip: 'Mẹo Sales Lead: Nói bằng ARR, pipeline coverage ratio, và team ramp time. Đây là ngôn ngữ CEO/Board dùng.',
  },
  executive: {
    interview: 'Ở CSO level: equity + revenue target authority + GTM strategy ownership. Base secondary. Hãy discuss ICP, current pipeline health, và my mandate để scale revenue.',
    raise: 'Propose: convert 20% base thành equity + revenue-based bonus. Nếu tôi deliver [X tỷ] ARR, comp tôi nhận phải reflect đúng giá trị đó.',
    tip: 'Mẹo CSO: Negotiate equity trước khi Series A/B. Sau funding round, dilution sẽ thay đổi mọi thứ.',
  },
};

const HEALTHCARE_SCRIPTS: Record<SalaryBand, NegotiationScript> = {
  entry: {
    interview: 'Em vừa hoàn thành chuyên khoa cơ bản và đang apply vào hệ thống tư nhân/quốc tế. Theo khảo sát thị trường y tế 2026, bệnh viện tư trả {bandRange} cho vị trí này — cao hơn 2-3x bệnh viện công. Em kỳ vọng mức {nextBandMin} phản ánh đúng môi trường tư nhân.',
    raise: 'Em đã hoàn thành [X] ca/tuần, không có incident, và bệnh nhân satisfaction score cao. Em đề xuất tăng lên {nextBandMin} — đặc biệt khi em đang on-call thêm [Y] ngày/tháng ngoài giờ hành chính.',
    tip: 'Mẹo Y tế Entry: Bệnh viện tư trả gấp 2-3x bệnh viện công. Nếu đang ở công lập, đây là leverage lớn nhất — "em có offer từ bệnh viện tư".',
  },
  mid: {
    interview: 'Em có chứng chỉ chuyên khoa [X] và đã thực hành [Y] năm. Theo thị trường y tế tư nhân 2026, bác sĩ/dược sĩ có chứng chỉ quốc tế nhận {bandRange}. Em kỳ vọng {nextBandMin} + hỗ trợ phát triển chuyên môn.',
    raise: 'Em đã hoàn thành [X] ca phức tạp thành công, zero adverse event, và đang hướng dẫn thêm 2 intern. Với chứng chỉ [X] vừa lấy, em đề xuất tăng lên {nextBandMin}.',
    tip: 'Mẹo Y tế Mid: Chứng chỉ chuyên khoa quốc tế (MRCP, MRCS, ACLS) = tăng lương 30-50% ngay. Đây là ROI tốt nhất trong ngành y.',
  },
  senior: {
    interview: 'Em đã có [X] năm kinh nghiệm chuyên khoa, từng lead [Y] ca phức tạp, và có publication/conference presentation. Ở level này, em nhìn vào {bandRange} + hỗ trợ mở phòng khám hoặc equity trong chuỗi phòng khám.',
    raise: 'Em đang handle [X] ca/tuần, train [Y] resident, và patient satisfaction score top 10% bệnh viện. Propose {nextBandMin} + performance bonus tied to patient outcome metrics.',
    tip: 'Mẹo Senior Y tế: Nếu bạn đang train resident và handle ca phức tạp mà nhận lương mid — đó là exploitation. Negotiate hoặc mở phòng khám riêng.',
  },
  lead: {
    interview: 'Tôi đã quản lý khoa [X] với [Y] nhân sự, implement protocol mới giảm readmission rate 20%, và maintain JCI accreditation. Expect: {bandRange} + management allowance + equity trong expansion plan.',
    raise: 'Khoa tôi quản lý đạt patient satisfaction 95%, zero sentinel event, và revenue tăng 30% YoY. Propose Medical Director comp: {nextBandMin} + performance bonus tied to department KPI.',
    tip: 'Mẹo Y tế Lead: Nói bằng clinical outcome metrics (readmission rate, complication rate, patient satisfaction) + financial metrics (revenue per bed, cost per case).',
  },
  executive: {
    interview: 'Ở Medical Director/CEO level: equity trong hospital group + P&L authority + clinical governance. Tôi cần understand expansion roadmap và investor structure trước khi discuss comp.',
    raise: 'Propose: base giữ nguyên + equity 2-5% trong entity mới + performance bonus tied to EBITDA. Tôi muốn aligned dài hạn với growth của tổ chức.',
    tip: 'Mẹo Healthcare Executive: Healthcare M&A đang bùng nổ ở VN. Equity trong hospital group trước khi M&A = life-changing money.',
  },
};

const EDUCATION_SCRIPTS: Record<SalaryBand, NegotiationScript> = {
  entry: {
    interview: 'Em có IELTS 7.5 và CELTA — theo thị trường trường quốc tế 2026, giáo viên có chứng chỉ này nhận {bandRange}. Em kỳ vọng {nextBandMin} — cao hơn trường công nhưng phản ánh đúng qualification em có.',
    raise: 'Học sinh của em đã đạt kết quả [X% pass rate / điểm trung bình tăng Y điểm]. Em cũng đã tự xây thêm 2 module bổ trợ ngoài giáo án chuẩn. Đề xuất tăng lên {nextBandMin}.',
    tip: 'Mẹo Giáo dục Entry: IELTS 7.0+ hoặc CELTA = vé vào trường quốc tế, tăng lương 2-3x so với trường công. Đây là ROI nhanh nhất trong ngành giáo dục.',
  },
  mid: {
    interview: 'Em có [X] năm kinh nghiệm, đã xây curriculum cho [Y] khóa học, và student satisfaction score [Z]/5. Em cũng đang chạy thêm online course với [N] enrolled students. Target: {bandRange} — phản ánh đúng cả teaching + content creation.',
    raise: 'Em đã build thêm 1 online course với [X] học viên, tạo passive income cho bản thân và brand cho trường. Đề xuất tăng lên {nextBandMin} + hỗ trợ phát triển thêm course.',
    tip: 'Mẹo Giáo dục Mid: Online course = leverage. Nếu bạn có course đang chạy, đó là proof of concept để negotiate "em có thể build revenue stream mới cho trường".',
  },
  senior: {
    interview: 'Em đã design curriculum cho [X] chương trình, train [Y] giáo viên mới, và đưa [Z] học sinh vào trường top. Ở level này, em nhìn vào {bandRange} + hỗ trợ xây L&D program cho corporate clients.',
    raise: 'Em đã build training program cho [X] doanh nghiệp, revenue [Y triệu/năm] cho trường. Propose {nextBandMin} + revenue share từ corporate training contracts.',
    tip: 'Mẹo Senior Giáo dục: Corporate training trả 25-40 triệu — cao hơn trường học 50-100%. Nếu bạn có thể bring corporate clients, đó là leverage cực mạnh.',
  },
  lead: {
    interview: 'Tôi đã build và scale training center từ [X] → [Y] học viên, establish brand trong thị trường [Z]. Expect: {bandRange} + equity trong expansion hoặc franchise model.',
    raise: 'Center tôi quản lý đạt [X] học viên, NPS [Y], và revenue [Z tỷ/năm]. Propose Academic Director comp: {nextBandMin} + profit sharing.',
    tip: 'Mẹo Giáo dục Lead: Edtech + franchise model = scalable. Nếu bạn đang build system mà không có equity — đó là sai lầm lớn nhất.',
  },
  executive: {
    interview: 'Ở Hiệu trưởng/CEO level: equity + brand ownership + curriculum IP. Tôi cần understand accreditation roadmap và investor plan trước khi discuss comp.',
    raise: 'Propose: convert 15% base thành equity + performance bonus tied to enrollment growth và student outcome. Tôi muốn build institution, không chỉ làm thuê.',
    tip: 'Mẹo Education Executive: Edtech VN đang attract VC funding. Equity trước Series A = potential 10-50x return.',
  },
};

const ENGINEERING_SCRIPTS: Record<SalaryBand, NegotiationScript> = {
  entry: {
    interview: 'Em có chứng chỉ tiếng Anh B2+ và đang học Six Sigma Green Belt. Theo khảo sát FDI 2026, kỹ sư có tiếng Anh + chứng chỉ kỹ thuật nhận {bandRange} — cao hơn 30-50% công ty nội địa. Em kỳ vọng {nextBandMin} phản ánh đúng môi trường FDI/MNC.',
    raise: 'Em đã implement [X] cải tiến quy trình, tiết kiệm [Y giờ/tuần] cho team. Em cũng đang tự học PLC programming ngoài giờ. Đề xuất tăng lên {nextBandMin}.',
    tip: 'Mẹo Kỹ thuật Entry: FDI trả cao hơn nội địa 30-50%. Tiếng Anh + 1 chứng chỉ kỹ thuật quốc tế = vé vào FDI. Đây là bước nhảy lương nhanh nhất.',
  },
  mid: {
    interview: 'Em đã lead [X] dự án cải tiến quy trình, đạt Six Sigma Green Belt, và giảm defect rate [Y]%. Theo thị trường FDI/MNC 2026, kỹ sư có chứng chỉ nhận {bandRange}. Em target {nextBandMin}.',
    raise: 'Dự án Lean em dẫn dắt đã tiết kiệm [X triệu/năm] chi phí vận hành và giảm cycle time [Y]%. Với impact này, em đề xuất tăng lên {nextBandMin}.',
    tip: 'Mẹo Kỹ thuật Mid: Lean Six Sigma + số tiền tiết kiệm cụ thể = ngôn ngữ Plant Manager hiểu. "Em tiết kiệm 500 triệu/năm" > "em làm việc chăm chỉ".',
  },
  senior: {
    interview: 'Em đã manage dự án [X tỷ], đạt PMP + Six Sigma Black Belt, và lead team [Y] kỹ sư. Ở Senior level, em nhìn vào {bandRange} + project bonus tied to delivery milestone.',
    raise: 'Dự án em lead deliver đúng deadline, under budget [X]%, và OEE tăng từ [Y]% lên [Z]%. Propose {nextBandMin} + performance bonus tied to project KPI.',
    tip: 'Mẹo Senior Kỹ thuật: PMP + Black Belt + tiếng Anh = trifecta mở cửa MNC. Nếu có 3 thứ này mà lương dưới 35 triệu — bạn đang bị undervalued nghiêm trọng.',
  },
  lead: {
    interview: 'Tôi đã build engineering team [X] người, establish safety protocol zero-incident [Y] năm, và deliver OEE 85%+. Expect: {bandRange} + management allowance + KPI bonus.',
    raise: 'Plant tôi quản lý đạt OEE 87%, zero LTI [X] năm, và cost reduction [Y]% YoY. Propose Plant Manager comp: {nextBandMin} + annual performance bonus.',
    tip: 'Mẹo Kỹ thuật Lead: OEE, safety record, và cost reduction là 3 KPI Plant Manager bị đánh giá. Nói bằng 3 số này khi negotiate.',
  },
  executive: {
    interview: 'Ở COO/Technical Director level: P&L authority + capex decision + technology roadmap ownership. Tôi cần understand expansion plan và automation investment trước khi discuss comp.',
    raise: 'Propose: base + equity trong entity mới + performance bonus tied to EBITDA improvement. Manufacturing automation tôi implement sẽ tạo ra [X tỷ] value — comp phải reflect.',
    tip: 'Mẹo Engineering Executive: Industry 4.0 + automation = massive value creation. Nếu bạn đang lead digital transformation, negotiate equity trước khi project complete.',
  },
};

const DESIGN_SCRIPTS: Record<SalaryBand, NegotiationScript> = {
  entry: {
    interview: 'Em có portfolio 5 case study UX với user research + A/B test results. Theo thị trường product design 2026, designer có portfolio data-driven nhận {bandRange} — cao hơn graphic designer 50-80%. Em kỳ vọng {nextBandMin}.',
    raise: 'Thiết kế em làm cho luồng onboarding đã tăng tỷ lệ hoàn thành [X]% và giảm số yêu cầu hỗ trợ [Y]%. Đây không chỉ là "làm đẹp" — đây là tác động trực tiếp tới kinh doanh. Em đề xuất tăng lên {nextBandMin}.',
    tip: 'Mẹo Design Entry: Portfolio với metrics (conversion rate, task completion, NPS) > portfolio đẹp. "Design của em tăng X% conversion" = ngôn ngữ PM/CEO hiểu.',
  },
  mid: {
    interview: 'Em đã lead design sprint cho [X] product, build design system được [Y] engineer dùng, và đo được impact: [Z]% improvement trong user retention. Target: {bandRange}. Expect: {nextBandMin}.',
    raise: 'Design system em build đã giảm dev time [X]% và tăng design consistency. User research em conduct đã prevent [Y] costly feature mistake. Propose {nextBandMin} — đây là ROI rõ ràng.',
    tip: 'Mẹo Design Mid: Design system + user research = bạn đang save company money. Tính ra số tiền cụ thể và nêu khi negotiate.',
  },
  senior: {
    interview: 'Em đã own product design end-to-end cho [X] product với [Y] MAU, mentor [Z] designer, và present design strategy lên C-level. Ở Senior level, em nhìn vào {bandRange} + equity nếu startup.',
    raise: 'Product em design đạt [X] MAU, NPS [Y], và feature adoption rate [Z]%. Em cũng đã build design culture cho team. Propose {nextBandMin} + senior designer equity.',
    tip: 'Mẹo Senior Design: MAU + NPS + feature adoption = ngôn ngữ investor. Nếu bạn design product có traction, đó là leverage cực mạnh.',
  },
  lead: {
    interview: 'Tôi đã build design team [X] người, establish design ops process, và align design strategy với business OKR. Expect: {bandRange} + equity + design budget authority.',
    raise: 'Design team tôi deliver [X] product launch on time, user satisfaction tăng [Y]%, và design debt giảm [Z]%. Propose Head of Design comp: {nextBandMin} + equity.',
    tip: 'Mẹo Design Lead: Design ops + business alignment = bạn đang làm việc của VP Product. Nếu không có equity — negotiate hoặc move on.',
  },
  executive: {
    interview: 'Ở Creative Director/VP Design level: equity + brand ownership + design culture authority. Tôi cần understand product vision và design maturity của tổ chức trước khi discuss comp.',
    raise: 'Propose: base + equity 1-3% + performance bonus tied to product NPS và brand equity metrics. Design là competitive moat — comp phải reflect.',
    tip: 'Mẹo Design Executive: Brand equity là intangible asset có thể định giá. Nếu bạn build brand từ 0, negotiate equity trước khi company raise funding.',
  },
};

const EVENTS_SCRIPTS: Record<SalaryBand, NegotiationScript> = {
  entry: {
    interview: 'Em không chỉ "lên sân khấu nói". Em đã chuẩn bị showreel 60-90 giây, 3 mẫu kịch bản và checklist briefing để chương trình chạy đúng nhịp. Với dải phí {bandRange}, em kỳ vọng mốc {nextBandMin} cho format này. Anh/chị cho em xin thêm brief về quy mô khách, thời lượng và mức rủi ro timeline để báo giá đúng ạ?',
    raise: 'Em muốn điều chỉnh mức phí vì phần em mang lại không chỉ là thời gian dẫn, mà là khả năng giữ nhịp chương trình, xử lý phát sinh và bảo vệ trải nghiệm khách mời. Với các show gần đây, em đã có video, feedback và checklist trước show. Em đề xuất mức {nextBandMin} cho các chương trình cùng độ khó.',
    tip: 'Mẹo MC mới: Đừng báo giá chỉ theo số giờ đứng sân khấu. Hỏi quy mô khách, format, rehearsal, yêu cầu song ngữ, mức rủi ro timeline rồi mới chốt phí.',
  },
  mid: {
    interview: 'Em có showreel, rate card theo loại sự kiện và vài case đã xử lý timeline/khách mời khó. Với format này, dải phí hợp lý đang quanh {bandRange}. Em muốn neo ở {nextBandMin} vì em nhận cả phần chuẩn bị kịch bản, briefing và rehearsal chứ không chỉ xuất hiện trên sân khấu.',
    raise: 'Các show gần đây em không chỉ dẫn đúng flow mà còn hỗ trợ chỉnh lời dẫn, cứu nhịp khi chương trình trễ và giữ năng lượng khán phòng. Em đã gom video + feedback khách hàng làm bằng chứng. Vì vậy em muốn nâng fee lên {nextBandMin} cho nhóm event tương tự.',
    tip: 'Mẹo MC mid-level: Muốn tăng phí phải có bộ hồ sơ bán hàng: showreel, rate card, feedback thật, ảnh sân khấu và 3 format bạn dẫn tốt nhất.',
  },
  senior: {
    interview: 'Em định vị mình là host giúp chương trình an toàn, có cảm xúc và đúng tinh thần thương hiệu. Em có portfolio sự kiện, video highlight và feedback từ khách/agency. Với dải {bandRange}, em đề xuất {nextBandMin} cho gói MC + chuẩn bị kịch bản + rehearsal.',
    raise: 'Em đang tạo giá trị ở phần khách hàng khó nhìn thấy: giữ nhịp sân khấu, xử lý sự cố, điều phối cảm xúc và bảo vệ hình ảnh brand. Với portfolio và feedback hiện có, em muốn nâng fee lên {nextBandMin} cho các show cùng quy mô.',
    tip: 'Mẹo MC senior: Bán "độ an toàn sân khấu" chứ không bán giọng nói. Người trả tiền sợ nhất là sự cố, lệch tone brand và chương trình bị tuột năng lượng.',
  },
  lead: {
    interview: 'Tôi có thể nhận vai trò lead host: cùng team biên tập flow, rehearsal, phối hợp producer và kiểm soát nhịp sân khấu. Dải phí cho scope này là {bandRange}; mức tôi đề xuất là {nextBandMin} vì đây là gói đảm bảo trải nghiệm chương trình, không phải chỉ phí MC.',
    raise: 'Tôi muốn chuyển từ phí theo buổi sang gói theo scope: MC + script polish + rehearsal + run-of-show. Với mức trách nhiệm hiện tại, tôi đề xuất {nextBandMin} hoặc cấu trúc retainer theo chuỗi sự kiện.',
    tip: 'Mẹo MC lead: Khi bạn đã lo được flow và team, hãy báo giá theo gói chương trình. Đừng để khách mua bạn như một nhân sự đứng sân khấu theo giờ.',
  },
  executive: {
    interview: 'Ở level này tôi quan tâm tới hợp tác dài hạn: brand fit, quyền khai thác hình ảnh, lịch series sự kiện và scope truyền thông. Mức {nextBandMin} là điểm bắt đầu cho package host/brand ambassador tùy thời lượng và quyền sử dụng hình ảnh.',
    raise: 'Tôi đề xuất chuyển sang hợp đồng theo chiến dịch hoặc retainer, gồm host, tư vấn format, nội dung sân khấu và quyền sử dụng hình ảnh có giới hạn. Cấu trúc này phản ánh đúng giá trị thương hiệu cá nhân và mức độ bảo chứng cho chương trình.',
    tip: 'Mẹo MC top-tier: Đàm phán usage rights, exclusivity, số lần sử dụng hình ảnh, rehearsal fee và cancellation fee. Đây là tiền thật, không chỉ base fee.',
  },
};

// ── Export function lấy script theo ngành + band ─────────────────────────────
const INDUSTRY_SCRIPTS: Record<string, Record<SalaryBand, NegotiationScript>> = {
  IT: IT_SCRIPTS,
  FINANCE: FINANCE_SCRIPTS,
  MARKETING: MARKETING_SCRIPTS,
  SALES: SALES_SCRIPTS,
  HEALTHCARE: HEALTHCARE_SCRIPTS,
  EDUCATION: EDUCATION_SCRIPTS,
  ENGINEERING: ENGINEERING_SCRIPTS,
  DESIGN: DESIGN_SCRIPTS,
  EVENTS: EVENTS_SCRIPTS,
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
