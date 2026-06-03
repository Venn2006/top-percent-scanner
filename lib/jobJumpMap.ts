import { getCareerCompassContext } from '@/lib/careerCompassEngine';
import { repairMojibakeDeep } from '@/lib/mojibake';
import { repairReportDisplayTextDeep } from '@/lib/reportDisplayText';
import { inferRoleLevelBand, isExecutiveLevel } from '@/lib/roleSeniority';
import {
  detectRoleSegment,
  getRoleLanguage,
  getRoleSegmentLabel,
  getSkilledTradeProfile,
  isAirportGroundRole,
  isDentalAssistantRole,
  isDentalRole,
  isEnglishTeacherRole,
  isHotelFrontlineRole,
  isHotelManagerRole,
  isInsuranceRole,
  isLanguageCenterManagerRole,
  isNutritionRole,
  isPublicSubjectTeacherRole,
  isRestaurantFrontlineRole,
  isRestaurantManagerRole,
  isVeterinaryRole,
} from '@/lib/roleTaxonomy';

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
    .replace(/[đĐ]/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

type JobSegment = ReturnType<typeof detectRoleSegment>;

function buildFallbackHeadline(jobTitle: string, segment: JobSegment) {
  const segmentLabel = getRoleSegmentLabel(segment);
  return `Bản đồ tăng lương cho ${jobTitle}: bám đúng ${segmentLabel}, không nhảy sang skill lệch ngành`;
}

function buildFallbackSummary(jobTitle: string, percent: number, segment: JobSegment, roleLanguage: ReturnType<typeof getRoleLanguage>) {
  const segmentLabel = getRoleSegmentLabel(segment);
  const currentPosition = percent >= 100 ? 'dưới Top 80%' : `Top ${percent}%`;
  return `Với ${jobTitle}, mục tiêu không phải học thêm chứng chỉ cho đẹp hồ sơ. Mục tiêu là đi từ vị trí ${currentPosition} lên offer tốt hơn trong nhóm ${segmentLabel} bằng ${roleLanguage.productWord}, KPI cụ thể và bằng chứng: ${roleLanguage.proofAsset}.`;
}

function buildFallbackInterviewAnchor(jobTitle: string, targetBase: number, stretchBase: number, roleLanguage: ReturnType<typeof getRoleLanguage>) {
  return `Em nhắm mức ${targetBase.toLocaleString('vi-VN')}đ/tháng cho vị trí ${jobTitle} vì em có thể chứng minh ${roleLanguage.mainSkill} bằng ${roleLanguage.proofAsset}. Nếu scope có KPI lớn hơn, em muốn trao đổi dải ${targetBase.toLocaleString('vi-VN')}đ - ${stretchBase.toLocaleString('vi-VN')}đ.`;
}

function buildFallbackRaiseAngle(jobTitle: string, roleLanguage: ReturnType<typeof getRoleLanguage>) {
  return `Xin review ${jobTitle} bằng evidence log 30 ngày: ${roleLanguage.kpiGuidance} Đính kèm ${roleLanguage.proofAsset} để quản lý/HR thấy được output thật.`;
}

function buildExecutiveJobJumpMap(jobTitle: string, salary: number, normalizedJob: string): JobJumpMap {
  const targetBase = roundToHalfMillion(Math.max(salary * 1.18, salary + 10_000_000));
  const stretchBase = roundToHalfMillion(Math.max(targetBase * 1.18, salary + 25_000_000));
  const isCmo = /\bcmo\b|giam doc marketing|marketing director/.test(normalizedJob);
  const isCeo = /\bceo\b|tong giam doc|general director|managing director/.test(normalizedJob);

  if (isCmo) {
    return {
      headline: `Bản đồ role trả cao hơn cho ${jobTitle}: tăng scope CMO, không hạ xuống role thấp hơn`,
      summary: `Với ${jobTitle}, hướng trả cao hơn là mở rộng mandate thay vì quay về track quản trị chiến dịch cấp dưới. Thị trường trả cho growth mandate, brand + revenue ownership, marketing operating system, budget/media efficiency, CAC/LTV, pipeline/revenue contribution và alignment với CEO/board.`,
      targetRoles: [
        { title: 'CMO tại quy mô doanh thu lớn hơn', why: 'Tăng compensation package khi scope gắn với revenue target, marketing budget lớn hơn, team rõ hơn và operating cadence đo được.', targetSalary: targetBase, keywords: ['CMO', 'larger revenue scope', 'marketing operating system', 'revenue impact'] },
        { title: 'Chief Growth Officer / Chief Commercial Officer', why: 'Đây là đường ngang/cao hơn khi marketing chịu growth mandate, pipeline, CAC/LTV, pricing/channel và commercial outcome.', targetSalary: stretchBase, keywords: ['Chief Growth Officer', 'Chief Commercial Officer', 'growth mandate', 'CAC/LTV'] },
        { title: 'VP Marketing / Regional Marketing Director', why: 'Phù hợp khi scope mở sang nhiều thị trường, nhiều business unit hoặc budget lớn hơn với board/CEO alignment rõ.', targetSalary: roundToHalfMillion(stretchBase * 1.08), keywords: ['VP Marketing', 'Regional Marketing Director', 'budget ownership', 'board alignment'] },
        { title: 'Fractional CMO / Board-level Growth Advisor', why: 'Khi đã có case tăng trưởng và hệ thống vận hành marketing, có thể bán mandate theo scope, retainer, bonus hoặc equity.', targetSalary: roundToHalfMillion(stretchBase * 1.12), keywords: ['Fractional CMO', 'Board-level Growth Advisor', 'equity', 'growth mandate'] },
        { title: 'Growth/Revenue Owner có bonus hoặc equity rõ', why: 'Nếu chịu kết quả revenue thật, package nên gắn với base + bonus/KPI + equity/profit-sharing thay vì chỉ tăng lương cứng.', targetSalary: roundToHalfMillion(stretchBase * 1.15), keywords: ['Revenue Owner', 'bonus', 'equity', 'profit-sharing'] },
      ],
      cvBullets: [
        'Đóng gói case CMO theo P&L/revenue impact: mục tiêu tăng trưởng, ngân sách, CAC/LTV, pipeline/revenue contribution và kết quả sau 1-2 quý.',
        'Chuẩn hóa marketing operating system: dashboard, weekly operating cadence, budget/media efficiency, agency/team model và decision log.',
        'Viết board/CEO update ngắn: brand health, revenue impact, growth bet, rủi ro, quyết định cần mandate và compensation package đề xuất.',
      ],
      interviewAnchor: `Với scope ${jobTitle}, tôi muốn trao đổi compensation package dựa trên revenue impact, growth mandate, budget efficiency, marketing operating system và board/CEO alignment. Mốc đề xuất nên gồm base + bonus/KPI hoặc equity/profit-sharing, không chỉ tăng lương cứng.`,
      internalRaiseAngle: 'Định giá lại compensation package bằng CMO evidence: P&L/revenue result, CAC/LTV, pipeline contribution, marketing operating cadence, budget efficiency và growth mandate đã chứng minh.',
    };
  }

  if (isCeo) {
    return {
      headline: `Bản đồ role trả cao hơn cho ${jobTitle}: tăng P&L mandate, không hạ xuống role vận hành thấp hơn`,
      summary: `Với ${jobTitle}, đường tăng thu nhập nằm ở P&L mandate lớn hơn, operating authority rõ hơn, board/owner mandate, revenue/profit growth, governance cadence và cấu trúc base + bonus/profit-sharing/equity.`,
      targetRoles: [
        { title: 'CEO / Tổng giám đốc với P&L lớn hơn', why: 'Package cao hơn khi phạm vi P&L, revenue/profit target, rủi ro vận hành và quyền quyết định tăng lên rõ ràng.', targetSalary: targetBase, keywords: ['CEO', 'P&L mandate', 'operating authority', 'profit growth'] },
        { title: 'Group CEO / General Director multi-unit', why: 'Scope nhiều đơn vị cần governance cadence, operating dashboard, org design và board/owner reporting chặt hơn.', targetSalary: stretchBase, keywords: ['Group CEO', 'General Director', 'multi-unit', 'governance'] },
        { title: 'Operating Partner / Board-level Operator', why: 'Phù hợp khi năng lực chính là turnaround, scale operating system, giảm rủi ro và tạo strategic outcome cho owner/board.', targetSalary: roundToHalfMillion(stretchBase * 1.1), keywords: ['Operating Partner', 'Board-level Operator', 'strategic outcome', 'risk reduction'] },
        { title: 'Founder/Owner track có equity hoặc profit-sharing', why: 'Nếu chịu rủi ro và tạo upside trực tiếp, compensation package nên có bonus, profit-sharing hoặc equity.', targetSalary: roundToHalfMillion(stretchBase * 1.15), keywords: ['Founder', 'Owner', 'equity', 'profit-sharing'] },
        { title: 'Advisor / Board mandate khi đã ở top income', why: 'Khi base đã cao, thu nhập tăng bằng mandate rõ, retainer, bonus theo strategic outcome và phạm vi ra quyết định.', targetSalary: roundToHalfMillion(stretchBase * 1.18), keywords: ['Advisor', 'Board mandate', 'retainer', 'strategic outcome'] },
      ],
      cvBullets: [
        'Đóng gói CEO evidence theo P&L ownership: revenue/profit growth, cash discipline, risk reduction, operating cadence và decision log.',
        'Chuẩn bị board/owner update: mục tiêu chiến lược, KPI vận hành, governance cadence, org design và quyết định cần mandate.',
        'Định giá package bằng scope và authority: base, bonus, profit-sharing/equity, quyền quyết định và rủi ro đang chịu trách nhiệm.',
      ],
      interviewAnchor: `Với phạm vi P&L và operating mandate hiện tại, tôi muốn trao đổi compensation package dựa trên tăng trưởng doanh thu/lợi nhuận, governance cadence, operating authority, mức rủi ro và strategic outcome. Cấu trúc phù hợp nên gồm base + bonus/profit-sharing/equity hoặc mandate lớn hơn.`,
      internalRaiseAngle: 'Định giá lại compensation package bằng CEO evidence: P&L result, revenue/profit growth, operating cadence, governance, org design, risk reduction và board/owner mandate.',
    };
  }

  return {
    headline: `Bản đồ role trả cao hơn cho ${jobTitle}: tăng mandate, scope và compensation package`,
    summary: `Ở cấp director/C-level/owner, thị trường không trả thêm vì lộ trình nhân viên. Giá trị nằm ở scope, P&L/revenue impact, operating authority, board/owner alignment, strategic outcome và cơ chế bonus/equity/profit-sharing.`,
    targetRoles: [
      { title: `${jobTitle} với scope lớn hơn`, why: 'Tăng package khi phạm vi quyết định, ngân sách, team và KPI kinh doanh lớn hơn.', targetSalary: targetBase, keywords: [jobTitle, 'scope', 'mandate', 'operating authority'] },
      { title: `Regional / multi-unit ${jobTitle}`, why: 'Scope nhiều đơn vị hoặc nhiều thị trường cần operating cadence và governance rõ hơn.', targetSalary: stretchBase, keywords: ['regional scope', 'multi-unit', 'governance', 'board update'] },
      { title: `Board-level advisor / fractional mandate`, why: 'Khi đã có strategic outcome rõ, có thể định giá bằng retainer, bonus hoặc equity/profit-sharing.', targetSalary: roundToHalfMillion(stretchBase * 1.12), keywords: ['board', 'advisor', 'compensation package', 'equity'] },
    ],
    cvBullets: [
      'Đóng gói evidence theo scope: P&L/revenue impact, budget, team, operating dashboard, decision log và strategic outcome.',
      'Chuẩn bị board/owner update với kết quả, rủi ro, quyết định cần mandate và cơ chế bonus/equity/profit-sharing.',
      'Neo package theo authority và outcome, không theo số năm kinh nghiệm hay chức danh nội bộ.',
    ],
    interviewAnchor: `Với scope ${jobTitle}, tôi muốn trao đổi compensation package dựa trên mandate, P&L/revenue impact, operating authority và strategic outcome.`,
    internalRaiseAngle: 'Định giá lại package bằng scope, mandate, board/owner alignment, bonus/equity/profit-sharing và kết quả chiến lược đã chứng minh.',
  };
}

function buildJobJumpMapRaw(jobTitle: string, salary: number, percent: number, industry?: string | null): JobJumpMap {
  const compass = getCareerCompassContext(jobTitle, salary, percent, industry);
  const segment = detectRoleSegment(jobTitle, industry);
  const roleLanguage = getRoleLanguage(jobTitle, industry);
  const targetBase = roundToHalfMillion(Math.max(compass.nextBandMin, salary * 1.18));
  const stretchBase = roundToHalfMillion(Math.max(targetBase * 1.15, salary * 1.3));
  const normalizedJob = normalizeJob(jobTitle);
  const levelBand = inferRoleLevelBand({ jobTitle, industry });

  if (isExecutiveLevel(levelBand)) {
    return buildExecutiveJobJumpMap(jobTitle, salary, normalizedJob);
  }

  if (isRestaurantManagerRole(jobTitle, industry)) {
    return {
      headline: 'Bản đồ tăng giá trị cho quản lý nhà hàng/F&B Manager: từ quản ca sang vận hành có KPI',
      summary: 'Quản lý nhà hàng không được map thành bếp/chef. Giá trị nằm ở vận hành ca, điều phối sàn, roster, labor cost, food cost, tồn kho/hao hụt, chất lượng dịch vụ, table turn, complaint recovery và dashboard cho owner/GM.',
      targetRoles: [
        {
          title: 'Restaurant Manager có KPI ca rõ',
          why: 'Nhà hàng/chuỗi trả cao hơn khi bạn chứng minh được doanh thu ca, table turn, labor cost, food cost/waste và complaint recovery bằng dashboard.',
          targetSalary: targetBase,
          keywords: ['Restaurant Manager', 'Shift operations', 'Labor cost', 'Service quality'],
        },
        {
          title: 'F&B Operations / Venue Manager',
          why: 'Khi bạn quản được SOP, roster, training team, service quality và các chi phí chính, scope đã vượt qua quản lý ca đơn lẻ.',
          targetSalary: stretchBase,
          keywords: ['F&B Operations', 'Roster', 'Food cost', 'Training team'],
        },
        {
          title: 'Area Manager chuỗi nhà hàng',
          why: 'Nếu dashboard và playbook ca của bạn nhân rộng được cho nhiều outlet, giá trị chuyển sang quản lý khu vực và P&L cơ bản.',
          targetSalary: roundToHalfMillion(stretchBase * 1.1),
          keywords: ['Area Manager', 'Multi-outlet', 'P&L', 'Service dashboard'],
        },
      ],
      cvBullets: [
        'Chứng minh bằng dashboard ca/tháng: doanh thu, table turn, labor cost, food cost/waste, complaint recovery và review score.',
        'Đưa roster, training checklist và service SOP vào hồ sơ để cho thấy bạn quản hệ thống, không chỉ giám sát nhân viên.',
        'Viết 1 case xử lý vận hành: complaint lớn, thiếu nhân sự, cost vượt ngưỡng hoặc review xấu, kèm kết quả sau khi sửa.',
      ],
      interviewAnchor: `Em nhắm mức ${targetBase.toLocaleString('vi-VN')}đ/tháng trở lên vì em có bằng chứng vận hành nhà hàng bằng KPI ca, chi phí, service quality và complaint recovery.`,
      internalRaiseAngle: 'Xin review bằng dashboard restaurant operations: doanh thu/table turn, labor cost, food cost, complaint recovery, training team và SOP ca.',
    };
  }

  if (isRestaurantFrontlineRole(jobTitle, industry)) {
    return {
      headline: 'Ban do tang luong cho phuc vu/thu ngan nha hang: tu lam ca sang frontline co KPI',
      summary: 'Frontline nha hang tang gia tri bang POS/order accuracy, bill error thap, upsell, table service SOP, complaint tai ban, shift handover va feedback quan ly ca.',
      targetRoles: [
        { title: 'Senior Service / Senior Cashier', why: 'Tra cao hon khi ban co log bill/order dung, it loi, biet upsell va giu service SOP trong ca dong.', targetSalary: targetBase, keywords: ['Senior service', 'Cashier lead', 'POS accuracy', 'Upsell'] },
        { title: 'Shift Lead / Floor Captain', why: 'Khi ban biet handover, kem nguoi moi va xu ly complaint tai ban, scope da len lead ca.', targetSalary: stretchBase, keywords: ['Shift lead', 'Floor captain', 'Handover', 'Complaint handling'] },
        { title: 'Restaurant Supervisor track', why: 'Neu ban gom du feedback quan ly ca, log loi giam va SOP phuc vu, co the len supervisor ma khong can nhay sai sang bep.', targetSalary: roundToHalfMillion(stretchBase * 1.08), keywords: ['Restaurant supervisor', 'Service SOP', 'Team training', 'Guest feedback'] },
      ],
      cvBullets: [
        'Ghi KPI ca: so bill/ban, order accuracy, bill error, upsell/request, complaint handled va feedback quan ly ca.',
        'Tao checklist phuc vu/thu ngan 6 buoc: nhan order, nhap POS, confirm mon/bill, upsell, complaint va handover.',
        'Viet 1 case xu ly khach kho hoac bill/order loi, kem cach sua va nguoi xac nhan.',
      ],
      interviewAnchor: `Em nham muc ${targetBase.toLocaleString('vi-VN')}d/thang tro len vi em co KPI ca ve POS/order accuracy, upsell, complaint handling va handover.`,
      internalRaiseAngle: 'Xin review bang log 10-20 bill/ban, order dung, bill loi giam, upsell, complaint recovery va feedback quan ly ca.',
    };
  }

  if (isHotelManagerRole(jobTitle, industry)) {
    return {
      headline: 'Ban do tang gia tri cho quan ly khach san: tu quan ly ca sang operating dashboard',
      summary: 'Quan ly khach san tang gia tri bang occupancy, ADR/RevPAR, staffing SLA, SOP audit, review score, complaint recovery, OTA/revenue action va budget/cost control.',
      targetRoles: [
        { title: 'Hotel Manager / Front Office Manager co KPI', why: 'Tra cao hon khi ban co dashboard occupancy, ADR/RevPAR, review score, complaint SLA va staffing.', targetSalary: targetBase, keywords: ['Hotel Manager', 'Occupancy', 'ADR/RevPAR', 'Review score'] },
        { title: 'Operations Manager khach san/resort', why: 'Scope lon hon khi ban phoi hop duoc revenue, OTA, staffing, SOP audit va service recovery giua cac bo phan.', targetSalary: stretchBase, keywords: ['Operations Manager', 'OTA', 'SOP audit', 'Staffing SLA'] },
        { title: 'GM / Multi-property Operations track', why: 'Khi dashboard va playbook van hanh nhan rong duoc, ban co co so len GM/quan ly nhieu co so.', targetSalary: roundToHalfMillion(stretchBase * 1.12), keywords: ['GM track', 'Multi-property', 'P&L', 'Operating dashboard'] },
      ],
      cvBullets: [
        'Dua operating dashboard vao CV: occupancy, ADR/RevPAR, review score, request SLA, complaint recovery, staffing va cost/budget note.',
        'Viet 1 case xu ly review xau/complaint lon/staffing lech, kem root cause va action log 30 ngay.',
        'Chung minh kha nang phoi hop front office, housekeeping, revenue/OTA va cac bo phan lien quan.',
      ],
      interviewAnchor: `Em nham muc ${targetBase.toLocaleString('vi-VN')}d/thang tro len vi em co bang chung hotel operations bang occupancy, ADR/RevPAR, review score, staffing SLA va complaint recovery.`,
      internalRaiseAngle: 'Xin review bang operating dashboard 30 ngay: occupancy, ADR/RevPAR, review score, complaint SLA, staffing va action log.',
    };
  }

  if (isHotelFrontlineRole(jobTitle, industry)) {
    return {
      headline: 'Ban do tang luong cho le tan/front desk: tu check-in sang guest service co KPI',
      summary: 'Le tan khach san tang gia tri bang PMS/booking accuracy, check-in/out SOP, guest request SLA, upsell phong/dich vu, complaint recovery, shift handover va review feedback.',
      targetRoles: [
        { title: 'Senior Front Desk / Senior Guest Service', why: 'Tra cao hon khi ban co log PMS dung, request xu ly dung SLA, complaint recovery va feedback khach.', targetSalary: targetBase, keywords: ['Senior front desk', 'PMS accuracy', 'Guest request SLA', 'Complaint recovery'] },
        { title: 'Reservation / Guest Relations Specialist', why: 'Phu hop khi ban manh ve booking, follow-up request, upsell va giao tiep khach.', targetSalary: stretchBase, keywords: ['Reservation', 'Guest relations', 'Upsell', 'Booking accuracy'] },
        { title: 'Front Office Supervisor track', why: 'Khi ban co handover tot, kem nguoi moi va xu ly escalation, co the len supervisor dung track front office.', targetSalary: roundToHalfMillion(stretchBase * 1.08), keywords: ['Front office supervisor', 'Shift handover', 'Escalation', 'Training'] },
      ],
      cvBullets: [
        'Ghi KPI ca: so check-in/request, PMS accuracy, request SLA, upsell, complaint recovery va feedback quan ly/khach.',
        'Tao checklist front desk 7 buoc: booking/PMS, check-in/out, request, upsell, complaint, note PMS va handover.',
        'Viet 1 case xu ly booking sai, request gap hoac complaint, da an thong tin khach.',
      ],
      interviewAnchor: `Em nham muc ${targetBase.toLocaleString('vi-VN')}d/thang tro len vi em co KPI ca ve PMS accuracy, request SLA, upsell, complaint recovery va handover.`,
      internalRaiseAngle: 'Xin review bang log 10-20 check-in/request, PMS accuracy, request SLA, complaint recovery, upsell va feedback quan ly ca.',
    };
  }

  if (isVeterinaryRole(jobTitle, industry)) {
    return {
      headline: 'Ban do tang gia tri cho bac si thu y: tu kham ca le sang case thu y co bang chung',
      summary: 'Bac si thu y khong nen dung track bac si dieu tri nguoi. Gia tri nam o animal triage, chan doan theo loai vat nuoi, vaccination/deworming, surgery/anesthesia safety, follow-up, owner communication va ho so dieu tri da an thong tin.',
      targetRoles: [
        { title: 'Senior Veterinarian tai pet clinic premium', why: 'Tra cao hon khi ban co case thu y ro: loai vat nuoi, chan doan, phac do, follow-up va feedback chu nuoi.', targetSalary: targetBase, keywords: ['Senior Veterinarian', 'Animal triage', 'Case thu y', 'Owner feedback'] },
        { title: 'Veterinary Surgery / Emergency / Exotic-pet track', why: 'Track chuyen sau tra cao hon khi ban chung minh duoc an toan gay me, phau thuat/cap cuu, imaging/xet nghiem va follow-up.', targetSalary: stretchBase, keywords: ['Veterinary surgery', 'Emergency vet', 'Anesthesia safety', 'Diagnostics'] },
        { title: 'Clinic Lead / Veterinary Hospital Operations', why: 'Khi ban chuan hoa protocol, review case, huong dan bac si tre va theo KPI phong kham thu y, scope da len lead.', targetSalary: roundToHalfMillion(stretchBase * 1.12), keywords: ['Clinic lead', 'Protocol', 'Vet team review', 'Pet clinic KPI'] },
      ],
      cvBullets: [
        'Dong goi 5-10 case thu y da an thong tin: loai vat nuoi, trieu chung, chan doan, phac do, vaccination/deworming, xet nghiem/hinh anh neu co va follow-up.',
        'Chung minh an toan thu thuat/gay me, infection control cho thu cung, complication/revisit log va feedback chu nuoi.',
        'Viet 1 case clinical reasoning thu y: vi sao chon phac do, rui ro, huong dan chu nuoi va lich tai kham.',
      ],
      interviewAnchor: `Em nham muc ${targetBase.toLocaleString('vi-VN')}d/thang tro len vi em co bang chung thu y: animal triage, case da an thong tin, vaccination/deworming, surgery safety, follow-up va feedback chu nuoi.`,
      internalRaiseAngle: 'Xin review bang veterinary case log 30 ngay: so ca kham/dieu tri, vaccination/deworming completion, follow-up adherence, complication/revisit rate, surgery/anesthesia safety va owner satisfaction.',
    };
  }

  if (isNutritionRole(jobTitle, industry)) {
    return {
      headline: 'Ban do tang gia tri cho chuyen vien dinh duong: tu tu van chung sang meal plan co ket qua do duoc',
      summary: 'Chuyen vien dinh duong khong nen dung track bac si lam sang chung. Gia tri nam o nutrition assessment, khai thac khau phan, meal plan/che do an, counseling thay doi hanh vi, adherence, follow-up va chi so truoc-sau.',
      targetRoles: [
        { title: 'Senior Nutritionist / Dietitian tai clinic-wellness premium', why: 'Tra cao hon khi ban co case meal plan ro: muc tieu, khau phan, adherence, chi so truoc-sau va feedback khach.', targetSalary: targetBase, keywords: ['Nutritionist', 'Meal plan', 'Diet assessment', 'Follow-up metrics'] },
        { title: 'Sports / Weight management / Metabolic nutrition track', why: 'Track chuyen sau tra cao hon khi ban chung minh duoc ket qua theo nhom muc tieu: giam mo, tang co, duong huyet/lipid, hieu suat tap luyen hoac thoi quen an uong.', targetSalary: stretchBase, keywords: ['Sports nutrition', 'Weight management', 'Metabolic health', 'Adherence'] },
        { title: 'Wellness Program Lead / Corporate nutrition coach', why: 'Khi ban dong goi duoc program, tai lieu tu van, dashboard ket qua va lich follow-up cho nhom khach, scope co the len lead.', targetSalary: roundToHalfMillion(stretchBase * 1.12), keywords: ['Wellness lead', 'Nutrition program', 'Outcome dashboard', 'Behavior change'] },
      ],
      cvBullets: [
        'Dong goi 5-10 case dinh duong da an thong tin: muc tieu, khau phan hien tai, meal plan, adherence, chi so truoc-sau va feedback khach/nguoi duoc tu van.',
        'Chung minh ket qua bang can nang/BMI/vong eo, thoi quen an uong, duong huyet/lipid neu co, ty le follow-up va muc do hai long.',
        'Viet 1 case nutrition reasoning: vi sao chon che do an, rui ro, cach dieu chinh theo adherence va lich follow-up.',
      ],
      interviewAnchor: `Em nham muc ${targetBase.toLocaleString('vi-VN')}d/thang tro len vi em co bang chung dinh duong: nutrition assessment, meal plan, adherence, chi so truoc-sau, follow-up va feedback khach.`,
      internalRaiseAngle: 'Xin review bang nutrition case log 30 ngay: so ca tu van, adherence meal plan, chi so truoc-sau, follow-up completion, feedback khach va ket qua thay doi hanh vi an uong.',
    };
  }

  if (isInsuranceRole(jobTitle, industry)) {
    return {
      headline: 'Ban do tang gia tri cho chuyen vien bao hiem phi nhan tho: tu xu ly ho so sang underwriting/claims/account co KPI',
      summary: 'Bao hiem phi nhan tho khong nen map sang track lap bao cao tai chinh noi bo. Gia tri dung nam o underwriting risk, claims/boi thuong, policy wording, broker/client account, renewal ratio, loss ratio va SLA xu ly ho so.',
      targetRoles: [
        { title: 'Non-life Underwriter / Underwriting Specialist', why: 'Tra cao hon khi ban chung minh duoc danh gia rui ro, dieu khoan coverage/loai tru, premium logic va loss ratio thinking.', targetSalary: targetBase, keywords: ['Underwriter', 'Risk assessment', 'Policy wording', 'Loss ratio'] },
        { title: 'Claims / Loss Adjusting Specialist', why: 'Track claims tra cao hon khi ban co case boi thuong ro: ho so, giam dinh ton that, SLA, claim accuracy va dispute handling.', targetSalary: stretchBase, keywords: ['Claims', 'Loss adjusting', 'Claim cycle time', 'Coverage'] },
        { title: 'Broker Account / Corporate Insurance Account Executive', why: 'Neu manh ve khach hang doanh nghiep, renewal, cross-sell va broker relationship, track account/broker co kha nang tra tot hon.', targetSalary: roundToHalfMillion(stretchBase * 1.12), keywords: ['Broker account', 'Corporate insurance', 'Renewal ratio', 'Client retention'] },
      ],
      cvBullets: [
        'Dong goi 5-10 case bao hiem da an thong tin: loai nghiep vu, rui ro, coverage, dieu khoan loai tru, premium/loss ratio neu co va outcome.',
        'Chung minh KPI dung nghe: quote/underwriting SLA, renewal ratio, claim cycle time, claim accuracy, loss ratio, broker/client feedback.',
        'Viet 1 case insurance reasoning: vi sao chap nhan/tu choi/dieu chinh dieu khoan, rui ro chinh, cach xu ly claim/renewal va bai hoc.',
      ],
      interviewAnchor: `Em nham muc ${targetBase.toLocaleString('vi-VN')}d/thang tro len vi em co bang chung bao hiem phi nhan tho: underwriting risk, policy wording, claims/boi thuong, renewal ratio, loss ratio va feedback broker/khach hang.`,
      internalRaiseAngle: 'Xin review bang insurance case log 30 ngay: quote/underwriting SLA, renewal ratio, claim cycle time, claim accuracy, loss ratio, broker/client retention va compliance policy wording.',
    };
  }

  if (isDentalRole(jobTitle, industry)) {
    return {
      headline: 'Ban do tang gia tri cho nha si: tu kham chung sang case dieu tri co bang chung',
      summary: 'Nha si tang gia tri bang chan doan, treatment plan, protocol vo khuan, case lam sang an danh, X-quang/CBCT/photo intraoral neu duoc phep, tai kham va feedback benh nhan.',
      targetRoles: [
        { title: 'Nha si tong quat tai clinic premium', why: 'Tra cao hon khi ban co case dieu tri an danh, treatment plan ro, follow-up tot va feedback benh nhan.', targetSalary: targetBase, keywords: ['Dentist', 'Treatment plan', 'Infection control', 'Patient feedback'] },
        { title: 'Nha si chuyen sau restorative/endo/perio/implant/chinh nha', why: 'Track chuyen sau tra cao hon khi ban chung minh duoc ca lam sang, protocol an toan va ket qua tai kham.', targetSalary: stretchBase, keywords: ['Dental specialist', 'Clinical case', 'CBCT/X-ray', 'Follow-up'] },
        { title: 'Lead Dentist / Clinical Director track', why: 'Khi ban chuan hoa protocol, review case, mentoring va clinical quality, scope da len lead clinical.', targetSalary: roundToHalfMillion(stretchBase * 1.12), keywords: ['Lead Dentist', 'Clinical Director', 'Protocol', 'Clinical governance'] },
      ],
      cvBullets: [
        'Dong goi 3-5 case nha khoa da an danh: trieu chung, chan doan, treatment plan, phim/anh duoc phep, tai kham va ket qua.',
        'Chung minh infection-control checklist, patient communication, complication/rework log va feedback benh nhan/bac si phu trach.',
        'Viet 1 case clinical reasoning: vi sao chon phuong an dieu tri, rui ro, cham soc sau dieu tri va lich tai kham.',
      ],
      interviewAnchor: `Em nham muc ${targetBase.toLocaleString('vi-VN')}d/thang tro len vi em co bang chung clinical nha khoa: treatment plan, case an danh, vo khuan, follow-up va feedback benh nhan.`,
      internalRaiseAngle: 'Xin review bang ho so clinical nha khoa: case an danh, treatment plan accepted, follow-up adherence, complication/rework log, infection-control checklist va patient satisfaction.',
    };
  }

  if (isDentalAssistantRole(jobTitle, industry)) {
    return {
      headline: 'Ban do tang luong cho tro ly nha khoa: tu phu ghe sang senior dental assistant',
      summary: 'Tro ly nha khoa tang gia tri bang chair setup, vo khuan dung cu, suction/chuyen dung cu dung nhip, huong dan benh nhan, lich tai kham, ton kho vat tu va feedback bac si.',
      targetRoles: [
        { title: 'Senior Dental Assistant', why: 'Tra cao hon khi ban ho tro thu thuat dung nhip, vo khuan khong loi va handover tot.', targetSalary: targetBase, keywords: ['Senior Dental Assistant', 'Chairside assisting', 'Infection control', 'Doctor feedback'] },
        { title: 'Treatment Room Coordinator', why: 'Phu hop khi ban quan duoc ghe, dung cu, vat tu, lich tai kham va nhieu bac si/ca trong ngay.', targetSalary: stretchBase, keywords: ['Treatment room', 'Supply log', 'Appointment follow-up', 'Clinic SOP'] },
        { title: 'Clinic Operations Assistant', why: 'Khi ban vua manh thu thuat vua theo duoc lich hen, vat tu va patient instruction, co the mo rong sang operations phong kham.', targetSalary: roundToHalfMillion(stretchBase * 1.08), keywords: ['Clinic operations', 'Patient instruction', 'Inventory', 'SOP'] },
      ],
      cvBullets: [
        'Ghi KPI ca: chair setup time, vo khuan khong loi, ho tro suction/chuyen dung cu, huong dan sau dieu tri va feedback bac si.',
        'Tao checklist 8 buoc cho ca nha khoa: ghe, dung cu, vo khuan, don benh nhan, ho tro thu thuat, don dep, huong dan va hen tai kham.',
        'Theo doi ton kho vat tu va lich tai kham de giam loi thieu dung cu/tre hen.',
      ],
      interviewAnchor: `Em nham muc ${targetBase.toLocaleString('vi-VN')}d/thang tro len vi em co bang chung ho tro thu thuat, vo khuan, chair setup, patient instruction va feedback bac si.`,
      internalRaiseAngle: 'Xin review bang log 10-20 ca ho tro: setup time, vo khuan, ho tro dung nhip, tai kham dung, ton kho vat tu va feedback bac si.',
    };
  }

  if (segment === 'school_leadership') {
    const isPublicTrack = /bien che|cong lap|nha nuoc|so giao duc|phong giao duc/.test(normalizedJob);
    const educationBase = Math.max(targetBase, isPublicTrack ? 18_000_000 : 28_000_000);
    const educationStretch = Math.max(stretchBase, isPublicTrack ? 25_000_000 : 45_000_000);

    return {
      headline: 'Bản đồ tăng giá trị cho hiệu trưởng/hiệu phó: tách công lập và tư thục trước khi nói lương',
      summary: isPublicTrack
        ? 'Track công lập/biên chế không tăng thu nhập bằng kiểu deal lương tự do. Điểm cần tối ưu là hồ sơ bổ nhiệm, thi đua, phụ cấp, chất lượng chuyên môn, phân công và uy tín với Phòng/Sở GD.'
        : 'Track tu thuc/quoc te tra theo chat luong hoc thuat, niem tin phu huynh, retention hoc sinh, tuyen sinh, chat luong giao vien va van hanh truong. Khong nen ha hieu truong xuong vai tro van hanh trung tam hay giao vien co kinh nghiem.',
      targetRoles: [
        {
          title: isPublicTrack ? 'Hiệu trưởng/Hiệu phó công lập: tối ưu phụ cấp, thi đua và hồ sơ bổ nhiệm' : 'Head of School / Principal tư thục-quốc tế',
          why: isPublicTrack
            ? 'Với biên chế, tăng giá trị nằm ở hồ sơ chất lượng, thi đua, phụ cấp, kiểm định, phân công và uy tín chuyên môn chứ không phải nhảy sang role bán hàng giáo dục.'
            : 'Trường tư/quốc tế trả cao hơn khi bạn chứng minh được parent satisfaction, teacher quality, retention, enrollment và academic quality bằng dashboard rõ.',
          targetSalary: educationBase,
          keywords: isPublicTrack ? ['Thi đua', 'Phụ cấp', 'Hồ sơ bổ nhiệm', 'Kiểm định'] : ['Head of School', 'Parent satisfaction', 'Retention', 'Teacher quality'],
        },
        {
          title: 'Academic Quality Lead / School Governance Lead hệ thống trường',
          why: 'Đây là hướng mở rộng đúng bản chất lãnh đạo trường học: chuẩn hóa chất lượng, teacher review, parent SLA, curriculum map và risk log cho nhiều khối/cơ sở.',
          targetSalary: educationStretch,
          keywords: ['School governance', 'Academic quality', 'Parent SLA', 'Risk log'],
        },
        {
          title: 'School Director / Quản lý cụm trường',
          why: 'Nếu bạn biến kinh nghiệm quản trị thành playbook nhân rộng, giá trị nằm ở vận hành hệ thống, tuyển sinh/retention, chất lượng học thuật, đội ngũ hiệu trưởng kế cận và P&L.',
          targetSalary: roundToHalfMillion(educationStretch * 1.15),
          keywords: ['School Director', 'Cluster schools', 'P&L', 'Leadership pipeline'],
        },
      ],
      cvBullets: [
        'Tách rõ bối cảnh công lập/biên chế hay tư thục/quốc tế ngay trong hồ sơ, vì 2 track có luật tăng thu nhập khác nhau.',
        'Đưa dashboard chất lượng nhà trường vào hồ sơ: academic quality, teacher quality, parent complaint SLA, an toàn trường học và retention/tuyển sinh nếu có.',
        'Viết 1 case quản trị trường học: vấn đề, can thiệp, số trước-sau, bằng chứng phụ huynh/giáo viên/học sinh và kết quả về chất lượng hoặc vận hành.',
      ],
      interviewAnchor: isPublicTrack
        ? 'Em muốn được review theo hồ sơ chất lượng, thi đua, phụ cấp và phạm vi phân công rõ hơn, vì track công lập phụ thuộc ngạch-bậc/bổ nhiệm chứ không thể deal như thị trường tự do.'
        : `Em nhắm mức ${educationBase.toLocaleString('vi-VN')}đ/tháng trở lên cho scope lãnh đạo trường vì em có thể chứng minh chất lượng học thuật, parent satisfaction, teacher quality, retention/tuyển sinh và vận hành bằng số.`,
      internalRaiseAngle: isPublicTrack
        ? 'Xin review bằng hồ sơ bổ nhiệm/phụ cấp/thi đua, dashboard chất lượng chuyên môn, kiểm định và phân công đang gánh.'
        : 'Xin review bằng dashboard Head of School: retention học sinh, parent satisfaction, teacher quality, tuyển sinh, complaint SLA và chất lượng học thuật.',
    };
  }

  if (segment === 'photography') {
    return {
      headline: 'Bản đồ tăng rate cho photographer: từ chụp đại trà sang ngách cao cấp',
      summary: 'Photographer không tăng giá bằng nói "ảnh đẹp". Tăng giá bằng portfolio chuyên ngách, high-end retouching, lighting studio, hybrid photo-video và brand retainer dài hạn.',
      targetRoles: [
        {
          title: 'Photographer chuyên ngách (wedding cao cấp / food / product / kiến trúc)',
          why: 'Khách ngách hẹp trả gấp 2–4x photographer đa năng. IG/Behance 30+ bộ trong đúng 1 ngách là vé vào phân khúc premium.',
          targetSalary: targetBase,
          keywords: ['Wedding photographer', 'Food photography', 'Product photography', 'Niche portfolio'],
        },
        {
          title: 'Hybrid Photo-Video / DOP cho production house',
          why: '90% brief brand 2026 đòi 1 shoot 2 outputs (photo + cinematic video). Hybrid shooter tính rate gấp 1.8–2.5x; DOP cho video commercial nhận 200–500tr/dự án.',
          targetSalary: stretchBase,
          keywords: ['Hybrid photographer', 'Cinematic video', 'DaVinci color grading', 'DOP'],
        },
        {
          title: 'Brand Photographer / Studio Owner có retainer',
          why: 'Ký 2–3 brand retainer dài hạn (F&B, fashion, real estate) = thu nhập ổn định 80–200tr/tháng, không phụ thuộc mùa cưới/event.',
          targetSalary: roundToHalfMillion(stretchBase * 1.15),
          keywords: ['Brand photographer', 'Retainer contract', 'Studio owner', 'Commercial photography'],
        },
      ],
      cvBullets: [
        'Portfolio 30+ bộ ảnh trong 1 ngách duy nhất, đã retouch chuẩn thương mại (Dodge & Burn, frequency separation, skin work).',
        'Rate card 3 tầng (basic/standard/premium) theo gói sản phẩm — không tính theo giờ chụp.',
        'Case study brand/job premium có ảnh trước–sau retouch, lighting diagram và moodboard concept.',
      ],
      interviewAnchor: `Em đề xuất rate ${targetBase.toLocaleString('vi-VN')}đ/tháng hoặc tương đương theo job vì em có portfolio ngách rõ, biết retouch high-end và deliver hybrid photo-video, không phải photographer đa năng.`,
      internalRaiseAngle: 'Đề xuất tăng giá bằng portfolio ngách + case study brand đã làm + khả năng deliver video kèm ảnh trong cùng 1 shoot, không nói "em chụp đẹp hơn".',
    };
  }

  const skilledTrade = getSkilledTradeProfile(jobTitle, industry);
  if (skilledTrade) {
    const skills = skilledTrade.skills.slice(0, 4);
    const targetPathParts = skilledTrade.language.rolePath.split('/').map(part => part.trim()).filter(Boolean);
    return {
      headline: `Ban do tang thu nhap cho ${jobTitle}: di theo dung track ${skilledTrade.language.rolePath}`,
      summary: `Voi ${jobTitle}, khong dung bo skill tho tay nghe chung. Gia tri can chung minh la ${skilledTrade.language.mainSkill}, bang ${skilledTrade.language.proofAsset}.`,
      targetRoles: [
        {
          title: targetPathParts[1] || `Senior ${jobTitle}`,
          why: `Tra cao hon khi ban co case that va KPI nghe ro: ${skilledTrade.language.kpiGuidance}`,
          targetSalary: targetBase,
          keywords: skills,
        },
        {
          title: targetPathParts[2] || `Lead ${jobTitle}`,
          why: `Khi ban dong goi du ${skilledTrade.language.productWord}, ban co the chuyen sang moi truong premium hon trong cung nghe.`,
          targetSalary: stretchBase,
          keywords: [skilledTrade.language.portfolioWord, ...skills.slice(0, 3)],
        },
        {
          title: targetPathParts[3] || `Doi truong / owner mang ${jobTitle}`,
          why: `Moc cao hon den tu kha nang giam loi, giu SLA, huong dan nguoi khac va ban giao bang chung ro rang, khong phai hoc lan man sang nghe khac.`,
          targetSalary: roundToHalfMillion(stretchBase * 1.1),
          keywords: ['SLA', 'QC', 'case log', 'team lead'],
        },
      ],
      cvBullets: [
        `Dong goi ${skilledTrade.language.productWord}: ${skilledTrade.language.proofAsset}.`,
        `Viet CV theo KPI dung nghe: ${skilledTrade.language.kpiGuidance}`,
        `Them 3-5 bang chung co anh/log/nguoi xac nhan vao ${skilledTrade.language.portfolioWord}; khong dung skill cua nghe khac neu khong lien quan.`,
      ],
      interviewAnchor: `Em nham muc ${targetBase.toLocaleString('vi-VN')}d/thang vi em co the chung minh ${skilledTrade.language.mainSkill} bang case that va KPI nghe ro.`,
      internalRaiseAngle: `Xin review bang evidence log 30 ngay: ${skilledTrade.language.kpiGuidance}`,
    };
  }

  if (segment === 'blue_collar') {
    return {
      headline: 'Bản đồ tăng thu nhập cho thợ thủ công: từ đơn lẻ sang ngách cao cấp + B2B',
      summary: 'Thợ thủ công không tăng tiền bằng chứng chỉ văn phòng chung chung. Tăng bằng máy hiện đại (CNC/laser/máy công nghiệp), video quy trình thật, ngách cao cấp và hợp đồng B2B với designer/showroom.',
      targetRoles: [
        {
          title: 'Thợ chuyên ngách cao cấp (nội thất gỗ tự nhiên / áo dài / kim hoàn / custom mod)',
          why: 'Khách cao cấp đặt theo bộ sưu tập, trả trước 50%, giá gấp 3–10x đơn đại trà. TikTok/IG 30+ video quy trình là kênh đơn hàng số 1.',
          targetSalary: targetBase,
          keywords: ['Thợ ngách', 'Custom order', 'TikTok craft', 'IG portfolio'],
        },
        {
          title: 'Thợ có máy hiện đại (CNC / laser / máy công nghiệp)',
          why: '1 máy CNC 50–200tr tăng năng suất 3–5x, mở cửa nhận đơn theo lô B2B với showroom/designer thay vì chỉ retail.',
          targetSalary: stretchBase,
          keywords: ['CNC operator', 'Laser cutting', 'Máy công nghiệp', 'B2B craft'],
        },
        {
          title: 'Chủ xưởng nhỏ / Workshop owner có hợp đồng B2B',
          why: 'Ký 1–2 hợp đồng B2B với designer nội thất hoặc chuỗi café = đơn định kỳ, dự đoán được dòng tiền, scale lên 30–60tr/tháng.',
          targetSalary: roundToHalfMillion(stretchBase * 1.15),
          keywords: ['Workshop owner', 'B2B supplier', 'Designer partnership', 'SOP sản xuất'],
        },
      ],
      cvBullets: [
        '30+ video TikTok/IG show quy trình làm — raw process, không cần edit kỹ, đủ thuyết phục khách custom.',
        'Bảng cost vật tư + giá theo sản phẩm hoàn chỉnh (không tính giờ công) cho 5 sản phẩm chủ lực.',
        '1 chứng chỉ máy hiện đại (CNC / laser / TIG / máy may công nghiệp) hoặc 1 case study đơn B2B đã làm.',
      ],
      interviewAnchor: `Em đề xuất mức ${targetBase.toLocaleString('vi-VN')}đ/tháng hoặc đơn theo sản phẩm vì em có TikTok/IG ngách rõ, biết vận hành máy hiện đại và đã có khách custom quay lại — không bán theo giờ công.`,
      internalRaiseAngle: 'Tăng giá bằng portfolio ngách + máy hiện đại + đơn B2B đã ký, không nói "em làm lâu năm".',
    };
  }

  if (segment === 'fnb') {
    return {
      headline: 'Bản đồ chuyển sang role bếp/nhà hàng trả cao hơn',
      summary: 'Đầu bếp không tăng giá trị bằng nói “em nấu tốt”. Tăng giá trị bằng food cost, waste rate, tốc độ ra món, rating khách, khả năng dẫn ca và vận hành bếp/nhà hàng khi đông khách.',
      targetRoles: [
        {
          title: 'Đầu bếp tại chuỗi nhà hàng có KPI vận hành',
          why: 'Chuỗi nhà hàng/bếp trung tâm thường có số đo rõ: food cost, waste, tốc độ ra món, rating khách. Có số thì dễ chứng minh giá trị hơn bếp nhỏ trả theo cảm tính.',
          targetSalary: targetBase,
          keywords: ['Chef', 'Chuỗi nhà hàng', 'Food cost', 'Kitchen KPI'],
        },
        {
          title: 'Sous Chef / Ca trưởng bếp',
          why: 'Nếu bạn giữ được chất lượng món, training phụ bếp và kiểm soát ca đông khách, đây là bước lên lương tự nhiên trong nghề bếp.',
          targetSalary: stretchBase,
          keywords: ['Sous Chef', 'Ca trưởng bếp', 'Training bếp', 'Kiểm soát ca'],
        },
        {
          title: 'Bếp trưởng / Kitchen Manager / Quản lý nhà hàng',
          why: 'Khi bạn đã chứng minh được cost, waste, lịch ca, training người và complaint món, có thể đi lên quản lý bếp hoặc quản lý vận hành nhà hàng.',
          targetSalary: roundToHalfMillion(stretchBase * 1.1),
          keywords: ['Bếp trưởng', 'Kitchen Manager', 'Quản lý nhà hàng', 'F&B operations'],
        },
      ],
      cvBullets: [
        'Ghi rõ số liệu bếp: food cost %, waste rate, số suất/ca, thời gian ra món, rating khách hoặc số lỗi món giảm.',
        'Đóng gói 3 món/signature item thành recipe card có định lượng, cost, quy trình ra món và tiêu chuẩn plating.',
        'Chứng minh đã training phụ bếp/ca mới hoặc giữ chất lượng món ổn định trong giờ cao điểm.',
      ],
      interviewAnchor: `Em đang nhắm mức ${targetBase.toLocaleString('vi-VN')}đ/tháng vì em có thể chứng minh bằng food cost, waste rate, tốc độ ra món và chất lượng món ổn định theo ca.`,
      internalRaiseAngle: 'Xin review bằng 5 số nghề bếp: food cost, waste rate, tốc độ ra món, rating/complaint và số người trong bếp bạn training được.',
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

  if (segment === 'pilot') {
    const pilotBase = Math.max(targetBase, roundToHalfMillion(salary * 1.18), 80_000_000);
    const pilotStretch = Math.max(stretchBase, roundToHalfMillion(salary * 1.3), 120_000_000);
    const pilotLead = Math.max(roundToHalfMillion(pilotStretch * 1.15), 160_000_000);

    return {
      headline: 'Huong tang luong cho phi cong: tu bay dung gio sang ho so flight deck co bang chung',
      summary: 'Phi cong khong tang gia tri bang ngon ngu tiep vien. Track dung la flight safety, SOP compliance, type rating/recurrent training, simulator check, flight hours/logbook, cockpit CRM/ATC va route-aircraft qualification.',
      targetRoles: [
        {
          title: 'First Officer type-rated / route-ready',
          why: 'Gia tri tang khi logbook, recurrent check, SOP compliance va kha nang san sang tuyen/tau bay duoc chung minh ro bang bang chung flight deck.',
          targetSalary: pilotBase,
          keywords: ['First Officer', 'Type rating', 'Recurrent check', 'Route readiness'],
        },
        {
          title: 'Captain upgrade track',
          why: 'Track len captain can flight hours, safety record, simulator performance, cockpit CRM, ATC communication va feedback instructor/check pilot.',
          targetSalary: pilotStretch,
          keywords: ['Captain upgrade', 'Flight hours', 'CRM', 'ATC communication'],
        },
        {
          title: 'Training Captain / Check Pilot / Simulator Instructor',
          why: 'Khi kinh nghiem bay duoc dong goi thanh SOP, debrief, simulator training va check feedback, scope da o muc huan luyen/kiem tra phi cong khac.',
          targetSalary: pilotLead,
          keywords: ['Training Captain', 'Check Pilot', 'TRI', 'Simulator instructor'],
        },
      ],
      cvBullets: [
        'Tom tat logbook/flight hours theo aircraft, route, duty type va cac moc recurrent/type rating da pass neu duoc phep chia se.',
        'Dua safety/incident-free record, SOP compliance, simulator check va instructor/check feedback vao ho so, che thong tin nhay cam theo quy dinh hang bay.',
        'Viet 1 case flight deck: tinh huong, SOP/CRM/ATC da ap dung, quyet dinh an toan, debrief va bai hoc.',
      ],
      interviewAnchor: `Em nham muc ${pilotBase.toLocaleString('vi-VN')}d/thang tro len vi em co the chung minh bang flight hours/logbook, type rating/recurrent check, SOP safety record, cockpit CRM/ATC va route-aircraft qualification.`,
      internalRaiseAngle: 'Xin review bang bang chung flight deck: logbook/flight hours, recurrent/simulator check, SOP compliance, safety record, CRM/ATC feedback va muc do san sang cho route/aircraft hoac captain upgrade.',
    };
  }

  if (isAirportGroundRole(jobTitle, industry)) {
    const airportBase = Math.max(targetBase, roundToHalfMillion(salary * 1.2));
    const airportStretch = Math.max(stretchBase, roundToHalfMillion(airportBase * 1.18));
    const airportLead = Math.max(roundToHalfMillion(airportStretch * 1.1), airportStretch);

    return {
      headline: 'Bản đồ tăng lương cho Nhân viên check-in sân bay: từ thao tác quầy check-in sang passenger service có KPI',
      summary: 'Nhân viên check-in sân bay tăng giá trị bằng xử lý quầy check-in đúng quy trình, kiểm tra hộ chiếu/visa, in boarding pass, kiểm soát hành lý ký gửi, service recovery và phối hợp supervisor, gate, baggage service.',
      targetRoles: [
        {
          title: 'Senior Passenger Service Agent',
          why: 'Trả cao hơn khi bạn có log check-in ít lỗi, xử lý hộ chiếu/visa đúng quy trình, boarding pass chính xác và case hành khách khó có supervisor xác nhận.',
          targetSalary: airportBase,
          keywords: ['check-in', 'boarding pass', 'hộ chiếu', 'visa', 'hành lý'],
        },
        {
          title: 'Ground Service Supervisor / Passenger Service Lead',
          why: 'Khi bạn điều phối được quầy check-in, hỗ trợ gate, baggage service và giảm lỗi trong ca đông khách, scope đã lên lead dịch vụ mặt đất.',
          targetSalary: airportStretch,
          keywords: ['quầy check-in', 'passenger service', 'supervisor', 'gate', 'baggage service'],
        },
        {
          title: 'Airport Operations / Ground Service Coordinator',
          why: 'Nếu bạn đóng gói được checklist giấy tờ, error log, handover và KPI vận hành, bạn có cơ sở nhắm role điều phối dịch vụ mặt đất tốt hơn.',
          targetSalary: airportLead,
          keywords: ['airport operations', 'ground service', 'handover', 'DCS check-in'],
        },
      ],
      cvBullets: [
        'Đưa vào CV checklist kiểm tra hộ chiếu/visa, boarding pass, hành lý ký gửi và tỷ lệ lỗi check-in giảm theo ca.',
        'Viết 3-5 case service recovery tại quầy check-in: khách thiếu giấy tờ, trễ chuyến, hành lý quá cước, cần phối hợp gate hoặc cần gọi supervisor can thiệp.',
        'Lưu feedback supervisor, error log DCS/check-in và handover với gate/baggage service để chứng minh năng lực passenger service.',
      ],
      interviewAnchor: `Em nhắm mức ${airportBase.toLocaleString('vi-VN')}đ/tháng trở lên vì em có bằng chứng check-in passenger service: hộ chiếu/visa, boarding pass, hành lý ký gửi, error log và feedback supervisor.`,
      internalRaiseAngle: 'Xin review bằng log 30 ngày tại quầy check-in: số hành khách xử lý, lỗi thông tin giảm, case visa/hộ chiếu, hành lý, gate/baggage handover và feedback supervisor.',
    };
  }

  if (segment === 'aviation') {
    return {
      headline: 'Hướng tăng lương cho tiếp viên: từ bay đủ ca sang hồ sơ cabin crew có bằng chứng',
      summary: 'Tiếp viên hàng không tăng giá trị bằng an toàn bay, service recovery, tiếng Anh tình huống, grooming/teamwork và feedback thật từ senior crew hoặc khách hàng.',
      targetRoles: [
        {
          title: 'Senior Cabin Crew / tuyến quốc tế',
          why: 'Tuyến tốt hơn trả cao hơn khi bạn chứng minh được xử lý khách khó, announcement tiếng Anh, chuẩn grooming và feedback đáng tin.',
          targetSalary: targetBase,
          keywords: ['Cabin safety', 'Service recovery', 'English announcement', 'Senior crew feedback'],
        },
        {
          title: 'Purser / Cabin Leader track',
          why: 'Nếu bạn biết briefing/debrief, hỗ trợ junior và xử lý escalation trong cabin, giá trị không còn chỉ là phục vụ từng khách.',
          targetSalary: stretchBase,
          keywords: ['Purser', 'Cabin leader', 'Briefing', 'Teamwork'],
        },
        {
          title: 'Cabin service trainer / hãng trả tốt hơn',
          why: 'Khi kinh nghiệm bay được đóng gói thành checklist, tình huống mẫu và training cho người mới, bạn có cơ sở nhắm role trả tốt hơn.',
          targetSalary: roundToHalfMillion(stretchBase * 1.1),
          keywords: ['Training cabin crew', 'Service SOP', 'Safety checklist', 'Airline'],
        },
      ],
      cvBullets: [
        'Lưu 3-5 tình huống service recovery đã xử lý, che toàn bộ thông tin riêng tư của hành khách.',
        'Có checklist safety-service, bản ghi announcement tiếng Anh và feedback từ senior crew/đồng nghiệp.',
        'Đóng gói grooming, teamwork, đúng giờ, briefing/debrief và khả năng hỗ trợ junior thành hồ sơ nghề.',
      ],
      interviewAnchor: `Em nhắm mức ${targetBase.toLocaleString('vi-VN')}đ/tháng vì em có thể chứng minh bằng checklist an toàn, service recovery, announcement tiếng Anh và feedback senior crew, không chỉ bằng số năm bay.`,
      internalRaiseAngle: 'Xin review bằng bằng chứng nghề cabin: feedback senior crew, tình huống xử lý khách, checklist safety-service, training/chứng chỉ và mức độ sẵn sàng cho tuyến/role khó hơn.',
    };
  }

  if (segment === 'education_admissions') {
    const isStudyAbroad = /tu van du hoc|du hoc|study abroad|overseas education|visa du hoc/i.test(normalizedJob);
    const admissionsBase = Math.max(targetBase, 14_000_000);
    const admissionsStretch = Math.max(stretchBase, 18_000_000);
    const admissionsLead = Math.max(roundToHalfMillion(stretchBase * 1.12), 24_000_000);

    return {
      headline: isStudyAbroad
        ? 'Bản đồ tăng lương cho tư vấn du học: đi từ tư vấn cảm tính sang hồ sơ, offer/visa và conversion có số'
        : 'Bản đồ tăng lương cho tư vấn tuyển sinh: đi từ gọi lead sang enrollment/admissions có số',
      summary: isStudyAbroad
        ? 'Tư vấn du học tăng giá trị bằng khả năng chẩn đoán nhu cầu, chọn trường-ngành đúng, kiểm hồ sơ/visa không lỗi, follow-up CRM đều và chứng minh offer/visa/enrollment outcome.'
        : 'Tư vấn tuyển sinh cho trung tâm ngoại ngữ hoặc trường tư tăng giá trị bằng lead qualification, tư vấn chương trình học phù hợp, đặt lịch tư vấn/placement test, follow-up CRM đều và chứng minh tỷ lệ đăng ký-đóng phí-nhập học.',
      targetRoles: [
        {
          title: isStudyAbroad ? 'Senior Study Abroad Counselor' : 'Senior Enrollment Counselor',
          why: isStudyAbroad
            ? 'Role này trả cao hơn khi bạn xử lý được nhiều hồ sơ khó, shortlist trường-ngành hợp lý, kiểm giấy tờ đúng deadline và có tỷ lệ offer/visa pass rõ.'
            : 'Role này trả cao hơn khi bạn xử lý được lead khó, tư vấn đúng chương trình/lớp/ngành, bám follow-up đúng hẹn và tăng tỷ lệ đăng ký hoặc đóng phí.',
          targetSalary: admissionsBase,
          keywords: isStudyAbroad
            ? ['Study abroad counselor', 'Visa checklist', 'Offer rate', 'Application tracking']
            : ['Enrollment counselor', 'Placement test', 'Registration conversion', 'CRM follow-up'],
        },
        {
          title: 'Admissions / Enrollment Specialist',
          why: isStudyAbroad
            ? 'Nếu bạn biến tư vấn thành funnel đo được từ lead qualified, consultation booked, hồ sơ nộp, offer đến nhập học, bạn thoát khỏi nhóm chỉ gọi điện tư vấn chung chung.'
            : 'Nếu bạn biến tư vấn thành funnel đo được từ lead qualified, lịch tư vấn, placement test/đăng ký, đóng phí đến nhập học, bạn thoát khỏi nhóm chỉ gọi điện tư vấn chung chung.',
          targetSalary: admissionsStretch,
          keywords: ['Admissions', 'Enrollment funnel', 'CRM follow-up', 'Consultation booked'],
        },
        {
          title: 'Student Recruitment Lead / Admissions Lead',
          why: 'Khi bạn vừa coach được counselor mới vừa kiểm soát conversion và chất lượng hồ sơ, scope đã là lead tuyển sinh chứ không còn nhân viên tư vấn đơn lẻ.',
          targetSalary: admissionsLead,
          keywords: ['Student recruitment lead', 'Admissions lead', 'Counselor coaching', 'Visa outcome'],
        },
      ],
      cvBullets: [
        isStudyAbroad
          ? 'Đưa funnel tư vấn vào CV: số lead qualified, số lịch tư vấn, số hồ sơ nộp, offer rate, visa pass rate và enrollment conversion.'
          : 'Đưa funnel tuyển sinh vào CV: số lead qualified, lịch tư vấn, placement test/đăng ký, tỷ lệ đóng phí, enrollment conversion và no-show giảm.',
        isStudyAbroad
          ? 'Tạo 1 tracker hồ sơ đã ẩn thông tin gồm nhu cầu, ngân sách, shortlist trường, deadline giấy tờ, trạng thái offer/visa và next step.'
          : 'Tạo 1 tracker lead đã ẩn thông tin gồm nguồn lead, nhu cầu học, học phí/ngân sách, chương trình phù hợp, lịch tư vấn/placement test, trạng thái đăng ký-đóng phí-nhập học và next step.',
        isStudyAbroad
          ? 'Viết 1 case tư vấn khó: vấn đề ban đầu, cách chọn trường-ngành/quốc gia, giấy tờ còn thiếu, cách follow-up và kết quả cuối.'
          : 'Viết 1 case tuyển sinh khó: nhu cầu ban đầu, chương trình đã tư vấn, objection về học phí/lịch học, cách follow-up và kết quả đăng ký/nhập học.',
      ],
      interviewAnchor: isStudyAbroad
        ? `Em kỳ vọng khoảng ${admissionsBase.toLocaleString('vi-VN')}đ/tháng trở lên vì em có thể chứng minh bằng funnel tư vấn, hồ sơ nộp đúng hạn, offer/visa outcome, SLA follow-up và feedback khách theo đúng scope admissions/counseling.`
        : `Em kỳ vọng khoảng ${admissionsBase.toLocaleString('vi-VN')}đ/tháng trở lên vì em có thể chứng minh bằng funnel tuyển sinh, lịch tư vấn, placement test/đăng ký, tỷ lệ đóng phí-nhập học, SLA follow-up và feedback khách theo đúng scope enrollment/admissions.`,
      internalRaiseAngle: isStudyAbroad
        ? 'Xin review bằng 30 ngày evidence log: consultation booked, hồ sơ nộp đúng hạn, tỷ lệ thiếu giấy tờ giảm, offer/visa outcome, phản hồi khách và số counselor mới bạn hỗ trợ nếu có.'
        : 'Xin review bằng 30 ngày evidence log: consultation booked, placement test/đăng ký, tỷ lệ đóng phí-nhập học, no-show giảm, phản hồi khách và số counselor mới bạn hỗ trợ nếu có.',
    };
  }

  if (isLanguageCenterManagerRole(jobTitle, industry)) {
    const centerBase = Math.max(targetBase, 18_000_000);
    const centerStretch = Math.max(stretchBase, 24_000_000);
    const centerLead = Math.max(roundToHalfMillion(stretchBase * 1.12), 30_000_000);
    return {
      headline: 'Bản đồ tăng lương cho quản lý trung tâm ngoại ngữ: từ vận hành ca sang owner KPI của campus',
      summary: 'Quản lý trung tâm ngoại ngữ không nên nhảy về track đứng lớp của giáo viên. Giá trị của cấp quản lý nằm ở tuyển sinh, lớp học, lịch học, teacher utilization, tỷ lệ tái tục, complaint SLA, doanh thu trung tâm và khả năng chuẩn hóa vận hành trung tâm.',
      targetRoles: [
        {
          title: 'Language Center Manager có dashboard vận hành',
          why: 'Trả cao hơn khi bạn chứng minh được tuyển sinh, lead-to-enrollment, trial-to-paid, active students, class fill, teacher utilization và complaint SLA bằng dashboard hằng tuần.',
          targetSalary: centerBase,
          keywords: ['Center Manager', 'Enrollment funnel', 'Class fill', 'Complaint SLA'],
        },
        {
          title: 'Academic Operations / Campus Operations Manager',
          why: 'Scope lớn hơn khi bạn điều phối được lịch học, lớp học, giáo viên, phụ huynh, dropout/refund reasons và quality review mà không phải tự mình đứng lớp dạy.',
          targetSalary: centerStretch,
          keywords: ['Academic operations', 'Teacher utilization', 'Retention', 'Roster lớp'],
        },
        {
          title: 'Education Growth / Multi-center Operations Lead',
          why: 'Khi playbook của bạn nhân rộng được cho nhiều lớp học/cơ sở và gắn với doanh thu trung tâm, tỷ lệ tái tục, margin lớp, scope đã lên lead/growth chứ không còn quản lý ca lẻ.',
          targetSalary: centerLead,
          keywords: ['Education growth', 'Multi-center ops', 'Revenue per class', 'Renewal'],
        },
      ],
      cvBullets: [
        'Đưa dashboard trung tâm vào CV: tuyển sinh, lead-to-enrollment, trial-to-paid, active students, class fill rate, teacher utilization, tỷ lệ tái tục và parent complaint SLA.',
        'Viết 1 case vận hành trung tâm: lớp học bị thiếu học viên, giáo viên/lịch học lệch, complaint phụ huynh, dropout/refund tăng hoặc doanh thu trung tâm thấp; kèm root cause và action log 30 ngày.',
        'Chứng minh năng lực cấp quản lý bằng roster lớp, review cadence với giáo viên, SOP xử lý complaint, dropout/refund reasons và revenue per class, không dùng hồ sơ đứng lớp của giáo viên.',
      ],
      interviewAnchor: `Em nhắm mức ${centerBase.toLocaleString('vi-VN')}đ/tháng trở lên cho scope quản lý trung tâm vì em có thể chứng minh bằng tuyển sinh, class fill, teacher utilization, tỷ lệ tái tục, complaint SLA và doanh thu trung tâm. Em muốn được đánh giá theo KPI vận hành trung tâm, không theo giờ đứng lớp của giáo viên.`,
      internalRaiseAngle: 'Xin review bằng dashboard quản lý trung tâm 30 ngày: tuyển sinh, lead-to-enrollment, trial-to-paid, active students, class fill, teacher utilization, lịch học, tỷ lệ tái tục, dropout/refund reasons, parent complaint SLA và doanh thu trung tâm.',
    };
  }

  if (segment === 'education' || segment === 'language_center' || segment === 'freelance_teaching') {
    const isEnglishTeacherTrack = isEnglishTeacherRole(jobTitle, industry);
    const isPublicSubjectTeacherTrack = segment === 'education' && (isPublicSubjectTeacherRole(jobTitle, industry) || !isEnglishTeacherTrack);
    const educationBase = isEnglishTeacherTrack ? Math.max(targetBase, 18_000_000) : Math.max(targetBase, 14_000_000);
    const educationStretch = isEnglishTeacherTrack ? Math.max(stretchBase, 24_000_000) : Math.max(stretchBase, 18_000_000);
    const educationLead = isEnglishTeacherTrack
      ? Math.max(roundToHalfMillion(stretchBase * 1.1), 30_000_000)
      : Math.max(roundToHalfMillion(stretchBase * 1.1), 24_000_000);

    if (isEnglishTeacherTrack) {
      return {
        headline: 'Hướng tăng lương giáo viên tiếng Anh: biến IELTS/CELTA thành kết quả lớp học và retention',
        summary: 'Giáo viên tiếng Anh không nên bị neo ở khung trợ giảng thấp khi có IELTS/CELTA/TESOL. Mức cao hơn đến từ demo class tốt, lesson plan chuẩn, rubric Speaking/Writing, tiến bộ học viên, renewal và feedback phụ huynh/học viên.',
        targetRoles: [
          {
            title: 'IELTS/Cambridge Teacher tại trung tâm hoặc trường quốc tế',
            why: 'Track này trả cao hơn khi bạn chứng minh được band IELTS/Cambridge đầu vào-đầu ra, lesson plan theo mục tiêu rõ, demo class tốt và feedback học viên/phụ huynh.',
            targetSalary: educationBase,
            keywords: ['IELTS Teacher', 'Cambridge Teacher', 'CELTA/TESOL', 'Pre-post test'],
          },
          {
            title: 'Academic Lead / Curriculum Lead môn tiếng Anh',
            why: 'Khi bạn biến năng lực dạy thành rubric, giáo án mẫu, chuẩn chấm bài và training giáo viên khác, lương không còn bị neo theo giờ đứng lớp.',
            targetSalary: educationStretch,
            keywords: ['Academic Lead', 'Curriculum Lead', 'Teacher training', 'Speaking/Writing rubric'],
          },
          {
            title: 'Education Growth / Program Manager tiếng Anh',
            why: 'Nếu bạn đọc được số trial-to-paid, attendance, homework completion, renewal và revenue per class, bạn bước sang nhóm vận hành/tăng trưởng giáo dục trả cao hơn giáo viên chỉ dạy từng lớp.',
            targetSalary: educationLead,
            keywords: ['Education growth', 'Trial-to-paid', 'Renewal', 'Revenue per class'],
          },
        ],
        cvBullets: [
          'Có IELTS/CELTA/TESOL kèm demo class 10-15 phút, lesson plan TESOL-style và rubric Speaking/Writing rõ tiêu chí.',
          'Theo dõi pre-test/post-test, attendance, homework completion, retention/renewal và feedback học viên/phụ huynh theo từng lớp.',
          'Đóng gói 1 case học viên/lớp: điểm đầu vào, can thiệp bài học, tiến bộ sau 4-8 tuần, feedback và bằng chứng xác nhận.',
        ],
        interviewAnchor: `Em nhắm mức ${educationBase.toLocaleString('vi-VN')}đ/tháng trở lên cho track giáo viên tiếng Anh chất lượng cao vì em có IELTS/CELTA/TESOL, demo class, lesson plan chuẩn và số đo tiến bộ học viên. Em muốn được đánh giá theo kết quả lớp học, không theo khung trợ giảng thấp.`,
        internalRaiseAngle: 'Xin review bằng dashboard lớp tiếng Anh: pre-test/post-test, homework completion, attendance, Speaking/Writing rubric, retention/renewal và feedback học viên/phụ huynh.',
      };
    }

    if (isPublicSubjectTeacherTrack) {
      return {
        headline: 'Hướng tăng lương giáo viên bộ môn: biến tiết dạy thành hồ sơ chuyên môn có số',
        summary: 'Giáo viên Toán/Lý/Hóa/Sử/Địa/Ngữ văn/Tin học thường đi theo track trường học, tổ chuyên môn, thi đua, phụ cấp hoặc chuyển sang trường tư/quốc tế cùng bộ môn.',
        targetRoles: [
          {
            title: 'Giáo viên bộ môn nòng cốt',
            why: 'Track này trả/ghi nhận tốt hơn khi bạn có giáo án bộ môn, ma trận đề, rubric và bằng chứng tiến bộ điểm số học sinh theo từng chương.',
            targetSalary: educationBase,
            keywords: ['Giao vien bo mon', 'Ma tran de', 'Rubric cham bai', 'Tien bo hoc sinh'],
          },
          {
            title: 'Tổ phó / Tổ trưởng chuyên môn',
            why: 'Bước lên hợp lý là phụ trách chất lượng bộ môn: dự giờ, góp ý giáo viên, ngân hàng đề, chuyên đề tổ và hồ sơ thi đua/phụ cấp.',
            targetSalary: educationStretch,
            keywords: ['To chuyen mon', 'Chuyen de to', 'Du gio', 'Ho so thi dua'],
          },
          {
            title: 'Subject Lead / Academic Quality bộ môn',
            why: 'Nếu ở trường tư/quốc tế, giá trị tăng khi bạn chứng minh được chất lượng học thuật của môn: chuẩn đầu ra, đề kiểm tra, tiến bộ học sinh và coaching giáo viên.',
            targetSalary: educationLead,
            keywords: ['Subject Lead', 'Academic quality', 'Learning outcome bo mon', 'Teacher coaching'],
          },
        ],
        cvBullets: [
          'Đóng gói 1 chương/bài thành giáo án bộ môn, ma trận đề, rubric, bài học sinh đã ẩn danh và điểm trước-sau.',
          'Lưu bằng chứng dự giờ/góp ý, chuyên đề tổ, phụ đạo/bồi dưỡng và hồ sơ thi đua/phụ cấp nếu ở công lập/biên chế.',
          'Nếu muốn sang tư thục/quốc tế, dùng portfolio bộ môn để chứng minh chất lượng học thuật đúng môn đang dạy.',
        ],
        interviewAnchor: `Em kỳ vọng khoảng ${educationBase.toLocaleString('vi-VN')}đ/tháng trở lên cho track giáo viên bộ môn vì em có thể chứng minh tiến bộ học sinh bằng giáo án, ma trận đề, rubric, điểm trước-sau và hồ sơ chuyên môn chứ không chỉ nói em dạy tốt.`,
        internalRaiseAngle: 'Xin review bằng hồ sơ chuyên môn: giáo án bộ môn, ma trận đề, rubric, tiến bộ điểm số, chuyên đề tổ, phụ đạo/bồi dưỡng và xác nhận dự giờ.',
      };
    }

    if (segment === 'freelance_teaching') {
      const tutorBase = Math.max(targetBase, 14_000_000);
      const tutorStretch = Math.max(stretchBase, 22_000_000);
      const tutorLead = Math.max(roundToHalfMillion(stretchBase * 1.15), 30_000_000);
      return {
        headline: 'Hướng tăng lương giáo viên tự do/gia sư: bán outcome, học liệu và bằng chứng tiến bộ',
        summary: 'Gia sư hoặc giáo viên tự do không nên bị kéo sang vận hành trung tâm. Mức cao hơn đến từ gói học theo mục tiêu, test đầu vào/đầu ra, học liệu tái dùng, feedback thật và tỷ lệ học viên gia hạn/giới thiệu.',
        targetRoles: [
          {
            title: 'Gia sư premium theo outcome',
            why: 'Tăng giá bằng gói học có mục tiêu rõ, bài kiểm tra đầu vào/đầu ra và feedback phụ huynh/học viên thay vì bán giờ lẻ.',
            targetSalary: tutorBase,
            keywords: ['Outcome package', 'Pre-post test', 'Feedback', 'Renewal'],
          },
          {
            title: 'Giáo viên nhóm nhỏ / cohort online',
            why: 'Khi có workbook, video/quiz và lịch feedback, bạn có thể phục vụ nhiều học viên hơn mà vẫn giữ chất lượng.',
            targetSalary: tutorStretch,
            keywords: ['Cohort', 'Workbook', 'Quiz', 'Completion'],
          },
          {
            title: 'Chủ lớp/academy niche',
            why: 'Nếu đóng gói được giáo trình, testimonial, referral và quy trình vận hành lớp nhỏ, thu nhập không còn phụ thuộc hoàn toàn vào số giờ đứng lớp.',
            targetSalary: tutorLead,
            keywords: ['Academy niche', 'Referral', 'Course asset', 'Revenue per cohort'],
          },
        ],
        cvBullets: [
          'Đóng gói gói học theo outcome: mục tiêu, test đầu vào, lịch học, bài tập, feedback và điểm sau 4-8 tuần.',
          'Lưu testimonial/feedback thật, tỷ lệ hoàn thành bài, renewal/referral và doanh thu mỗi cohort/lớp nhỏ.',
          'Tạo workbook/video/quiz tái dùng để tăng chất lượng và giảm phụ thuộc vào bán giờ lẻ.',
        ],
        interviewAnchor: `Em kỳ vọng khoảng ${tutorBase.toLocaleString('vi-VN')}đ/tháng trở lên vì em bán kết quả học tập có đo được: test đầu vào/đầu ra, workbook, feedback và tỷ lệ học viên tiếp tục học.`,
        internalRaiseAngle: 'Nếu hợp tác với trung tâm/lớp nhóm, xin review bằng outcome học viên, completion, feedback, renewal/referral và chất lượng học liệu.',
      };
    }

    return {
      headline: 'Hướng tăng lương ngành giáo dục: biến đứng lớp/vận hành thành số tuyển sinh và retention',
      summary: 'Ngành giáo dục trả thêm khi bạn chứng minh được học viên vào lớp, học viên ở lại, lớp lấp đầy, complaint giảm và giáo viên vận hành ổn.',
      targetRoles: [
        {
          title: 'Academic Operations / Center Manager',
          why: 'Vai trò này trả cao hơn khi bạn có dashboard học viên active, trial-to-paid, retention, class fill rate và complaint SLA.',
          targetSalary: educationBase,
          keywords: ['Center Manager', 'Retention', 'Trial-to-paid', 'Class fill rate'],
        },
        {
          title: 'Training Lead / Curriculum Coordinator',
          why: 'Nếu có nền tảng học thuật, hãy biến nó thành chuẩn đào tạo giáo viên, curriculum và kết quả học viên đo được.',
          targetSalary: educationStretch,
          keywords: ['Training Lead', 'Curriculum', 'Teacher training', 'Learning outcome'],
        },
        {
          title: 'Growth Manager giáo dục',
          why: 'Kết hợp vận hành + tuyển sinh + giữ chân học viên là hướng tăng lương mạnh hơn làm tác vụ rời rạc.',
          targetSalary: educationLead,
          keywords: ['Education growth', 'Enrollment', 'Renewal', 'Revenue per class'],
        },
      ],
      cvBullets: [
        'Đưa số học viên active, retention/churn, trial-to-paid, class fill rate và complaint SLA vào hồ sơ.',
        'Viết 1 case tăng enrollment/retention hoặc giảm complaint bằng quy trình cụ thể.',
        'Chứng minh đã chuẩn hóa giáo viên/lịch lớp/curriculum, không chỉ “quản lý trung tâm”.',
      ],
      interviewAnchor: `Em kỳ vọng khoảng ${educationBase.toLocaleString('vi-VN')}đ/tháng vì em có thể chứng minh bằng enrollment, retention, trial-to-paid, class fill rate và complaint SLA.`,
      internalRaiseAngle: 'Xin review bằng dashboard tuần: tuyển sinh, giữ chân học viên, lấp lớp, tận dụng giáo viên và complaint SLA.',
    };
  }

  if (segment === 'engineering' && /cong nhan|factory worker|machine operator|production operator|van hanh may/i.test(normalizeJob(jobTitle))) {
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

  const languageRoles: JobJumpRole[] = [
    {
      title: `${jobTitle} tại môi trường có KPI và scope rõ`,
      why: `Hướng này khớp nhất khi bạn chứng minh được ${roleLanguage.kpiGuidance.toLowerCase()}`,
      targetSalary: targetBase,
      keywords: [jobTitle, 'KPI nghề', 'case study', 'review lương'],
    },
    {
      title: `Senior / Specialist ${jobTitle}`,
      why: `Đi lên band cao hơn bằng ${roleLanguage.mainSkill}, kèm bằng chứng: ${roleLanguage.proofAsset}.`,
      targetSalary: stretchBase,
      keywords: [jobTitle, 'senior', 'specialist', ...roleLanguage.mainSkill.split('+').map(s => s.trim()).slice(0, 2)],
    },
    {
      title: `Lead / Owner mảng ${jobTitle}`,
      why: `Khi đã có ${roleLanguage.productWord} và KPI ổn định, bạn có thể xin scope lớn hơn hoặc chuyển sang nơi trả premium hơn.`,
      targetSalary: roundToHalfMillion(stretchBase * 1.1),
      keywords: [jobTitle, 'lead', 'owner', 'premium segment'],
    },
  ];

  const roles = targetRolesBySegment[segment] ?? languageRoles;

  return {
    headline: buildFallbackHeadline(jobTitle, segment),
    summary: buildFallbackSummary(jobTitle, percent, segment, roleLanguage),
    targetRoles: roles,
    cvBullets: [
      `Chuyển mô tả công việc thành 1 bullet có số theo đúng KPI nghề: ${roleLanguage.kpiGuidance}`,
      `Gắn 1 case cụ thể với kỹ năng tạo khoảng cách lương: ${roleLanguage.mainSkill}`,
      `Tạo ${roleLanguage.portfolioWord}: ${roleLanguage.proofAsset}.`,
    ],
    interviewAnchor: buildFallbackInterviewAnchor(jobTitle, targetBase, stretchBase, roleLanguage),
    internalRaiseAngle: buildFallbackRaiseAngle(jobTitle, roleLanguage),
  };
}

export function buildJobJumpMap(jobTitle: string, salary: number, percent: number, industry?: string | null): JobJumpMap {
  return repairReportDisplayTextDeep(repairMojibakeDeep(buildJobJumpMapRaw(jobTitle, salary, percent, industry)));
}
