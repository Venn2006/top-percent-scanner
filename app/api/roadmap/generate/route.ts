import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseServer } from '@/lib/supabase';
import { getCareerCompassContext } from '@/lib/careerCompassEngine';
import { enforceOrigin, rateLimit } from '@/lib/apiProtection';
import { getRoadmapAccessCode, roadmapAccessCodeMatches } from '@/lib/roadmapAccess';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface WeekPlan {
  week: number;
  focus: string;       // "Tuần 1: Xây portfolio"
  tasks: string[];     // 3-4 tasks cụ thể
  milestone: string;   // Kết quả đo được cuối tuần
}

interface RoadmapData {
  format?: 'weekly' | 'markdown' | 'expert_v2';
  version?: number;
  goal: string;
  summary: string;
  weeks: WeekPlan[];
  negotiation_timing: string;  // "Tuần X là thời điểm tốt nhất để đàm phán"
  salary_projection: string;   // "Nếu hoàn thành 80% tasks, lương kỳ vọng: X triệu"
  markdown?: string;
  intake?: RoadmapIntake;
  actionPlan?: RoadmapActionPlan;
}

interface RoadmapIntake {
  currentPosition?: string;
  mainWeakness?: string;
  twoYearGoal?: string;
  educationLevel?: string;
  educationDetail?: string;
  strongSkills?: string;
  proofAssets?: string;
  bottleneck?: string;
  preferredPath?: string;
  weeklyTime?: string;
}

interface RoadmapActionPlan {
  standardWeeks: number;
  flexibleWeeks: number;
  weeklyHours: string;
  completionRule: string;
  levelName: string;
  milestones: RoadmapMilestone[];
}

interface RoadmapMilestone {
  month: number;
  title: string;
  objective: string;
  skills: string[];
  weeks: RoadmapActionWeek[];
}

interface RoadmapActionWeek {
  week: number;
  focus: string;
  tasks: RoadmapActionTask[];
  checkpoint: string;
}

interface RoadmapActionTask {
  title: string;
  skill: string;
  output: string;
  kpi: string;
  doneDefinition: string;
}

function formatRoadmapDuration(months: number) {
  return months === 12 ? '1 năm' : `${months} tháng`;
}

function getRoadmapMilestoneLabels(months: number) {
  if (months <= 3) return ['Tháng 1', 'Tháng 2', 'Tháng 3'];
  if (months <= 6) return ['Tháng 1', 'Tháng 3', 'Tháng 6'];
  return ['Tháng 1', 'Tháng 3', 'Tháng 6', 'Tháng 12'];
}

function detectRoadmapSegment(jobTitle: string) {
  const normalized = jobTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/fresher|new graduate|sinh vien|moi tot nghiep|moi ra truong/.test(normalized)) {
    return {
      label: 'sinh viên mới tốt nghiệp',
      priority: 'offer đầu đời, thử việc, portfolio, CV bullet, LinkedIn proof và script deal sau 60-90 ngày',
      proof: 'portfolio mini, feedback của mentor/quản lý, checklist học việc, KPI hoàn thành task đúng hạn',
    };
  }

  if (/cong nhan|binh duong|factory worker|machine operator|production operator|van hanh may/.test(normalized)) {
    return {
      label: 'công nhân sản xuất tại cụm Bình Dương/FDI',
      priority: 'năng suất, chuyên cần, an toàn lao động, kỹ năng vận hành máy, đề xuất lên tổ phó/tổ trưởng',
      proof: 'sản lượng/giờ, tỷ lệ lỗi, số ngày chuyên cần, số lần hỗ trợ line, chứng nhận an toàn hoặc vận hành máy',
    };
  }

  if (isMcRole(normalized)) {
    return {
      label: 'MC / người dẫn chương trình / host sự kiện',
      priority: 'showreel bán hàng, kịch bản sân khấu, xử lý tình huống live, rate card theo format sự kiện và feedback khách/agency',
      proof: 'video highlight 60-90 giây, 3 mẫu lời dẫn, feedback khách hàng, checklist briefing/rehearsal, case xử lý sự cố sân khấu',
    };
  }

  if (isChefRole(normalized)) {
    return {
      label: 'Đầu bếp / bếp nhà hàng / F&B',
      priority: 'food cost, waste rate, tốc độ ra món, chuẩn món giờ cao điểm, an toàn bếp và năng lực dẫn ca',
      proof: 'recipe card có định lượng/cost, bảng waste, log tốc độ ra món, feedback khách, checklist SOP bếp và bằng chứng training phụ bếp',
    };
  }

  if (isAviationRole(normalized)) {
    return {
      label: 'Tiếp viên hàng không / cabin crew / dịch vụ hàng không',
      priority: 'an toàn bay, service recovery, giao tiếp tiếng Anh, grooming, teamwork, feedback senior crew và sẵn sàng tuyến/role khó hơn',
      proof: 'checklist safety-service, ghi âm announcement tiếng Anh, feedback senior crew/đồng nghiệp, chứng chỉ training, ghi chú tình huống xử lý khách đã che thông tin riêng tư',
    };
  }

  return null;
}

function isMcRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /\bmc\b|nguoi dan|dan chuong trinh|host|su kien|event host|livestream host|presenter|moderator|voice over|wedding mc/.test(normalized);
}

function isChefRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /dau bep|chef|bep truong|bep pho|sous chef|cook|nha hang|restaurant|f&b|fnb|kitchen/.test(normalized);
}

function isAviationRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /tiep vien hang khong|cabin crew|flight attendant|stewardess|steward|hang khong|airline|hang bay/.test(normalized);
}

function hasWrongDomainLeak(jobTitle: string, value: string): boolean {
  const isNonTechPersonalRole = isMcRole(jobTitle) || isChefRole(jobTitle) || isAviationRole(jobTitle);
  if (!isNonTechPersonalRole) return false;
  const techLeak = /github|typescript|javascript|api integration|system design|debugging|technical doc|code review|developer workflow|sql\b|codebase|pull request|frontend|backend/i.test(value);
  if (techLeak) return true;
  if (isAviationRole(jobTitle)) {
    return /dashboard|doanh thu|revenue|học viên|hoc vien|student|trial-to-paid|teacher utilization|food cost|recipe card|kitchen sop|showreel|rate card/i.test(value);
  }
  if (isChefRole(jobTitle)) {
    return /đang ở công ty|dang o cong ty|tại công ty|tai cong ty|công ty trả|cong ty tra/i.test(value);
  }
  return false;
}

function getRoleLanguage(jobTitle: string, compass: ReturnType<typeof getCareerCompassContext>) {
  const normalized = normalizeForRoadmapQuality(jobTitle);
  if (isMcRole(normalized)) {
    return {
      rolePath: 'MC chuyên nghiệp / host sự kiện có showreel, rate card và case xử lý sân khấu',
      mainSkill: 'showreel bán hàng + kịch bản sân khấu + xử lý tình huống live + rate card theo format sự kiện',
      proofAsset: 'video highlight, mẫu lời dẫn, feedback khách hàng, ảnh/link show và checklist briefing/rehearsal',
      opportunityList: 'agency sự kiện, wedding planner, brand activation, livestream commerce, talkshow, corporate event',
      portfolioWord: 'hồ sơ MC',
      productWord: 'bằng chứng nghề',
    };
  }
  if (isChefRole(normalized)) {
    return {
      rolePath: 'Ca trưởng bếp / Sous Chef / bếp chuỗi có KPI vận hành',
      mainSkill: 'food cost + waste rate + tốc độ ra món + chuẩn SOP bếp giờ cao điểm',
      proofAsset: 'recipe card có định lượng/cost, bảng waste, log tốc độ ra món, feedback khách và checklist training phụ bếp',
      opportunityList: 'chuỗi nhà hàng, khách sạn, catering, bếp trung tâm hoặc bếp có KPI vận hành rõ',
      portfolioWord: 'hồ sơ bếp',
      productWord: 'bằng chứng nghề bếp',
    };
  }
  if (isAviationRole(normalized)) {
    return {
      rolePath: 'Senior Cabin Crew / Purser / tuyến quốc tế',
      mainSkill: 'an toàn bay + service recovery + announcement tiếng Anh + feedback senior crew',
      proofAsset: 'checklist safety-service, feedback senior crew/đồng nghiệp, ghi âm announcement, chứng chỉ training và ghi chú tình huống xử lý khách đã che thông tin riêng tư',
      opportunityList: 'hãng bay, tuyến quốc tế, senior cabin crew, purser track, cabin service trainer hoặc đơn vị dịch vụ hàng không trả tốt hơn',
      portfolioWord: 'hồ sơ cabin crew',
      productWord: 'bằng chứng dịch vụ bay',
    };
  }
  return {
    rolePath: compass.nextMilestone,
    mainSkill: compass.topSkillGap,
    proofAsset: 'file/link/ảnh chụp chứng minh kết quả, số liệu trước/sau và người xác nhận',
    opportunityList: 'công ty/trường/trung tâm/nhà máy/role có khả năng trả cao hơn',
    portfolioWord: 'portfolio',
    productWord: 'sản phẩm/bằng chứng',
  };
}

function normalizeSurveyText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLowInfoSurveyValue(value: string) {
  const normalized = normalizeSurveyText(value);
  if (!normalized) return true;
  return /^(khong biet|chua biet|khong ro|chua ro|khong chac|chua chac|khong co|chua co|none|null|na|n a)$/i.test(normalized) ||
    normalized.includes('khong biet nen') ||
    normalized.includes('khong biet minh') ||
    normalized.includes('chua biet nen');
}

function cleanIntakeValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!cleaned || isLowInfoSurveyValue(cleaned)) return undefined;
  return cleaned;
}

function sameOptionalValue(a?: string, b?: string): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

function intakeMatches(existing: unknown, incoming: RoadmapIntake): boolean {
  const saved = (existing as RoadmapData | null)?.intake;
  if (!saved) return false;
  return (
    sameOptionalValue(saved.currentPosition, incoming.currentPosition) &&
    sameOptionalValue(saved.mainWeakness, incoming.mainWeakness) &&
    sameOptionalValue(saved.twoYearGoal, incoming.twoYearGoal) &&
    sameOptionalValue(saved.educationLevel, incoming.educationLevel) &&
    sameOptionalValue(saved.educationDetail, incoming.educationDetail) &&
    sameOptionalValue(saved.strongSkills, incoming.strongSkills) &&
    sameOptionalValue(saved.proofAssets, incoming.proofAssets) &&
    sameOptionalValue(saved.bottleneck, incoming.bottleneck) &&
    sameOptionalValue(saved.preferredPath, incoming.preferredPath) &&
    sameOptionalValue(saved.weeklyTime, incoming.weeklyTime)
  );
}

function getSavedIntake(existing: unknown): RoadmapIntake {
  const saved = (existing as RoadmapData | null)?.intake;
  return {
    currentPosition: cleanIntakeValue(saved?.currentPosition),
    mainWeakness: cleanIntakeValue(saved?.mainWeakness),
    twoYearGoal: cleanIntakeValue(saved?.twoYearGoal),
    educationLevel: cleanIntakeValue(saved?.educationLevel),
    educationDetail: cleanIntakeValue(saved?.educationDetail),
    strongSkills: cleanIntakeValue(saved?.strongSkills),
    proofAssets: cleanIntakeValue(saved?.proofAssets),
    bottleneck: cleanIntakeValue(saved?.bottleneck),
    preferredPath: cleanIntakeValue(saved?.preferredPath),
    weeklyTime: cleanIntakeValue(saved?.weeklyTime),
  };
}

const normalizeForRoadmapQuality = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bw\d+\b|\btuan\s+\d+\b|\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();

function hasGoodMarkdownRoadmap(value: unknown): boolean {
  const roadmap = value as RoadmapData | null;
  const markdown = typeof roadmap?.markdown === 'string' ? roadmap.markdown.trim() : '';
  return markdown.length >= 700 && /tháng\s*(1|3|6|12)/i.test(markdown);
}

function hasEducationFitSection(value: unknown): boolean {
  const roadmap = value as RoadmapData | null;
  const markdown = typeof roadmap?.markdown === 'string' ? roadmap.markdown : '';
  return /độ khớp học vấn với lương/i.test(markdown);
}

function hasActionPlan(value: unknown): boolean {
  const plan = (value as RoadmapData | null)?.actionPlan;
  const milestones = Array.isArray(plan?.milestones) ? plan.milestones : [];
  const taskCount = milestones.reduce((total, milestone) => (
    total + (milestone.weeks || []).reduce((weekTotal, week) => weekTotal + (week.tasks || []).length, 0)
  ), 0);
  return Boolean(plan?.standardWeeks && plan?.flexibleWeeks && taskCount >= 12);
}

function hasBlockedCustomerTerm(value: string): boolean {
  return /\b(AI|DeepSeek|ChatGPT|Claude)\b/.test(value);
}

function hasUnknownSurveyLeak(value: string): boolean {
  return /không biết|khong biet|chưa biết|chua biet/i.test(value);
}

function isLowQualityRoadmap(value: unknown, jobTitle = ''): value is RoadmapData {
  const roadmap = value as RoadmapData | null;
  if (roadmap?.format === 'expert_v2') {
    const markdown = typeof roadmap.markdown === 'string' ? roadmap.markdown : '';
    return (
      roadmap.version !== 2 ||
      !hasGoodMarkdownRoadmap(roadmap) ||
      !hasEducationFitSection(roadmap) ||
      !hasActionPlan(roadmap) ||
      hasBlockedCustomerTerm(markdown) ||
      hasUnknownSurveyLeak(markdown) ||
      hasWrongDomainLeak(jobTitle, JSON.stringify(roadmap))
    );
  }
  return true;
}

function buildFallbackRoadmap(
  jobTitle: string,
  currentSalary: number,
  targetSalary: number,
  durationMonths: number,
  compass: ReturnType<typeof getCareerCompassContext>,
  segment: ReturnType<typeof detectRoadmapSegment>,
  intake: RoadmapIntake = {}
): RoadmapData {
  const totalWeeks = Math.min(Math.max(durationMonths * 4, 4), 48);
  const normalized = normalizeForRoadmapQuality(jobTitle);
  const isTeacher = /giao vien|teacher|teaching|tieng anh|english|giang day/.test(normalized);
  const isWorker = /cong nhan|factory|production|van hanh may|operator/.test(normalized);
  const isFresh = /fresher|sinh vien|moi tot nghiep|moi ra truong|new graduate/.test(normalized);
  const isPerformer = isMcRole(normalized);
  const isChef = isChefRole(normalized);
  const isAviation = isAviationRole(normalized);
  const roleLanguage = getRoleLanguage(jobTitle, compass);
  const targetLabel = `${(targetSalary / 1_000_000).toFixed(1)} triệu/tháng`;
  const gapLabel = `${Math.max(0, targetSalary - currentSalary).toLocaleString('vi-VN')}đ/tháng`;
  const segmentNote = segment ? ` Ưu tiên riêng cho nhóm này: ${segment.priority}.` : '';
  const rolePath = isPerformer
    ? roleLanguage.rolePath
    : isChef
    ? roleLanguage.rolePath
    : isAviation
    ? roleLanguage.rolePath
    : isTeacher
    ? 'Corporate Training / E-learning'
    : isWorker
      ? 'tổ phó/tổ trưởng hoặc line vận hành tốt hơn'
      : isFresh
        ? 'offer đầu đời tốt hơn sau thử việc'
        : compass.nextMilestone;

  const blueprints = [
    {
      focus: `Chốt hướng tăng lương: ${rolePath}`,
      milestone: `Có 1 trang mục tiêu gồm mức hiện tại, mức đích ${targetLabel}, 3 năng lực thiếu và 10 nơi/role đáng nhắm tới.`,
      tasks: [
        `Viết rõ 3 role có thể trả cao hơn cho ${jobTitle}; ghi mức lương mục tiêu, yêu cầu chính và lý do bạn phù hợp.`,
        'Chụp lại hoặc lưu 5 tin tuyển dụng/band lương liên quan để làm bằng chứng thị trường.',
        isPerformer
          ? 'Tạo kho bằng chứng MC gồm: video showreel, ảnh sân khấu, feedback khách/agency, format sự kiện, mức phí đã nhận và người xác nhận.'
          : isChef
          ? 'Tạo kho bằng chứng nghề bếp gồm: recipe card, định lượng/cost món, waste log, tốc độ ra món, ảnh plating, feedback khách và người xác nhận.'
          : isAviation
          ? 'Tạo kho bằng chứng cabin crew gồm: checklist safety-service, ghi âm announcement tiếng Anh, feedback senior crew/đồng nghiệp, chứng chỉ training và 3 tình huống xử lý khách đã che thông tin riêng tư.'
          : 'Tạo file evidence log gồm: việc đã làm, số liệu trước/sau, ảnh/link chứng minh, người xác nhận.',
        `Chọn 1 năng lực trọng tâm tuần sau: ${roleLanguage.mainSkill}.`,
      ],
    },
    {
      focus: `Học đúng 1 kỹ năng tạo chênh lệch lương`,
      milestone: `Có checklist kỹ năng và 1 bài thực hành chứng minh bạn đã dùng được ${roleLanguage.mainSkill}.`,
      tasks: [
        isPerformer
          ? 'Xem lại 3 video MC/host cùng phân khúc, ghi ra cách họ mở màn, chuyển đoạn, cứu nhịp và xử lý khách mời khó.'
          : isChef
          ? 'Chọn 3 món đang bán/chế biến nhiều nhất, ghi rõ định lượng, thời gian chuẩn bị, food cost ước tính và lỗi thường gặp khi ra món.'
          : isAviation
          ? 'Chọn 3 tình huống cabin crew hay gặp: khách lo lắng, complaint dịch vụ, yêu cầu đặc biệt hoặc trễ nối chuyến; ghi cách xử lý đúng quy trình và câu nói nên dùng.'
          : `Học 3 tài liệu/video ngắn về ${roleLanguage.mainSkill}; ghi lại 10 ý có thể áp dụng ngay vào công việc.`,
        isPerformer
          ? 'Biến 1 format sự kiện quen thuộc thành checklist: brief khách, key message, timeline, điểm chuyển đoạn, phương án xử lý trễ giờ.'
          : isChef
          ? 'Biến 1 ca bếp đông khách thành checklist: chuẩn bị mise en place, thứ tự ra món, điểm kiểm chất lượng, an toàn và bàn giao cuối ca.'
          : isAviation
          ? 'Biến 1 ca/chuyến bay thành checklist cá nhân: grooming, briefing, safety demo, service flow, xử lý complaint, teamwork và debrief sau chuyến.'
          : 'Biến 1 công việc hiện tại thành checklist có tiêu chí đạt/chưa đạt, thời gian hoàn thành và lỗi thường gặp.',
        `Làm 1 bài thực hành nhỏ liên quan trực tiếp tới ${jobTitle}, không học lan man.`,
        'Nhờ 1 người có kinh nghiệm review checklist và ghi lại 3 điểm cần sửa.',
      ],
    },
    {
      focus: isPerformer ? 'Tạo showreel và bộ hồ sơ MC có thể gửi khách' : isChef ? 'Tạo hồ sơ bếp có recipe card, cost và SOP' : isAviation ? 'Tạo hồ sơ cabin crew có feedback và tình huống phục vụ thật' : 'Tạo sản phẩm mẫu có thể đưa vào portfolio',
      milestone: isPerformer ? 'Có 1 showreel 60-90 giây, 3 mẫu lời dẫn và 1 rate card theo format sự kiện.' : isChef ? 'Có 3 recipe card có cost, 1 waste log, 1 checklist SOP bếp và ảnh plating trước/sau.' : isAviation ? 'Có checklist safety-service, 2 feedback senior crew/đồng nghiệp, 1 bản ghi announcement và 3 tình huống service recovery đã che thông tin khách.' : 'Có 1 bằng chứng nhìn thấy được: tài liệu, video, dashboard, quy trình, bài mẫu hoặc case study.',
      tasks: [
        isPerformer
          ? 'Cắt 1 video showreel 60-90 giây gồm: mở màn, chuyển đoạn, tương tác khán giả và xử lý tình huống.'
          : isChef
          ? 'Làm 3 recipe card cho món chủ lực: định lượng, cost nguyên liệu, thời gian chuẩn bị, tiêu chuẩn plating và lỗi cần tránh.'
          : isAviation
          ? 'Làm 1 checklist safety-service cho ca bay: trước chuyến, lúc boarding, phục vụ, xử lý yêu cầu đặc biệt, complaint và debrief.'
          : isTeacher
          ? 'Thiết kế outline 1 buổi học/mini course 30-45 phút cho người đi làm, có mục tiêu học, bài tập và tiêu chí đánh giá.'
          : `Tạo 1 bằng chứng nghề gắn với ${compass.nextMilestone}: tài liệu, quy trình, bảng theo dõi, dashboard hoặc demo.`,
        isPerformer
          ? 'Viết 3 mẫu lời dẫn: khai mạc, chuyển tiết mục/khách mời và cứu timeline khi chương trình bị trễ.'
          : isChef
          ? 'Ghi waste log trong 3 ca: nguyên liệu hao hụt, lý do hỏng/thiếu, cách giảm hao hụt ca sau.'
          : isAviation
          ? 'Ghi 3 tình huống phục vụ đã gặp hoặc mô phỏng: chuyện xảy ra, cách bạn phản hồi, quy trình đã theo và điều cần cải thiện.'
          : 'Ghi lại phiên bản trước/sau để chứng minh bằng chứng này giúp tiết kiệm thời gian, giảm lỗi hoặc tăng chất lượng.',
        isPerformer
          ? 'Làm rate card theo 3 tầng: event nhỏ, corporate/wedding premium, livestream/activation; ghi rõ bao gồm rehearsal hay không.'
          : isChef
          ? 'Tạo checklist SOP cho 1 ca đông khách: prep, line setup, ra món, kiểm plating, vệ sinh và bàn giao.'
          : isAviation
          ? 'Xin 2 feedback ngắn từ senior crew/đồng nghiệp về: grooming, teamwork, xử lý khách và mức sẵn sàng cho tuyến/role khó hơn.'
          : 'Đưa bằng chứng nghề cho 1 quản lý/đồng nghiệp/khách hàng xem và xin nhận xét cụ thể.',
        `Lưu ${roleLanguage.proofAsset} vào ${roleLanguage.portfolioWord} kèm ngày tạo, link, ảnh chụp và người xác nhận.`,
      ],
    },
    {
      focus: 'Chạy thử với người thật để lấy feedback',
      milestone: 'Có feedback thật từ ít nhất 2 người và 1 phiên bản đã sửa sau feedback.',
      tasks: [
        isTeacher
          ? 'Dạy thử/quay thử 1 phần bài học 10-15 phút, gửi cho 2 học viên/người đi làm xem.'
          : isPerformer
            ? 'Gửi showreel và 1 mẫu lời dẫn cho 2 MC/producer/agency quen biết, xin nhận xét thật về giọng, năng lượng và độ chuyên nghiệp.'
            : isChef
            ? 'Nhờ bếp trưởng/ca trưởng hoặc 2 đồng nghiệp nếm/soát 3 món theo checklist plating, vị, nhiệt độ và tốc độ ra món.'
            : isAviation
            ? 'Nhờ senior crew/đồng nghiệp review checklist safety-service, bản ghi announcement và 1 tình huống service recovery; xin nhận xét thật, không cần số liệu nội bộ.'
            : 'Cho 2 người dùng thử bằng chứng nghề hoặc áp dụng vào 1 việc thật trong tuần.',
        'Hỏi feedback theo 3 câu: dễ hiểu không, phần nào hữu ích nhất, phần nào cần sửa để dùng thật.',
        'Sửa bằng chứng nghề dựa trên feedback, ghi rõ trước/sau đã thay đổi gì.',
        'Xin 1 quote ngắn có thể dùng trong CV/LinkedIn hoặc buổi deal lương.',
      ],
    },
    {
      focus: 'Đo impact bằng KPI',
      milestone: 'Có ít nhất 1 chỉ số trước/sau đủ dùng để nói chuyện tăng lương.',
      tasks: [
        isAviation
          ? 'Chọn 1 tiêu chí dễ theo dõi tuần này: checklist safety-service hoàn thành, 1 feedback tốt từ senior crew, 1 tình huống khách khó xử lý êm hoặc announcement tiếng Anh luyện 5 lần có ghi âm.'
          : `Chọn 1 KPI sát với ${jobTitle}: thời gian xử lý, lỗi giảm, doanh thu, học viên hoàn thành, năng suất hoặc phản hồi khách hàng.`,
        isAviation
          ? 'Ghi mốc nền bằng bằng chứng cá nhân hợp lệ: checklist tự đánh giá, nhận xét senior crew/đồng nghiệp, chứng chỉ training hoặc ghi chú tình huống đã che thông tin khách.'
          : 'Ghi lại mốc hiện tại trong 3-5 ngày hoặc lấy số liệu gần nhất đang có.',
        isPerformer
          ? 'Áp dụng checklist briefing/rehearsal vào 1 show thật hoặc buổi tập, ghi lại điểm nào giúp chương trình mượt hơn.'
          : isChef
          ? 'Áp dụng recipe card và SOP vào 1 ca thật, ghi lại food cost, waste, thời gian ra món và phản hồi khách/bếp trưởng.'
          : isAviation
          ? 'Áp dụng checklist trong 1 ca/chuyến bay hoặc buổi mô phỏng; ghi điểm làm tốt, điểm cần sửa và feedback từ senior crew/đồng nghiệp.'
          : 'Áp dụng bằng chứng nghề vào công việc thật và ghi kết quả sau khi áp dụng.',
        'Viết 1 dòng kết luận: tôi tạo ra thay đổi gì, bằng số nào, trong bao lâu.',
      ],
    },
    {
      focus: 'Đóng gói thành case study 1 trang',
      milestone: 'Có 1 case study ngắn đủ để gửi cho HR/sếp/khách hàng.',
      tasks: [
        isPerformer
          ? 'Viết case theo format: Bối cảnh sự kiện - Rủi ro sân khấu - Cách xử lý - Feedback khách hàng.'
          : isChef
          ? 'Viết case theo format: Món/ca bếp - Vấn đề cost/tốc độ/chất lượng - Cách xử lý - Kết quả bằng số.'
          : isAviation
          ? 'Viết case theo format: Bối cảnh chuyến bay - Tình huống khách/cabin - Cách xử lý theo quy trình - Feedback hoặc bài học rút ra.'
          : 'Viết case theo format: Vấn đề - Hành động - Kết quả - Bằng chứng.',
        'Thêm 2 ảnh/link minh chứng vào case study, tránh viết cảm tính.',
        isPerformer
          ? 'Đổi kết quả thành ngôn ngữ khách hàng hiểu: chương trình đúng giờ, khách mời tương tác tốt, brand tone đúng, sự cố được xử lý êm.'
          : isChef
          ? 'Đổi kết quả thành ngôn ngữ quản lý hiểu: giảm waste, giữ cost, ra món nhanh hơn, complaint giảm, món đồng đều hơn.'
          : isAviation
          ? 'Đổi kết quả thành ngôn ngữ hãng bay hiểu: an toàn đúng quy trình, khách được trấn an, complaint được xử lý êm, teamwork tốt và không lộ dữ liệu hành khách.'
          : 'Đổi kết quả thành ngôn ngữ kinh doanh: tiết kiệm giờ, giảm lỗi, tăng tỷ lệ hoàn thành hoặc tăng doanh thu.',
        'Nhờ 1 người đọc case trong 2 phút và nói lại họ hiểu bạn tạo giá trị gì không.',
      ],
    },
    {
      focus: 'Sửa CV/LinkedIn để bán đúng giá trị',
      milestone: 'Có CV/LinkedIn mới với ít nhất 3 bullet có số liệu.',
      tasks: [
        `Viết lại headline theo role mục tiêu: ${rolePath}.`,
        isPerformer
          ? 'Chuyển case thành 3 dòng hồ sơ MC: loại sự kiện + quy mô khách/brand + vai trò bạn xử lý + feedback/kết quả.'
          : isChef
          ? 'Chuyển case thành 3 dòng hồ sơ bếp: món/ca phụ trách + số suất/food cost/waste + kết quả chất lượng hoặc tốc độ.'
          : isAviation
          ? 'Chuyển case thành 3 dòng hồ sơ cabin crew: tình huống phục vụ + quy trình xử lý + feedback/điểm cải thiện + chứng chỉ hoặc checklist liên quan.'
          : 'Chuyển case study thành 3 bullet CV theo công thức: làm gì + bằng công cụ/kỹ năng gì + kết quả bằng số.',
        isPerformer
          ? 'Đăng 1 clip ngắn hoặc hậu trường nghề MC chia sẻ bài học xử lý sân khấu, không cần khoe phí dẫn.'
          : isChef
          ? 'Lưu ảnh món, recipe card và số liệu ca bếp thành 1 hồ sơ nghề có thể gửi nhà hàng/khách sạn/chuỗi.'
          : isAviation
          ? 'Lưu checklist, feedback và bản ghi announcement thành 1 hồ sơ cabin crew có thể dùng khi review nội bộ hoặc ứng tuyển tuyến/role tốt hơn.'
          : 'Đăng 1 post LinkedIn/Zalo nghề nghiệp chia sẻ bài học hoặc before/after, không cần khoe lương.',
        'Lưu link post/CV vào evidence log.',
      ],
    },
    {
      focus: 'Tạo danh sách cơ hội trả cao hơn',
      milestone: 'Có 20 cơ hội/đầu mối và 5 tin nhắn/email tiếp cận đầu tiên.',
      tasks: [
        `Lọc 20 ${roleLanguage.opportunityList} có khả năng trả gần mức ${targetLabel}.`,
        'Chia danh sách thành 3 nhóm: dễ vào, vừa sức, stretch role.',
        isPerformer
          ? 'Viết 1 tin nhắn mở đầu 5 dòng kèm showreel, rate card và 1 case sự kiện liên quan.'
          : isChef
          ? 'Viết 1 tin nhắn mở đầu 5 dòng kèm hồ sơ bếp: 3 món chủ lực, cost/waste, ảnh plating và feedback/quản lý xác nhận.'
          : isAviation
          ? 'Viết 1 tin nhắn/hồ sơ mở đầu 5 dòng kèm checklist safety-service, feedback senior crew, chứng chỉ training và 1 case service recovery đã che thông tin khách.'
          : 'Viết 1 tin nhắn mở đầu 5 dòng kèm case study 1 trang.',
        'Gửi thử cho 5 đầu mối đầu tiên và ghi phản hồi vào tracker.',
      ],
    },
    {
      focus: 'Tập trả lời phỏng vấn/deal lương',
      milestone: 'Có script trả lời lương và 5 câu trả lời cho phản biện khó.',
      tasks: [
        `Soạn câu trả lời khi bị hỏi mức lương mong muốn, dùng mốc ${targetLabel} và bằng chứng đã tạo.`,
        isPerformer
          ? 'Viết 5 phản biện thường gặp: ngân sách thấp, chỉ cần MC đơn giản, show ngắn, chưa có clip nhiều, so với MC khác.'
          : isChef
          ? 'Viết 5 phản biện thường gặp: chưa đủ kinh nghiệm, cost món cao, ca đông dễ lỗi, chưa dẫn ca, so với bếp khác.'
          : isAviation
          ? 'Viết 5 phản biện thường gặp: chưa đủ tuyến khó, tiếng Anh chưa đủ tự tin, chưa có feedback senior, chưa có case xử lý khách, so với cabin crew nhiều thâm niên hơn.'
          : 'Viết 5 phản biện thường gặp: ngân sách thấp, chưa đủ kinh nghiệm, cần thử việc, so với mặt bằng cũ, chờ review.',
        isPerformer ? 'Tập nói pitch báo giá thành tiếng 3 lần, mỗi lần dưới 60 giây.' : isChef ? 'Tập trình bày case food cost/waste/tốc độ ra món trong 60 giây cho bếp trưởng hoặc nhà tuyển dụng.' : isAviation ? 'Tập trình bày 1 case service recovery trong 60 giây: tình huống, cách xử lý, quy trình đã theo và feedback nhận được.' : 'Tập nói thành tiếng 3 lần, mỗi lần dưới 90 giây.',
        'Ghi âm hoặc nhờ bạn phản biện để chỉnh lại câu chữ cho tự nhiên.',
      ],
    },
    {
      focus: 'Chạy vòng apply/đàm phán đầu tiên',
      milestone: 'Có ít nhất 5 lượt tiếp cận thật và 1 cuộc trao đổi lương hoặc scope công việc.',
      tasks: [
        'Gửi CV/case study tới 5-10 cơ hội trong danh sách đã lọc.',
        'Theo dõi phản hồi trong tracker: đã gửi, đã xem, phản hồi, bước tiếp theo.',
        isAviation
          ? `Nếu đang ở hãng/đơn vị hiện tại, xin feedback 1-1 từ senior crew/purser/trainer về tiêu chí lên mức ${targetLabel} hoặc tuyến/role khó hơn.`
          : `Nếu đang ở công ty hiện tại, xin 1 buổi 1-1 để hỏi tiêu chí lên mức ${targetLabel}.`,
        'Cập nhật evidence log với tất cả phản hồi thật, kể cả bị từ chối.',
      ],
    },
    {
      focus: 'Đóng gói đề xuất tăng lương',
      milestone: 'Có 1 gói đề xuất gồm số liệu, case study, mức lương đề xuất và phương án thay thế.',
      tasks: [
        isPerformer
          ? `Viết 1 trang báo giá: format sự kiện, scope chuẩn bị, rehearsal, thời lượng dẫn, mức đề xuất ${targetLabel} và điều kiện phát sinh.`
          : isChef
          ? `Viết 1 trang đề xuất tăng lương/apply: món phụ trách, food cost, waste rate, tốc độ ra món, SOP đã chuẩn hóa và mức đề xuất ${targetLabel}.`
          : isAviation
          ? `Viết 1 trang hồ sơ review/apply: chuẩn safety-service, feedback senior crew, announcement tiếng Anh, case xử lý khách và mức mục tiêu ${targetLabel}.`
          : `Viết 1 trang đề xuất: hiện trạng, impact đã tạo, benchmark thị trường, mức đề xuất ${targetLabel}.`,
        isPerformer
          ? 'Thêm phương án B: phí rehearsal riêng, gói script polish, phí di chuyển, livestream package hoặc combo nhiều show.'
          : isChef
          ? 'Thêm phương án B: nhận ca khó hơn, training phụ bếp, phụ trách cost món, phụ cấp ca hoặc apply bếp chuỗi/khách sạn.'
          : isAviation
          ? 'Thêm phương án B: xin tuyến/ca khó hơn, nhận mentor junior, học/thi chứng chỉ liên quan hoặc apply hãng/đơn vị dịch vụ hàng không trả tốt hơn.'
          : 'Thêm phương án B: tăng scope, bonus KPI, phụ cấp, lộ trình review 60 ngày hoặc chuyển role.',
        'Chọn 3 bằng chứng mạnh nhất, bỏ các bằng chứng yếu hoặc quá dài.',
        'Gửi cho 1 người tin cậy đọc thử và hỏi: phần nào khiến họ tin nhất?',
      ],
    },
    {
      focus: 'Review kết quả và chọn bước tiếp theo',
      milestone: 'Có quyết định rõ: deal nội bộ, nhảy việc, freelance/side income hoặc học tiếp 1 skill.',
      tasks: [
        'Tổng kết 12 tuần: task đã hoàn thành, KPI đạt được, phản hồi nhận được, cơ hội mở ra.',
        `So sánh offer/cơ hội hiện có với gap ${gapLabel}; chọn hướng có xác suất cao nhất.`,
        'Lên lịch buổi deal lương hoặc vòng apply tiếp theo trong 7 ngày tới.',
        'Viết 1 kế hoạch 30 ngày kế tiếp dựa trên kết quả thật, không dùng checklist chung nữa.',
      ],
    },
  ];

  return {
    format: 'weekly',
    goal: `Tăng lương từ ${(currentSalary / 1e6).toFixed(1)}M lên ${(targetSalary / 1e6).toFixed(1)}M trong ${durationMonths} tháng`,
    summary: `Lộ trình này đi theo chuỗi: chọn hướng trả cao hơn, học đúng kỹ năng, tạo bằng chứng thật, đo KPI, đóng gói CV/LinkedIn và dùng dữ liệu để deal lương.${intake.currentPosition ? ` Vị trí hiện tại: ${intake.currentPosition}.` : ''}${intake.mainWeakness ? ` Điểm cần xử lý trước: ${intake.mainWeakness}.` : ''}${segmentNote}`,
    weeks: Array.from({ length: totalWeeks }, (_, index) => {
      const blueprint = blueprints[index % blueprints.length];
      const cycle = Math.floor(index / blueprints.length);
      return {
        week: index + 1,
        focus: cycle > 0 ? `${blueprint.focus} - vòng nâng level ${cycle + 1}` : blueprint.focus,
        milestone: blueprint.milestone,
        tasks: blueprint.tasks,
      };
    }),
    negotiation_timing: `Tuần ${Math.max(4, Math.round(totalWeeks * 0.75))} là thời điểm tốt nhất để đàm phán: khi bạn đã có case study, KPI trước/sau và gói đề xuất lương rõ ràng.`,
    salary_projection: `Nếu hoàn thành 70-80% task, bạn có case đàm phán hợp lý cho mức ${targetLabel}; không cam kết tăng lương, nhưng đây là mức có cơ sở để yêu cầu.`,
    intake,
  };
}

function classifyEducationFit(jobTitle: string, intake: RoadmapIntake): string {
  const role = normalizeForRoadmapQuality(`${jobTitle} ${intake.currentPosition || ''}`);
  const education = normalizeForRoadmapQuality(`${intake.educationLevel || ''} ${intake.educationDetail || ''}`);
  const hasHigherCredential = /thac si|mba|tien si/.test(education);
  const hasEnglishCredential = /ngon ngu anh|english|tesol|celta|ielts/.test(education);
  const isLanguageCenter = /trung tam ngoai ngu|language center|english center|quan ly trung tam|academic/.test(role);

  if (isLanguageCenter && (hasHigherCredential || hasEnglishCredential)) {
    return 'Over-credentialed nhưng chưa monetized được bằng cấp';
  }
  if (/cu nhan|cao dang|trung cap/.test(education) && /(marketing|sale|kinh doanh|ke toan|finance|nhan su|hr|developer|engineer|teacher|giao vien)/.test(role)) {
    return 'Credential-fit';
  }
  if (!intake.educationLevel || /12\/12/.test(education)) {
    return 'Under-credentialed nhưng có thực chiến';
  }
  return 'Misaligned credential';
}

function pickSkill(task: string, fallback: string): string {
  const normalized = normalizeForRoadmapQuality(task);
  if (/cabin|hang khong|senior crew|purser|announcement|passenger|hanh khach|service recovery|safety|grooming|briefing|debrief/.test(normalized)) {
    return 'Safety-service và feedback cabin crew';
  }
  if (/kpi|dashboard|so lieu|chi so/.test(normalized)) return 'Đo KPI và đọc số liệu';
  if (/cv|linkedin|headline|bullet/.test(normalized)) return 'Đóng gói hồ sơ nghề nghiệp';
  if (/feedback|review|quote/.test(normalized)) return 'Lấy feedback và cải tiến';
  if (/case study|evidence|bang chung|artifact|portfolio/.test(normalized)) return 'Viết case study/portfolio';
  if (/deal|dam phan|luong|de xuat/.test(normalized)) return 'Viết proposal và trình bày kết quả';
  if (/tin nhan|email|co hoi|apply|cong ty/.test(normalized)) return 'Lọc JD và gửi hồ sơ ứng tuyển';
  return fallback;
}

function buildTaskFromText(task: string, week: WeekPlan, jobTitle: string, compass: ReturnType<typeof getCareerCompassContext>): RoadmapActionTask {
  const isAviation = isAviationRole(jobTitle);
  const skill = isAviation ? 'Safety-service và feedback cabin crew' : pickSkill(task, compass.topSkillGap);
  return {
    title: task,
    skill,
    output: isAviation
      ? '1 feedback/checklist/ghi chú tình huống đã che thông tin khách hoặc chứng chỉ training lưu trong evidence log'
      : /evidence|bằng chứng|artifact|case|portfolio|dashboard|CV|LinkedIn/i.test(task)
      ? '1 file/link/ảnh chụp lưu trong evidence log'
      : `1 output gắn trực tiếp với ${jobTitle}`,
    kpi: isAviation
      ? 'Có feedback, checklist đạt/chưa đạt, số lần luyện announcement hoặc tình huống xử lý được xác nhận'
      : /kpi|chỉ số|số liệu|lương|doanh thu|lỗi|thời gian/i.test(task)
      ? 'Có số trước/sau hoặc mốc hoàn thành đo được'
      : 'Có người xác nhận hoặc có tiêu chí đạt/chưa đạt',
    doneDefinition: `Tick khi đã có output và nó phục vụ checkpoint: ${week.milestone}`,
  };
}

function buildActionPlan(
  weekly: RoadmapData,
  jobTitle: string,
  durationMonths: number,
  compass: ReturnType<typeof getCareerCompassContext>,
  intake: RoadmapIntake = {}
): RoadmapActionPlan {
  const expectedWeeks = Math.min(Math.max(durationMonths * 4, 4), 48);
  const sourceWeeks = weekly.weeks.length >= expectedWeeks ? weekly.weeks : Array.from({ length: expectedWeeks }, (_, index) => {
    const base = weekly.weeks[index % Math.max(weekly.weeks.length, 1)] || {
      week: index + 1,
      focus: `Hoàn thành sản phẩm nghề nghiệp tuần ${index + 1}`,
      tasks: [`Hoàn thành 1 output đo được cho ${jobTitle}.`],
      milestone: 'Có 1 sản phẩm/case study đủ đưa vào portfolio hoặc buổi review.',
    };
    return { ...base, week: index + 1 };
  });
  const planWeeks = sourceWeeks.slice(0, expectedWeeks);
  const weeksPerMilestone = 4;
  const milestones: RoadmapMilestone[] = [];
  const isAviationPlan = isAviationRole(jobTitle);

  for (let i = 0; i < planWeeks.length; i += weeksPerMilestone) {
    const chunk = planWeeks.slice(i, i + weeksPerMilestone);
    const month = Math.floor(i / weeksPerMilestone) + 1;
    const skills = Array.from(new Set(chunk.flatMap(week =>
      week.tasks.map(task => isAviationPlan ? 'Safety-service và feedback cabin crew' : pickSkill(task, compass.topSkillGap))
    ))).slice(0, 4);

    milestones.push({
      month,
      title: month === 1
        ? 'Nền móng bằng chứng'
        : month === 2
          ? 'Nâng skill tạo chênh lệch'
          : month === 3
            ? 'Đóng gói case tăng lương'
            : `Tăng level tháng ${month}`,
      objective: chunk[chunk.length - 1]?.milestone || 'Có bằng chứng đủ mạnh để tăng xác suất đàm phán.',
      skills,
      weeks: chunk.map(week => ({
        week: week.week,
        focus: week.focus,
        checkpoint: week.milestone,
        tasks: week.tasks.slice(0, 4).map(task => buildTaskFromText(task, week, jobTitle, compass)),
      })),
    });
  }

  const standardWeeks = planWeeks.length;
  return {
    standardWeeks,
    flexibleWeeks: Math.ceil(standardWeeks * 1.5),
    weeklyHours: intake.weeklyTime || '3-5 giờ/tuần',
    completionRule: 'Hoàn thành tối thiểu 80% task, mỗi tháng có ít nhất 1 output đo được và 1 bằng chứng được người khác xác nhận.',
    levelName: 'Evidence Level',
    milestones,
  };
}

function buildExpertFallbackRoadmap(
  weekly: RoadmapData,
  jobTitle: string,
  currentSalary: number,
  targetSalary: number,
  durationMonths: number,
  compass: ReturnType<typeof getCareerCompassContext>,
  intake: RoadmapIntake = {}
): RoadmapData {
  const durationLabel = formatRoadmapDuration(durationMonths);
  const negotiationWindow =
    durationMonths <= 3 ? 'tháng 2-3' :
    durationMonths <= 6 ? 'tháng 4-6' :
    'tháng 6-12';
  const role = intake.currentPosition || jobTitle;
  const needsDiagnosis = !intake.mainWeakness || !intake.bottleneck;
  const inferredGap = compass.topSkillGap;
  const weakness = intake.mainWeakness || (needsDiagnosis ? `chưa rõ - cần chẩn đoán từ dữ liệu đầu vào, ưu tiên kiểm tra ${inferredGap}` : inferredGap);
  const goal = intake.twoYearGoal || `${targetSalary.toLocaleString('vi-VN')} VNĐ/tháng hoặc lên role tốt hơn`;
  const educationLevel = intake.educationLevel || 'Chưa cung cấp';
  const educationDetail = intake.educationDetail || 'Chưa cung cấp';
  const classification = classifyEducationFit(jobTitle, intake);
  const actionPlan = buildActionPlan(weekly, jobTitle, durationMonths, compass, intake);
  const knownStrengths = intake.strongSkills || 'Chưa cung cấp';
  const existingProof = intake.proofAssets || 'Chưa cung cấp';
  const bottleneck = intake.bottleneck || (needsDiagnosis ? 'chưa xác định - tuần đầu phải đo nền KPI, bằng chứng, scope, visibility, skill gap và kịch bản deal' : weakness);
  const preferredPath = intake.preferredPath || 'chưa chọn';
  const normalizedRole = normalizeForRoadmapQuality(`${jobTitle} ${role}`);
  const normalizedEducation = normalizeForRoadmapQuality(`${educationLevel} ${educationDetail}`);
  const isLanguageCenter = /trung tam ngoai ngu|language center|english center|quan ly trung tam|academic/.test(normalizedRole);
  const isPerformer = isMcRole(normalizedRole);
  const isChef = isChefRole(normalizedRole);
  const isAviation = isAviationRole(normalizedRole);
  const hasAcademicAdvantage = /thac si|mba|ngon ngu anh|english/.test(normalizedEducation);
  const focusProtocol = needsDiagnosis && isAviation
    ? [
        '- Tuần 1 không bắt user đoán điểm yếu. Chẩn đoán bằng 5 nhóm: safety-service checklist, feedback senior crew, announcement tiếng Anh, service recovery, grooming/teamwork.',
        '- Mỗi nhóm có 1 việc nhỏ: tự chấm checklist, xin 1 feedback, ghi âm 1 announcement, viết 1 tình huống khách khó và ghi 1 điểm cần sửa sau ca/chuyến.',
        '- Không dùng dữ liệu doanh thu nội bộ, không ghi thông tin riêng tư hành khách. Chỉ dùng bằng chứng cá nhân hợp lệ: checklist, feedback, chứng chỉ training, ghi chú tình huống đã che thông tin.',
        '- Sau 7 ngày, chọn nút thắt thật: thiếu feedback, thiếu tiếng Anh tình huống, thiếu service recovery, thiếu chuẩn grooming/teamwork hoặc thiếu bằng chứng để xin tuyến/role khó hơn.',
      ].join('\n')
    : needsDiagnosis
    ? [
        '- Tuần 1 không vội kết luận điểm yếu. Bắt đầu bằng chẩn đoán 5 nhóm: KPI đo được, bằng chứng đã có, scope/quyền quyết định, visibility với người trả lương và skill gap thị trường.',
        '- Mỗi nhóm phải có 1 câu hỏi kiểm tra, 1 hành động nhỏ, 1 output hữu hình và 1 số đo trước/sau.',
        '- Nếu phát hiện thiếu KPI: dựng dashboard nền. Nếu thiếu bằng chứng: tạo case study. Nếu thiếu scope: xin nhận một đầu việc có owner rõ. Nếu thiếu visibility: đóng gói báo cáo gửi người ra quyết định. Nếu thiếu skill: học đúng skill tạo KPI trong công việc.',
        '- Sau 7 ngày, chọn nút thắt thật dựa trên dữ liệu, không dựa trên cảm giác.',
      ].join('\n')
    : isAviation && normalizeForRoadmapQuality(weakness).includes('khong tap trung chi tiet')
    ? [
        '- Checklist trước ca/chuyến: grooming, briefing, safety-service flow, 1 tình huống khách khó có thể gặp và câu nói nên dùng.',
        '- 2 block luyện ngắn: 15 phút announcement tiếng Anh và 15 phút viết lại một tình huống service recovery theo format: tình huống - phản hồi - quy trình - feedback.',
        '- Sổ lỗi cabin cá nhân: ghi lỗi/điểm cần sửa, tình huống, cách phòng lại, không ghi thông tin riêng tư hành khách.',
        '- Review cuối ca/chuyến: xin 1 feedback ngắn từ senior crew/đồng nghiệp hoặc tự chấm checklist đạt/chưa đạt.',
        '- 5 tiêu chí theo dõi: checklist hoàn thành, feedback nhận được, số lần luyện announcement, tình huống service recovery đã ghi, điểm grooming/teamwork cần cải thiện.',
        '- Quy tắc vận hành: chưa lưu được một bằng chứng nhỏ thì chưa mở thêm mục tiêu mới.',
      ].join('\n')
    : normalizeForRoadmapQuality(weakness).includes('khong tap trung chi tiet')
    ? [
        '- Checklist đầu ngày: viết 3 output bắt buộc, 5 lỗi cần né, 1 task phải đóng trước 11h.',
        '- 2 block tập trung: mỗi block 45-60 phút, chỉ xử lý 1 sản phẩm/bằng chứng nghề, tắt thông báo và ghi kết quả cuối block.',
        '- Sổ lỗi chi tiết: ghi lỗi, nguyên nhân, chi phí, cách chặn lỗi tái diễn.',
        '- Review cuối ngày: đối chiếu output với checklist, chốt 1 cải tiến cho ngày mai.',
        '- Dashboard 5 chỉ số: task đóng, lỗi lặp lại, SLA trễ, thời gian deep work, output được quản lý/khách hàng xác nhận.',
        '- Quy tắc vận hành: không mở task mới khi task cũ chưa có output hữu hình.',
      ].join('\n')
    : `- Biến điểm nghẽn "${bottleneck}" thành checklist hằng ngày: việc làm cụ thể, output hữu hình, KPI đo và tiêu chuẩn hoàn thành. Không mặc định bạn thiếu kỹ năng đã khai báo; dùng điểm mạnh hiện có để tạo bằng chứng cao hơn.`;
  const languageCenterNote = isLanguageCenter && hasAcademicAdvantage
    ? `\n\nVới quản lý trung tâm ngoại ngữ, bằng cấp của bạn là lợi thế học thuật. Nhưng nếu chỉ làm vận hành thường ngày, bằng đang bị under-monetized. Muốn tăng lương, hãy biến bằng cấp thành quyền phụ trách đào tạo giáo viên, chuẩn hóa curriculum, tăng retention, giảm complaint, cải thiện trial-to-paid và mở lớp/chương trình mới. KPI ngành phải theo dõi: học viên active, retention/churn, trial-to-paid, lead-to-enrollment, class fill rate, teacher utilization, parent complaint SLA, renewal rate, revenue per class, dropout/refund reasons.`
    : '';
  const performerNote = isPerformer
    ? `\n\nVới MC/người dẫn chương trình, lộ trình này không được học lan man kỹ thuật. Mục tiêu là tăng phí dẫn bằng 5 nhóm bằng chứng: showreel 60-90 giây, kịch bản mẫu, xử lý tình huống live, feedback khách/agency và rate card theo format sự kiện. KPI nghề MC gồm: số show chất lượng, tỷ lệ khách quay lại/giới thiệu, số feedback thật, độ đúng timeline, mức phí trung bình/show, số lead booking và tỷ lệ chốt show.`
    : '';
  const chefNote = isChef
    ? `\n\nVới đầu bếp/F&B, lộ trình này không được học lan man kỹ thuật văn phòng. Mục tiêu là tăng lương bằng 5 nhóm bằng chứng nghề bếp: recipe card có định lượng/cost, food cost, waste rate, tốc độ ra món, chuẩn plating/SOP và khả năng training phụ bếp. KPI nghề bếp gồm: cost món, hao hụt nguyên liệu, số suất/ca, thời gian ra món, rating/complaint, số lỗi món và số người trong bếp bạn hướng dẫn được.`
    : '';
  const aviationNote = isAviation
    ? `\n\nVới tiếp viên hàng không/cabin crew, lộ trình này không được dùng kỹ năng văn phòng/IT. Mục tiêu là tăng giá trị bằng 5 nhóm bằng chứng đúng nghề: checklist safety-service, service recovery, announcement tiếng Anh, grooming/teamwork, feedback senior crew/đồng nghiệp và chứng chỉ training. Không yêu cầu dữ liệu doanh thu nội bộ hoặc thông tin riêng tư hành khách. KPI nghề cabin crew nên là: checklist hoàn thành, feedback senior crew, tình huống khách khó xử lý êm, announcement luyện có ghi âm, đúng quy trình safety và mức sẵn sàng cho tuyến/role khó hơn.`
    : '';
  const monthSections = actionPlan.milestones.map(milestone => {
    const firstWeek = milestone.weeks[0];
    const firstTask = firstWeek?.tasks[0];
    return `### Tháng ${milestone.month}: ${milestone.title}
- Mục tiêu: ${milestone.objective}
- Skill cần nâng: ${milestone.skills.join(', ')}
- Việc làm cụ thể tuần đầu: ${firstTask?.title || 'Tạo bằng chứng có số liệu cho công việc quan trọng nhất.'}
- Output hữu hình: ${firstTask?.output || '1 artifact lưu được trong evidence log, có ảnh/link/file và người xác nhận.'}
- KPI đo: ${firstTask?.kpi || 'trước/sau về thời gian xử lý, lỗi giảm, doanh thu, retention, SLA hoặc chất lượng bàn giao.'}
- Tiêu chuẩn hoàn thành: ${firstTask?.doneDefinition || 'quản lý/khách hàng/đồng nghiệp có thể nhìn vào artifact và hiểu bạn tạo ra giá trị gì.'}`;
  }).join('\n\n');
  const educationAction30Days = isAviation
    ? '- Trong 30 ngày: tạo checklist safety-service cá nhân, luyện 1 announcement tiếng Anh, xin 1 feedback từ senior crew/đồng nghiệp và ghi 1 tình huống service recovery đã che thông tin khách.'
    : '- Trong 30 ngày: chọn 1 năng lực học thuật áp vào việc thật; tạo 1 quy trình/dashboard/case study; xin 1 xác nhận từ quản lý hoặc khách hàng nội bộ.';

  const markdown = `# Lộ trình thực thi tăng lương theo tháng

## Chẩn đoán nhanh
Bạn đang ở vai trò "${role}", lương hiện tại ${(currentSalary / 1_000_000).toFixed(1)}M/tháng và mục tiêu là "${goal}". Khoảng tăng cần chứng minh là ${(targetSalary - currentSalary).toLocaleString('vi-VN')} VNĐ/tháng, nên roadmap phải ưu tiên ${isAviation ? 'bằng chứng nghề đã được senior crew/đồng nghiệp xác nhận' : 'bằng chứng kinh doanh'} thay vì danh sách việc làm chung chung.

Cam kết thực hiện: nhịp chuẩn ${actionPlan.standardWeeks} tuần, nhịp bận ${actionPlan.flexibleWeeks} tuần, mỗi tuần ${actionPlan.weeklyHours}. Điều kiện được xem là hoàn thành: ${actionPlan.completionRule}

## Khảo sát đầu vào
- Kỹ năng/đòn bẩy đã mạnh: ${knownStrengths}.
- Bằng chứng/thành tích đã có: ${existingProof}.
- Nút thắt cần xử lý trước: ${bottleneck}.
- Hướng ưu tiên: ${preferredPath}.

## Độ khớp học vấn với lương
- Phân loại: ${classification}.
- Học vấn: ${educationLevel}.
- Liên quan: ${educationDetail}.
- Bằng cấp đang giúp bạn có tín hiệu nền tảng, nhưng thị trường chỉ trả thêm khi tín hiệu đó biến thành KPI, scope lớn hơn hoặc quyền ra quyết định rõ hơn.
${educationAction30Days}${languageCenterNote}

## Giao thức xử lý điểm yếu lớn nhất
${focusProtocol}${performerNote}${chefNote}${aviationNote}

## Chiến lược ${durationLabel}
${monthSections}

## Bản đồ bằng chứng tăng lương
- Evidence log: việc đã làm, output, KPI trước/sau, ảnh/link/file, người xác nhận.
- Case study 1 trang: vấn đề, hành động, kết quả, bằng chứng, bài học có thể lặp lại.
- ${isAviation ? 'Hồ sơ cabin crew: checklist safety-service, feedback senior crew, ghi âm announcement, chứng chỉ training và tình huống service recovery đã che thông tin khách.' : 'Dashboard lương: 5 chỉ số sát vai trò hiện tại và role mục tiêu.'}

## Kịch bản deal lương 90 giây
"Trong ${durationMonths} tháng qua, em tập trung xử lý ${weakness}. Kết quả là em có các bằng chứng sau: ${isPerformer ? 'showreel, feedback khách/agency, rate card và case xử lý sân khấu' : isChef ? 'recipe card có cost, waste log, tốc độ ra món, checklist SOP bếp và feedback xác nhận' : isAviation ? 'checklist safety-service, feedback senior crew, announcement tiếng Anh và case service recovery đã che thông tin khách' : 'case study, KPI và output đã được xác nhận'}. Với mức đóng góp này và mặt bằng role mục tiêu, em muốn trao đổi về mức ${(targetSalary / 1_000_000).toFixed(1)}M/tháng hoặc một scope mới có KPI rõ để đạt mức đó."

## Cảnh báo điểm nghẽn
- Không xin tăng lương bằng nỗ lực; chỉ dùng output và KPI.
- Không đợi hoàn hảo; mỗi tuần phải có 1 bằng chứng nhỏ.
- Không học lan man; kỹ năng nào không tạo KPI trong công việc thì để sau.

## Việc cần làm trong 7 ngày tới
1. ${isAviation ? `Chọn 3 tiêu chí cabin crew dễ theo dõi cho "${role}": feedback senior crew, announcement tiếng Anh, checklist safety-service hoặc tình huống service recovery.` : `Chốt 5 KPI sát role "${role}".`}
2. Tạo evidence log và nhập số liệu nền.
3. Đóng gói 1 output nhỏ có thể gửi quản lý xem.
4. Xin feedback cụ thể và ghi lại thành bằng chứng.
5. Lên lịch review cuối tuần để chọn hành động tiếp theo.`;

  return {
    format: 'expert_v2',
    version: 2,
    goal: `Lộ trình thực thi tăng lương cho ${role}`,
    summary: `Bản phân tích chuyên gia theo ngành ${jobTitle}, lương hiện tại ${(currentSalary / 1_000_000).toFixed(1)}M/tháng, điểm yếu "${weakness}", học vấn "${educationLevel}" và mục tiêu "${goal}".`,
    weeks: [],
    negotiation_timing: `Mốc ${negotiationWindow} là thời điểm đàm phán mạnh nhất nếu đã có đủ KPI, case study và bằng chứng thị trường.`,
    salary_projection: `Nếu hoàn thành 70-80% hành động trong roadmap, bạn có cơ sở đàm phán quanh mức ${(targetSalary / 1_000_000).toFixed(1)} triệu/tháng hoặc role tương đương. Không phải cam kết tăng lương.`,
    markdown,
    intake,
    actionPlan,
  };
}

async function generateRoadmap(
  jobTitle: string,
  currentSalary: number,
  targetSalary: number,
  durationMonths: number,
  intake: RoadmapIntake = {}
): Promise<RoadmapData> {
  const weeks = durationMonths * 4;
  const durationLabel = formatRoadmapDuration(durationMonths);
  const milestoneLabels = getRoadmapMilestoneLabels(durationMonths);
  const negotiationWindow =
    durationMonths <= 3 ? 'tháng 2-3' :
    durationMonths <= 6 ? 'tháng 4-6' :
    'tháng 6-12';
  const salaryGap = targetSalary - currentSalary;
  const compass = getCareerCompassContext(jobTitle, currentSalary, 50);
  const segment = detectRoadmapSegment(jobTitle);
  const isAviation = isAviationRole(`${jobTitle} ${intake.currentPosition || ''}`);
  const needsDiagnosis = !intake.mainWeakness || !intake.bottleneck;
  const weaknessForPrompt = intake.mainWeakness || 'Chưa rõ - chuyên gia phải tự chẩn đoán từ vị trí, lương, kỹ năng mạnh, bằng chứng hiện có và benchmark thị trường';
  const bottleneckForPrompt = intake.bottleneck || 'Chưa rõ - chuyên gia phải xác định giả thuyết nút thắt, thiết kế tuần 1 để đo nền và xác nhận/loại trừ';

  const FALLBACK_WEEKLY = buildFallbackRoadmap(jobTitle, currentSalary, targetSalary, durationMonths, compass, segment, intake);
  const FALLBACK = buildExpertFallbackRoadmap(
    FALLBACK_WEEKLY,
    jobTitle,
    currentSalary,
    targetSalary,
    durationMonths,
    compass,
    intake
  );

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return FALLBACK;

  const systemPrompt = `Bạn là Senior Headhunter & Career Strategist tại Việt Nam, từng tư vấn tuyển dụng cấp quản lý và đàm phán lương cho ứng viên.

Nhiệm vụ: tạo một "Lộ trình thực thi tăng lương theo tháng" thực tế, thẳng thắn, có thể hành động ngay.

Quy tắc bắt buộc:
- Trả lời bằng Markdown thuần, không bọc trong code fence.
- Viết tiếng Việt tự nhiên, sắc, có cảm giác được cá nhân hóa cho đúng người.
- Phải có các mốc phù hợp thời hạn ${durationLabel}: ${milestoneLabels.join(', ')}.
- Mỗi mốc phải có: mục tiêu, skill cụ thể cần nâng, hành động chính theo tuần, bằng chứng cần tạo, KPI đo được, checklist hoàn thành và lỗi cần tránh.
- Phải ghi rõ cam kết thực hiện: nhịp chuẩn bao nhiêu tuần, nhịp bận bao nhiêu tuần, mỗi tuần cần bao nhiêu giờ.
- Có phần "Bản đồ bằng chứng tăng lương", "Kịch bản deal lương 90 giây", và "Cảnh báo điểm nghẽn".
- Không hứa chắc tăng lương. Luôn dùng ngôn ngữ có điều kiện: nếu hoàn thành, có cơ sở, tăng xác suất.
- Không đưa lời khuyên chung chung kiểu "học thêm kỹ năng" nếu không nêu kỹ năng, output và tiêu chí đo.`;

  const userPrompt = `Dữ liệu ứng viên:
- Ngành nghề/chức danh hệ thống: ${jobTitle}
- Vị trí hiện tại do user nhập: ${intake.currentPosition || jobTitle}
- Lương hiện tại: ${currentSalary.toLocaleString('vi-VN')} VNĐ/tháng
- Lương mục tiêu hệ thống đề xuất: ${targetSalary.toLocaleString('vi-VN')} VNĐ/tháng
- Mục tiêu user trong ${durationLabel} tới: ${intake.twoYearGoal || `${targetSalary.toLocaleString('vi-VN')} VNĐ/tháng hoặc lên role tốt hơn`}
- Điểm yếu chuyên môn lớn nhất: ${weaknessForPrompt}
- Trình độ học vấn cao nhất: ${intake.educationLevel || 'Chưa cung cấp'}
- Ngành học/chứng chỉ liên quan: ${intake.educationDetail || 'Chưa cung cấp'}
- Kỹ năng/đòn bẩy user nói đã khá mạnh: ${intake.strongSkills || 'Chưa cung cấp'}
- Bằng chứng/thành tích user đã có: ${intake.proofAssets || 'Chưa cung cấp'}
- Nút thắt lớn nhất đang cản tăng lương: ${bottleneckForPrompt}
- Trạng thái chẩn đoán: ${needsDiagnosis ? 'User chưa chắc điểm yếu/nút thắt. Không được đoán bừa; phải tự chẩn đoán bằng dữ liệu, tạo tuần đo nền và xử lý toàn bộ nhóm điểm yếu có khả năng cản tăng lương.' : 'User đã khai báo điểm yếu/nút thắt, nhưng vẫn phải kiểm tra lại bằng dữ liệu và bằng chứng.'}
- Hướng ưu tiên user chọn: ${intake.preferredPath || 'Chưa chọn'}
- Thời gian có thể thực thi mỗi tuần: ${intake.weeklyTime || '3-5 giờ/tuần'}
- Thời gian roadmap gốc: ${durationMonths} tháng (${weeks} tuần)
- Khoảng tăng cần có: ${salaryGap.toLocaleString('vi-VN')} VNĐ/tháng
- Nhóm nghề: ${compass.jobGroup}
- Band hiện tại: ${compass.bandLabel} (${compass.currentBandRange}/tháng)
- Skill gap thị trường: ${compass.topSkillGap}
- Milestone để lên band: ${compass.nextMilestone}
- Insight thị trường: ${compass.marketInsight}
${segment ? `- Segment đặc biệt: ${segment.label}
- Ưu tiên roadmap: ${segment.priority}
- Loại bằng chứng phải thu thập: ${segment.proof}` : ''}

Cấu trúc Markdown mong muốn:
# Lộ trình thực thi tăng lương theo tháng
## Chẩn đoán nhanh
## Độ khớp học vấn với lương
## Giao thức xử lý điểm yếu lớn nhất
## Chiến lược ${durationLabel}
${milestoneLabels.map(label => `### ${label}`).join('\n')}
## Bản đồ bằng chứng tăng lương
## Kịch bản deal lương 90 giây
## Cảnh báo điểm nghẽn
## Việc cần làm trong 7 ngày tới

Quy tắc cá nhân hóa bắt buộc:
- Không được dùng các chữ: AI, DeepSeek, ChatGPT, Claude trong nội dung trả về.
- Nếu user đã khai báo kỹ năng/đòn bẩy mạnh, không được viết như thể họ chưa biết kỹ năng đó. Hãy dùng chúng làm lợi thế và nâng lên bằng chứng/KPI/scope cao hơn.
- Nếu dữ liệu thiếu hoặc user không chắc, không được lặp nguyên chữ "không biết"; hãy viết "chưa đủ dữ liệu" và thiết kế bước khảo sát/đo nền trong tuần đầu.
- Nếu user chưa rõ điểm yếu hoặc nút thắt, phần "Chẩn đoán nhanh" phải nêu 3-5 giả thuyết nút thắt có khả năng nhất và tuần 1 phải có checklist xác minh từng giả thuyết. Roadmap phải bao phủ đủ các nhóm yếu điểm thường gặp: thiếu KPI, thiếu bằng chứng, thiếu scope/quyền quyết định, thiếu visibility với người trả lương, thiếu skill tạo chênh lệch, và thiếu kịch bản deal/apply.
- Phần "Độ khớp học vấn với lương" phải phân loại vào 1 nhóm: Under-credentialed nhưng có thực chiến, Credential-fit, Over-credentialed nhưng chưa monetized được bằng cấp, hoặc Misaligned credential.
- Phần học vấn phải nói rõ bằng cấp đang giúp gì, đang bị thị trường bỏ phí ở đâu, và 3 hành động trong 30 ngày để biến học vấn/kinh nghiệm thành bằng chứng lương.
- Với case quản lý trung tâm ngoại ngữ, nếu học vấn là Thạc sĩ/MBA hoặc Ngôn ngữ Anh, phải nói rõ: có lợi thế học thuật; nếu chỉ làm vận hành thường ngày thì bằng đang bị under-monetized; muốn tăng lương phải biến bằng cấp thành quyền phụ trách đào tạo giáo viên, chuẩn hóa curriculum, tăng retention, giảm complaint, cải thiện trial-to-paid và mở lớp/chương trình mới.
${isAviation ? '- Nếu điểm yếu là "không tập trung chi tiết" hoặc tương tự với tiếp viên/cabin crew, phải tạo giao thức theo ca/chuyến: checklist safety-service, luyện announcement, sổ lỗi cabin cá nhân, feedback senior crew/đồng nghiệp và tuyệt đối không dùng dashboard văn phòng.' : '- Nếu điểm yếu là "không tập trung chi tiết" hoặc tương tự, phải tạo giao thức hằng ngày gồm checklist đầu ngày, 2 block tập trung, sổ lỗi chi tiết, review cuối ngày, dashboard 5 chỉ số và quy tắc không mở task mới khi task cũ chưa có output.'}
- Với quản lý trung tâm ngoại ngữ, phải dùng KPI ngành: học viên active, retention/churn, trial-to-paid, lead-to-enrollment, class fill rate, teacher utilization, parent complaint SLA, renewal rate, revenue per class, dropout/refund reasons.
- Với MC/người dẫn chương trình/host sự kiện, tuyệt đối không được đưa kỹ năng kỹ thuật văn phòng như GitHub, TypeScript, JavaScript, API, system design, SQL, debugging. Phải dùng kỹ năng đúng nghề: showreel, giọng nói, nhịp sân khấu, tương tác khán giả, xử lý sự cố live, kịch bản lời dẫn, rehearsal, briefing khách hàng, rate card, portfolio sự kiện, feedback khách/agency, booking lead và tỷ lệ chốt show.
- Với đầu bếp/Chef/F&B, tuyệt đối không được đưa kỹ năng kỹ thuật văn phòng như GitHub, TypeScript, JavaScript, API, system design, SQL, debugging. Không viết "đang ở công ty" nếu nghề là bếp. Phải dùng kỹ năng đúng nghề: food cost, waste rate, recipe card, định lượng nguyên liệu, tốc độ ra món, chuẩn plating, an toàn vệ sinh, HACCP nếu phù hợp, kiểm ca, training phụ bếp, feedback khách, complaint món, kitchen SOP, bếp chuỗi/khách sạn/catering/bếp trung tâm.
- Với tiếp viên hàng không/cabin crew/hàng không, tuyệt đối không được đưa kỹ năng kỹ thuật văn phòng như GitHub, TypeScript, JavaScript, API, system design, SQL, debugging. Không yêu cầu dashboard, doanh thu nội bộ, học viên, food cost hoặc showreel. Phải dùng kỹ năng đúng nghề: safety procedure, checklist cabin, service recovery, passenger communication, announcement tiếng Anh, grooming, teamwork, senior crew feedback, chứng chỉ training, route readiness, briefing/debrief và xử lý complaint. Bằng chứng không được chứa thông tin riêng tư hành khách.
- Mỗi hành động phải có việc làm cụ thể, output hữu hình, KPI đo và tiêu chuẩn hoàn thành.
- Không chỉ viết tháng chung chung. Mỗi tháng phải có tuần 1/2/3/4 hoặc checklist tuần rõ ràng để user tick tiến độ.

Hãy viết cụ thể theo ngành ${jobTitle}, vị trí "${intake.currentPosition || jobTitle}", điểm nghẽn "${intake.bottleneck || intake.mainWeakness || 'chưa rõ - cần chuyên gia chẩn đoán'}", kỹ năng mạnh "${intake.strongSkills || 'chưa cung cấp'}", bằng chứng đã có "${intake.proofAssets || 'chưa cung cấp'}", học vấn "${intake.educationLevel || 'chưa cung cấp'} - ${intake.educationDetail || 'chưa cung cấp'}" và mục tiêu "${intake.twoYearGoal || targetSalary}".`;

  try {
    const client = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const completion = await client.chat.completions.create(
      {
        model: 'deepseek-v4-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 4500,
        temperature: 0.45,
      },
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const markdown = completion.choices[0]?.message?.content?.trim() ?? '';
    if (
      markdown.length < 700 ||
      hasBlockedCustomerTerm(markdown) ||
      hasWrongDomainLeak(jobTitle, markdown) ||
      !/độ khớp học vấn với lương/i.test(markdown)
    ) return FALLBACK;

    return {
      format: 'expert_v2',
      version: 2,
      goal: `Lộ trình thực thi tăng lương cho ${intake.currentPosition || jobTitle}`,
      summary: `Bản phân tích chuyên gia theo ngành ${jobTitle}, lương hiện tại ${(currentSalary / 1_000_000).toFixed(1)}M/tháng, điểm yếu "${intake.mainWeakness || 'cần chẩn đoán trong tuần đầu'}", học vấn "${intake.educationLevel || 'chưa cung cấp'}" và mục tiêu "${intake.twoYearGoal || `${(targetSalary / 1_000_000).toFixed(1)}M/tháng`}".`,
      weeks: [],
      negotiation_timing: `Mốc ${negotiationWindow} là thời điểm đàm phán mạnh nhất nếu đã có đủ KPI, case study và bằng chứng thị trường.`,
      salary_projection: `Nếu hoàn thành 70-80% hành động trong roadmap, bạn có cơ sở đàm phán quanh mức ${(targetSalary / 1_000_000).toFixed(1)} triệu/tháng hoặc role tương đương. Không phải cam kết tăng lương.`,
      markdown,
      intake,
      actionPlan: FALLBACK.actionPlan,
    };

  } catch {
    return FALLBACK;
  }
}

// POST — generate lộ trình sau khi thanh toán
export async function POST(req: NextRequest) {
  try {
    const originError = enforceOrigin(req);
    if (originError) return originError;
    const limitError = rateLimit(req, 'roadmap-generate-post', 8);
    if (limitError) return limitError;

    const {
      vspiId,
      accessCode,
      currentPosition,
      mainWeakness,
      twoYearGoal,
      educationLevel,
      educationDetail,
      strongSkills,
      proofAssets,
      bottleneck,
      preferredPath,
      weeklyTime,
    } = await req.json();
    if (!vspiId) return NextResponse.json({ error: 'Missing vspiId' }, { status: 400 });
    if (!roadmapAccessCodeMatches(vspiId, accessCode)) {
      return NextResponse.json({ error: 'Access code required' }, { status: 401 });
    }
    const intake: RoadmapIntake = {
      currentPosition: cleanIntakeValue(currentPosition),
      mainWeakness: cleanIntakeValue(mainWeakness),
      twoYearGoal: cleanIntakeValue(twoYearGoal),
      educationLevel: cleanIntakeValue(educationLevel),
      educationDetail: cleanIntakeValue(educationDetail),
      strongSkills: cleanIntakeValue(strongSkills),
      proofAssets: cleanIntakeValue(proofAssets),
      bottleneck: cleanIntakeValue(bottleneck),
      preferredPath: cleanIntakeValue(preferredPath),
      weeklyTime: cleanIntakeValue(weeklyTime),
    };

    // Verify đã paid
    const { data: roadmap, error } = await supabaseServer
      .from('roadmaps')
      .select('*')
      .eq('vspi_id', vspiId)
      .eq('status', 'paid')
      .maybeSingle();

    if (error) throw error;
    if (!roadmap) return NextResponse.json({ error: 'Not found or not paid' }, { status: 404 });

    // Nếu đã có roadmap tốt rồi thì trả về luôn. Roadmap cũ bị lặp tuần sẽ được tạo lại.
    if (roadmap.roadmap_json && !isLowQualityRoadmap(roadmap.roadmap_json, roadmap.job_title) && intakeMatches(roadmap.roadmap_json, intake)) {
      return NextResponse.json({ roadmap: roadmap.roadmap_json, progress: roadmap.task_progress, accessCode: getRoadmapAccessCode(vspiId) });
    }

    // Generate mới
    const generated = await generateRoadmap(
      roadmap.job_title,
      roadmap.current_salary,
      roadmap.target_salary,
      roadmap.duration_months,
      intake
    );

    // Lưu vào DB
    await supabaseServer
      .from('roadmaps')
      .update({ roadmap_json: generated, task_progress: {} })
      .eq('vspi_id', vspiId);

    return NextResponse.json({ roadmap: generated, progress: {}, accessCode: getRoadmapAccessCode(vspiId) });

  } catch (err: unknown) {
    console.error('[roadmap/generate]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// GET — lấy roadmap + progress (by vspiId hoặc phone)
export async function GET(req: NextRequest) {
  const originError = enforceOrigin(req);
  if (originError) return originError;
  const limitError = rateLimit(req, 'roadmap-generate-get', 20);
  if (limitError) return limitError;

  const { searchParams } = new URL(req.url);
  const vspiId = searchParams.get('id');
  const phone  = searchParams.get('phone');
  const accessCode = searchParams.get('accessCode') || searchParams.get('code');

  // Lookup bằng SĐT + mã truy cập — trả về roadmap paid mới nhất
  if (phone && !vspiId) {
    if (!accessCode) return NextResponse.json({ error: 'Access code required' }, { status: 401 });
    const clean = phone.replace(/\D/g, '');
    const { data: rows, error } = await supabaseServer
      .from('roadmaps')
      .select('vspi_id, roadmap_json, task_progress, status, goal_label, job_title, current_salary, target_salary, duration_months, paid_at, created_at')
      .eq('phone', clean)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(10);

    const matched = rows?.find(row => roadmapAccessCodeMatches(row.vspi_id, accessCode));
    if (error || !matched) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const data = matched;
    if (data.roadmap_json && isLowQualityRoadmap(data.roadmap_json, data.job_title)) {
      const savedIntake = getSavedIntake(data.roadmap_json);
      const generated = await generateRoadmap(
        data.job_title,
        data.current_salary,
        data.target_salary,
        data.duration_months,
        savedIntake
      );
      await supabaseServer
        .from('roadmaps')
        .update({ roadmap_json: generated, task_progress: {} })
        .eq('vspi_id', data.vspi_id);
      return NextResponse.json({ ...data, roadmap_json: generated, task_progress: {}, accessCode: getRoadmapAccessCode(data.vspi_id) });
    }
    return NextResponse.json({ ...data, accessCode: getRoadmapAccessCode(data.vspi_id) });
  }

  if (!vspiId) return NextResponse.json({ error: 'Missing id or phone' }, { status: 400 });
  if (!roadmapAccessCodeMatches(vspiId, accessCode)) {
    return NextResponse.json({ error: 'Access code required' }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from('roadmaps')
    .select('vspi_id, roadmap_json, task_progress, status, goal_label, job_title, current_salary, target_salary, duration_months')
    .eq('vspi_id', vspiId)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (data.roadmap_json && isLowQualityRoadmap(data.roadmap_json, data.job_title)) {
    const savedIntake = getSavedIntake(data.roadmap_json);
    const generated = await generateRoadmap(
      data.job_title,
      data.current_salary,
      data.target_salary,
      data.duration_months,
      savedIntake
    );
    await supabaseServer
      .from('roadmaps')
      .update({ roadmap_json: generated, task_progress: {} })
      .eq('vspi_id', data.vspi_id);
    return NextResponse.json({ ...data, roadmap_json: generated, task_progress: {}, accessCode: getRoadmapAccessCode(data.vspi_id) });
  }
  return NextResponse.json({ ...data, accessCode: getRoadmapAccessCode(data.vspi_id) });
}
