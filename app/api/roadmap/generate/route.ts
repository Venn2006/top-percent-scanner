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

  return null;
}

function cleanIntakeValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, 240);
  return cleaned || undefined;
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
    sameOptionalValue(saved.educationDetail, incoming.educationDetail)
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

function isLowQualityRoadmap(value: unknown): value is RoadmapData {
  const roadmap = value as RoadmapData | null;
  if (roadmap?.format === 'expert_v2') {
    const markdown = typeof roadmap.markdown === 'string' ? roadmap.markdown : '';
    return (
      roadmap.version !== 2 ||
      !hasGoodMarkdownRoadmap(roadmap) ||
      !hasEducationFitSection(roadmap) ||
      !hasActionPlan(roadmap) ||
      hasBlockedCustomerTerm(markdown)
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
  const targetLabel = `${(targetSalary / 1_000_000).toFixed(1)} triệu/tháng`;
  const gapLabel = `${Math.max(0, targetSalary - currentSalary).toLocaleString('vi-VN')}đ/tháng`;
  const segmentNote = segment ? ` Ưu tiên riêng cho nhóm này: ${segment.priority}.` : '';
  const rolePath = isTeacher
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
        'Tạo file evidence log gồm: việc đã làm, số liệu trước/sau, ảnh/link chứng minh, người xác nhận.',
        `Chọn 1 năng lực trọng tâm tuần sau: ${compass.topSkillGap}.`,
      ],
    },
    {
      focus: `Học đúng 1 kỹ năng tạo chênh lệch lương`,
      milestone: `Có checklist kỹ năng và 1 bài/mini project chứng minh bạn đã dùng được ${compass.topSkillGap}.`,
      tasks: [
        `Học 3 tài liệu/video ngắn về ${compass.topSkillGap}; ghi lại 10 ý có thể áp dụng ngay vào công việc.`,
        'Biến 1 công việc hiện tại thành checklist có tiêu chí đạt/chưa đạt, thời gian hoàn thành và lỗi thường gặp.',
        `Làm 1 bài thực hành nhỏ liên quan trực tiếp tới ${jobTitle}, không học lan man.`,
        'Nhờ 1 người có kinh nghiệm review checklist và ghi lại 3 điểm cần sửa.',
      ],
    },
    {
      focus: 'Tạo sản phẩm mẫu có thể đưa vào portfolio',
      milestone: 'Có 1 artifact nhìn thấy được: tài liệu, video, dashboard, quy trình, bài mẫu hoặc case study.',
      tasks: [
        isTeacher
          ? 'Thiết kế outline 1 buổi học/mini course 30-45 phút cho người đi làm, có mục tiêu học, bài tập và tiêu chí đánh giá.'
          : `Tạo 1 deliverable gắn với ${compass.nextMilestone}: tài liệu, quy trình, bảng theo dõi, dashboard hoặc demo.`,
        'Ghi lại phiên bản trước/sau để chứng minh deliverable này giúp tiết kiệm thời gian, giảm lỗi hoặc tăng chất lượng.',
        'Đưa deliverable cho 1 quản lý/đồng nghiệp/khách hàng xem và xin nhận xét cụ thể.',
        'Lưu artifact vào folder portfolio kèm ngày tạo, link, ảnh chụp và người xác nhận.',
      ],
    },
    {
      focus: 'Chạy thử với người thật để lấy feedback',
      milestone: 'Có feedback thật từ ít nhất 2 người và 1 phiên bản đã sửa sau feedback.',
      tasks: [
        isTeacher
          ? 'Dạy thử/quay thử 1 phần bài học 10-15 phút, gửi cho 2 học viên/người đi làm xem.'
          : 'Cho 2 người dùng thử deliverable hoặc áp dụng vào 1 việc thật trong tuần.',
        'Hỏi feedback theo 3 câu: dễ hiểu không, phần nào hữu ích nhất, phần nào cần sửa để dùng thật.',
        'Sửa deliverable dựa trên feedback, ghi rõ trước/sau đã thay đổi gì.',
        'Xin 1 quote ngắn có thể dùng trong CV/LinkedIn hoặc buổi deal lương.',
      ],
    },
    {
      focus: 'Đo impact bằng KPI',
      milestone: 'Có ít nhất 1 chỉ số trước/sau đủ dùng để nói chuyện tăng lương.',
      tasks: [
        `Chọn 1 KPI sát với ${jobTitle}: thời gian xử lý, lỗi giảm, doanh thu, học viên hoàn thành, năng suất hoặc phản hồi khách hàng.`,
        'Ghi lại mốc hiện tại trong 3-5 ngày hoặc lấy số liệu gần nhất đang có.',
        'Áp dụng deliverable vào công việc thật và ghi kết quả sau khi áp dụng.',
        'Viết 1 dòng kết luận: tôi tạo ra thay đổi gì, bằng số nào, trong bao lâu.',
      ],
    },
    {
      focus: 'Đóng gói thành case study 1 trang',
      milestone: 'Có 1 case study ngắn đủ để gửi cho HR/sếp/khách hàng.',
      tasks: [
        'Viết case theo format: Vấn đề - Hành động - Kết quả - Bằng chứng.',
        'Thêm 2 ảnh/link minh chứng vào case study, tránh viết cảm tính.',
        'Đổi kết quả thành ngôn ngữ kinh doanh: tiết kiệm giờ, giảm lỗi, tăng tỷ lệ hoàn thành hoặc tăng doanh thu.',
        'Nhờ 1 người đọc case trong 2 phút và nói lại họ hiểu bạn tạo giá trị gì không.',
      ],
    },
    {
      focus: 'Sửa CV/LinkedIn để bán đúng giá trị',
      milestone: 'Có CV/LinkedIn mới với ít nhất 3 bullet có số liệu.',
      tasks: [
        `Viết lại headline theo role mục tiêu: ${rolePath}.`,
        'Chuyển case study thành 3 bullet CV theo công thức: làm gì + bằng công cụ/kỹ năng gì + kết quả bằng số.',
        'Đăng 1 post LinkedIn/Zalo nghề nghiệp chia sẻ bài học hoặc before/after, không cần khoe lương.',
        'Lưu link post/CV vào evidence log.',
      ],
    },
    {
      focus: 'Tạo danh sách cơ hội trả cao hơn',
      milestone: 'Có 20 cơ hội/đầu mối và 5 tin nhắn/email tiếp cận đầu tiên.',
      tasks: [
        `Lọc 20 công ty/trường/trung tâm/nhà máy/role có khả năng trả gần mức ${targetLabel}.`,
        'Chia danh sách thành 3 nhóm: dễ vào, vừa sức, stretch role.',
        'Viết 1 tin nhắn mở đầu 5 dòng kèm case study 1 trang.',
        'Gửi thử cho 5 đầu mối đầu tiên và ghi phản hồi vào tracker.',
      ],
    },
    {
      focus: 'Tập trả lời phỏng vấn/deal lương',
      milestone: 'Có script trả lời lương và 5 câu trả lời cho phản biện khó.',
      tasks: [
        `Soạn câu trả lời khi bị hỏi mức lương mong muốn, dùng mốc ${targetLabel} và bằng chứng đã tạo.`,
        'Viết 5 phản biện thường gặp: ngân sách thấp, chưa đủ kinh nghiệm, cần thử việc, so với mặt bằng cũ, chờ review.',
        'Tập nói thành tiếng 3 lần, mỗi lần dưới 90 giây.',
        'Ghi âm hoặc nhờ bạn phản biện để chỉnh lại câu chữ cho tự nhiên.',
      ],
    },
    {
      focus: 'Chạy vòng apply/đàm phán đầu tiên',
      milestone: 'Có ít nhất 5 lượt tiếp cận thật và 1 cuộc trao đổi lương hoặc scope công việc.',
      tasks: [
        'Gửi CV/case study tới 5-10 cơ hội trong danh sách đã lọc.',
        'Theo dõi phản hồi trong tracker: đã gửi, đã xem, phản hồi, bước tiếp theo.',
        `Nếu đang ở công ty hiện tại, xin 1 buổi 1-1 để hỏi tiêu chí lên mức ${targetLabel}.`,
        'Cập nhật evidence log với tất cả phản hồi thật, kể cả bị từ chối.',
      ],
    },
    {
      focus: 'Đóng gói đề xuất tăng lương',
      milestone: 'Có 1 gói đề xuất gồm số liệu, case study, mức lương đề xuất và phương án thay thế.',
      tasks: [
        `Viết 1 trang đề xuất: hiện trạng, impact đã tạo, benchmark thị trường, mức đề xuất ${targetLabel}.`,
        'Thêm phương án B: tăng scope, bonus KPI, phụ cấp, lộ trình review 60 ngày hoặc chuyển role.',
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
  if (/kpi|dashboard|so lieu|chi so/.test(normalized)) return 'Đo KPI và đọc số liệu';
  if (/cv|linkedin|headline|bullet/.test(normalized)) return 'Đóng gói hồ sơ nghề nghiệp';
  if (/feedback|review|quote/.test(normalized)) return 'Lấy feedback và cải tiến';
  if (/case study|evidence|bang chung|artifact|portfolio/.test(normalized)) return 'Viết case study/portfolio';
  if (/deal|dam phan|luong|de xuat/.test(normalized)) return 'Viết proposal và trình bày kết quả';
  if (/tin nhan|email|co hoi|apply|cong ty/.test(normalized)) return 'Lọc JD và gửi hồ sơ ứng tuyển';
  return fallback;
}

function buildTaskFromText(task: string, week: WeekPlan, jobTitle: string, compass: ReturnType<typeof getCareerCompassContext>): RoadmapActionTask {
  const skill = pickSkill(task, compass.topSkillGap);
  return {
    title: task,
    skill,
    output: /evidence|bằng chứng|artifact|case|portfolio|dashboard|CV|LinkedIn/i.test(task)
      ? '1 file/link/ảnh chụp lưu trong evidence log'
      : `1 output gắn trực tiếp với ${jobTitle}`,
    kpi: /kpi|chỉ số|số liệu|lương|doanh thu|lỗi|thời gian/i.test(task)
      ? 'Có số trước/sau hoặc mốc hoàn thành đo được'
      : 'Có người xác nhận hoặc có tiêu chí đạt/chưa đạt',
    doneDefinition: `Tick khi đã có output và nó phục vụ checkpoint: ${week.milestone}`,
  };
}

function buildActionPlan(
  weekly: RoadmapData,
  jobTitle: string,
  durationMonths: number,
  compass: ReturnType<typeof getCareerCompassContext>
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

  for (let i = 0; i < planWeeks.length; i += weeksPerMilestone) {
    const chunk = planWeeks.slice(i, i + weeksPerMilestone);
    const month = Math.floor(i / weeksPerMilestone) + 1;
    const skills = Array.from(new Set(chunk.flatMap(week =>
      week.tasks.map(task => pickSkill(task, compass.topSkillGap))
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
    weeklyHours: '3-5 giờ/tuần',
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
  const weakness = intake.mainWeakness || compass.topSkillGap;
  const goal = intake.twoYearGoal || `${targetSalary.toLocaleString('vi-VN')} VNĐ/tháng hoặc lên role tốt hơn`;
  const educationLevel = intake.educationLevel || 'Chưa cung cấp';
  const educationDetail = intake.educationDetail || 'Chưa cung cấp';
  const classification = classifyEducationFit(jobTitle, intake);
  const actionPlan = buildActionPlan(weekly, jobTitle, durationMonths, compass);
  const normalizedRole = normalizeForRoadmapQuality(`${jobTitle} ${role}`);
  const normalizedEducation = normalizeForRoadmapQuality(`${educationLevel} ${educationDetail}`);
  const isLanguageCenter = /trung tam ngoai ngu|language center|english center|quan ly trung tam|academic/.test(normalizedRole);
  const hasAcademicAdvantage = /thac si|mba|ngon ngu anh|english/.test(normalizedEducation);
  const focusProtocol = normalizeForRoadmapQuality(weakness).includes('khong tap trung chi tiet')
    ? [
        '- Checklist đầu ngày: viết 3 output bắt buộc, 5 lỗi cần né, 1 task phải đóng trước 11h.',
        '- 2 block tập trung: mỗi block 45-60 phút, chỉ xử lý 1 deliverable, tắt thông báo và ghi output cuối block.',
        '- Sổ lỗi chi tiết: ghi lỗi, nguyên nhân, chi phí, cách chặn lỗi tái diễn.',
        '- Review cuối ngày: đối chiếu output với checklist, chốt 1 cải tiến cho ngày mai.',
        '- Dashboard 5 chỉ số: task đóng, lỗi lặp lại, SLA trễ, thời gian deep work, output được quản lý/khách hàng xác nhận.',
        '- Quy tắc vận hành: không mở task mới khi task cũ chưa có output hữu hình.',
      ].join('\n')
    : `- Biến điểm yếu "${weakness}" thành checklist hằng ngày: việc làm cụ thể, output hữu hình, KPI đo và tiêu chuẩn hoàn thành.`;
  const languageCenterNote = isLanguageCenter && hasAcademicAdvantage
    ? `\n\nVới quản lý trung tâm ngoại ngữ, bằng cấp của bạn là lợi thế học thuật. Nhưng nếu chỉ làm vận hành thường ngày, bằng đang bị under-monetized. Muốn tăng lương, hãy biến bằng cấp thành quyền phụ trách đào tạo giáo viên, chuẩn hóa curriculum, tăng retention, giảm complaint, cải thiện trial-to-paid và mở lớp/chương trình mới. KPI ngành phải theo dõi: học viên active, retention/churn, trial-to-paid, lead-to-enrollment, class fill rate, teacher utilization, parent complaint SLA, renewal rate, revenue per class, dropout/refund reasons.`
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

  const markdown = `# Lộ trình thăng tiến Độc Bản

## Chẩn đoán nhanh
Bạn đang ở vai trò "${role}", lương hiện tại ${(currentSalary / 1_000_000).toFixed(1)}M/tháng và mục tiêu là "${goal}". Khoảng tăng cần chứng minh là ${(targetSalary - currentSalary).toLocaleString('vi-VN')} VNĐ/tháng, nên roadmap phải ưu tiên bằng chứng kinh doanh thay vì danh sách việc làm chung chung.

Cam kết thực hiện: nhịp chuẩn ${actionPlan.standardWeeks} tuần, nhịp bận ${actionPlan.flexibleWeeks} tuần, mỗi tuần ${actionPlan.weeklyHours}. Điều kiện được xem là hoàn thành: ${actionPlan.completionRule}

## Độ khớp học vấn với lương
- Phân loại: ${classification}.
- Học vấn: ${educationLevel}.
- Liên quan: ${educationDetail}.
- Bằng cấp đang giúp bạn có tín hiệu nền tảng, nhưng thị trường chỉ trả thêm khi tín hiệu đó biến thành KPI, scope lớn hơn hoặc quyền ra quyết định rõ hơn.
- Trong 30 ngày: chọn 1 năng lực học thuật áp vào việc thật; tạo 1 quy trình/dashboard/case study; xin 1 xác nhận từ quản lý hoặc khách hàng nội bộ.${languageCenterNote}

## Giao thức xử lý điểm yếu lớn nhất
${focusProtocol}

## Chiến lược ${durationLabel}
${monthSections}

## Bản đồ bằng chứng tăng lương
- Evidence log: việc đã làm, output, KPI trước/sau, ảnh/link/file, người xác nhận.
- Case study 1 trang: vấn đề, hành động, kết quả, bằng chứng, bài học có thể lặp lại.
- Dashboard lương: 5 chỉ số sát vai trò hiện tại và role mục tiêu.

## Kịch bản deal lương 90 giây
"Trong ${durationMonths} tháng qua, em tập trung xử lý ${weakness}. Kết quả là em có các bằng chứng sau: case study, dashboard KPI và output đã được xác nhận. Với mức đóng góp này và mặt bằng role mục tiêu, em muốn trao đổi về mức ${(targetSalary / 1_000_000).toFixed(1)}M/tháng hoặc một scope mới có KPI rõ để đạt mức đó."

## Cảnh báo điểm nghẽn
- Không xin tăng lương bằng nỗ lực; chỉ dùng output và KPI.
- Không đợi hoàn hảo; mỗi tuần phải có 1 bằng chứng nhỏ.
- Không học lan man; kỹ năng nào không tạo KPI trong công việc thì để sau.

## Việc cần làm trong 7 ngày tới
1. Chốt 5 KPI sát role "${role}".
2. Tạo evidence log và nhập số liệu nền.
3. Đóng gói 1 output nhỏ có thể gửi quản lý xem.
4. Xin feedback cụ thể và ghi lại thành bằng chứng.
5. Lên lịch review cuối tuần để chọn hành động tiếp theo.`;

  return {
    format: 'expert_v2',
    version: 2,
    goal: `Lộ trình thăng tiến Độc Bản cho ${role}`,
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

Nhiệm vụ: tạo một "Lộ trình thăng tiến Độc Bản" thực tế, thẳng thắn, có thể hành động ngay.

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
- Điểm yếu chuyên môn lớn nhất: ${intake.mainWeakness || compass.topSkillGap}
- Trình độ học vấn cao nhất: ${intake.educationLevel || 'Chưa cung cấp'}
- Ngành học/chứng chỉ liên quan: ${intake.educationDetail || 'Chưa cung cấp'}
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
# Lộ trình thăng tiến Độc Bản
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
- Phần "Độ khớp học vấn với lương" phải phân loại vào 1 nhóm: Under-credentialed nhưng có thực chiến, Credential-fit, Over-credentialed nhưng chưa monetized được bằng cấp, hoặc Misaligned credential.
- Phần học vấn phải nói rõ bằng cấp đang giúp gì, đang bị thị trường bỏ phí ở đâu, và 3 hành động trong 30 ngày để biến học vấn/kinh nghiệm thành bằng chứng lương.
- Với case quản lý trung tâm ngoại ngữ, nếu học vấn là Thạc sĩ/MBA hoặc Ngôn ngữ Anh, phải nói rõ: có lợi thế học thuật; nếu chỉ làm vận hành thường ngày thì bằng đang bị under-monetized; muốn tăng lương phải biến bằng cấp thành quyền phụ trách đào tạo giáo viên, chuẩn hóa curriculum, tăng retention, giảm complaint, cải thiện trial-to-paid và mở lớp/chương trình mới.
- Nếu điểm yếu là "không tập trung chi tiết" hoặc tương tự, phải tạo giao thức hằng ngày gồm checklist đầu ngày, 2 block tập trung, sổ lỗi chi tiết, review cuối ngày, dashboard 5 chỉ số và quy tắc không mở task mới khi task cũ chưa có output.
- Với quản lý trung tâm ngoại ngữ, phải dùng KPI ngành: học viên active, retention/churn, trial-to-paid, lead-to-enrollment, class fill rate, teacher utilization, parent complaint SLA, renewal rate, revenue per class, dropout/refund reasons.
- Mỗi hành động phải có việc làm cụ thể, output hữu hình, KPI đo và tiêu chuẩn hoàn thành.
- Không chỉ viết tháng chung chung. Mỗi tháng phải có tuần 1/2/3/4 hoặc checklist tuần rõ ràng để user tick tiến độ.

Hãy viết cụ thể theo ngành ${jobTitle}, vị trí "${intake.currentPosition || jobTitle}", điểm yếu "${intake.mainWeakness || compass.topSkillGap}", học vấn "${intake.educationLevel || 'chưa cung cấp'} - ${intake.educationDetail || 'chưa cung cấp'}" và mục tiêu "${intake.twoYearGoal || targetSalary}".`;

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
    if (markdown.length < 700 || hasBlockedCustomerTerm(markdown) || !/độ khớp học vấn với lương/i.test(markdown)) return FALLBACK;

    return {
      format: 'expert_v2',
      version: 2,
      goal: `Lộ trình thăng tiến Độc Bản cho ${intake.currentPosition || jobTitle}`,
      summary: `Bản phân tích chuyên gia theo ngành ${jobTitle}, lương hiện tại ${(currentSalary / 1_000_000).toFixed(1)}M/tháng, điểm yếu "${intake.mainWeakness || compass.topSkillGap}", học vấn "${intake.educationLevel || 'chưa cung cấp'}" và mục tiêu "${intake.twoYearGoal || `${(targetSalary / 1_000_000).toFixed(1)}M/tháng`}".`,
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

    const { vspiId, accessCode, currentPosition, mainWeakness, twoYearGoal, educationLevel, educationDetail } = await req.json();
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
    if (roadmap.roadmap_json && !isLowQualityRoadmap(roadmap.roadmap_json) && intakeMatches(roadmap.roadmap_json, intake)) {
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
    if (data.roadmap_json && isLowQualityRoadmap(data.roadmap_json)) {
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
  if (data.roadmap_json && isLowQualityRoadmap(data.roadmap_json)) {
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
