import type { RoleProfile } from '@/lib/roleProfiles';
import { getDeterministicFallbackTerms } from '@/lib/roleSiblingGuards';

interface DeterministicRoadmapFallbackInput {
  roleProfile: RoleProfile | null;
  canonicalRoleTitle: string;
  canonicalRoleId: string | null;
  userInputs: Record<string, unknown>;
}

interface FallbackWeek {
  week: number;
  focus: string;
  tasks: string[];
  milestone: string;
}

function asText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function includesAirportCheckin(input: DeterministicRoadmapFallbackInput) {
  const text = `${input.canonicalRoleTitle} ${input.canonicalRoleId || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /nhan vien check[- ]?in san bay|airport ground|passenger service|ground service/.test(text);
}

function actionPlanFromWeeks(roleTitle: string, weeks: FallbackWeek[], userInputs: Record<string, unknown>) {
  return {
    standardWeeks: weeks.length,
    flexibleWeeks: Math.max(weeks.length + 2, 6),
    weeklyHours: asText(userInputs.weeklyTime, '3-5 giờ/tuần'),
    completionRule: 'Hoàn thành evidence từng tuần, đo KPI trước/sau và xin feedback quản lý trực tiếp trước khi dùng để review lương.',
    levelName: roleTitle,
    milestones: [
      {
        month: 1,
        title: `Chuẩn hóa evidence cho ${roleTitle}`,
        objective: 'Tạo bộ bằng chứng sạch, đúng nghề, có thể kiểm tra được trong 7-30 ngày.',
        skills: weeks.flatMap(week => week.tasks).slice(0, 4),
        weeks: weeks.map(week => ({
          week: week.week,
          focus: week.focus,
          tasks: week.tasks.map((task, index) => ({
            title: task,
            skill: task,
            output: `Evidence tuần ${week.week}.${index + 1}: ${task}`,
            kpi: week.milestone,
            doneDefinition: 'Có file/log/checklist hoặc feedback xác nhận, không chỉ ghi học lý thuyết.',
          })),
          checkpoint: week.milestone,
        })),
      },
    ],
  };
}

function buildMarkdown(roleTitle: string, weeks: FallbackWeek[], userInputs: Record<string, unknown>, avoidEmployeeReviewPhrase = false) {
  const targetDefault = asText(userInputs.twoYearGoal, `Tăng năng lực và có cơ sở review lương trong vai trò ${roleTitle}`);
  const target = avoidEmployeeReviewPhrase ? `Tang scope va co co so trao doi compensation trong vai tro ${roleTitle}` : targetDefault;
  const bottleneck = asText(userInputs.bottleneck || userInputs.mainWeakness, 'Chưa có evidence đủ rõ để chứng minh năng lực tăng lương');

  return [
    `# Lộ trình tăng lương cho ${roleTitle}`,
    '',
    `Mục tiêu: ${target}`,
    `Điểm nghẽn chính: ${bottleneck}`,
    '',
    ...weeks.flatMap(week => [
      `## W${week.week}: ${week.focus}`,
      ...week.tasks.map(task => `- ${task}`),
      `Checkpoint: ${week.milestone}`,
      '',
    ]),
    '## Bản đồ bằng chứng tăng lương',
    '- Gom checklist, case log, KPI trước/sau và feedback quản lý trực tiếp.',
    '- Chỉ dùng bằng chứng tạo ra từ công việc thật trong ca/tuần làm việc bình thường.',
    '',
    '## Kịch bản deal lương 90 giây',
    avoidEmployeeReviewPhrase
      ? `Toi dang lam ${roleTitle}. Trong 4 tuan vua roi toi da chuan hoa evidence, giam loi va co feedback truc tiep. Toi muon trao doi compensation/scope dua tren ket qua do duoc, khong chi dua vao tham nien.`
      : `Tôi đang làm ${roleTitle}. Trong 4 tuần vừa rồi tôi đã chuẩn hóa evidence, giảm lỗi và có feedback trực tiếp. Tôi muốn xin review mức lương dựa trên kết quả đo được, không chỉ dựa vào thâm niên.`,
    '',
    '## Cảnh báo điểm nghẽn',
    '- Không đem chứng chỉ hoặc task ngoài nghề làm bằng chứng chính.',
    '- Không xin tăng lương khi chưa có log lỗi, KPI và feedback cụ thể.',
  ].join('\n');
}

function airportCheckinWeeks(): FallbackWeek[] {
  return [
    {
      week: 1,
      focus: 'Chuẩn hóa check-in giấy tờ và boarding pass',
      tasks: [
        'Checklist kiểm tra vé, hộ chiếu, visa, giấy tờ tùy thân trước khi in boarding pass tại quầy check-in.',
        'Log lỗi check-in: sai tên, sai chuyến, thiếu visa, hành lý quá cước, khách trễ chuyến và cách xử lý đúng quy trình.',
        'Luyện script tiếng Anh tại quầy check-in cho 5 tình huống: thiếu giấy tờ, hành lý quá cước, đổi chuyến, khách trễ chuyến, cần gọi supervisor.',
      ],
      milestone: 'Có checklist giấy tờ, 10 dòng log lỗi check-in và 5 script xử lý hành khách tại quầy.',
    },
    {
      week: 2,
      focus: 'Giảm lỗi nhập thông tin và phối hợp gate/baggage',
      tasks: [
        'Tạo bảng giảm lỗi nhập thông tin check-in và bước kiểm tra chéo trước khi in boarding pass.',
        'Ghi 10 case hành khách thiếu giấy tờ hoặc trễ chuyến, kèm cách gọi supervisor, gate và baggage service.',
        'Xin feedback supervisor về tốc độ xử lý hành khách, tuân thủ checklist giấy tờ và thái độ tại quầy check-in.',
      ],
      milestone: 'Có bảng lỗi trước/sau, 10 case log và feedback supervisor đầu tiên.',
    },
    {
      week: 3,
      focus: 'Chuẩn hóa hành lý ký gửi và service recovery',
      tasks: [
        'Chuẩn hóa quy trình xử lý hành lý ký gửi, hành lý quá cước và trường hợp cần chuyển baggage service.',
        'Tạo evidence log gồm checklist, case log, feedback supervisor và ảnh/bản ghi hợp lệ của quy trình quầy check-in.',
        'Đề xuất 1 cải tiến nhỏ giúp giảm thời gian xử lý hành khách tại quầy check-in trong ca đông khách.',
      ],
      milestone: 'Có checklist hành lý, evidence log và 1 đề xuất cải tiến được supervisor phản hồi.',
    },
    {
      week: 4,
      focus: 'Đóng gói bằng chứng review lương',
      tasks: [
        'Tổng hợp before/after: số lỗi check-in, số case hành khách xử lý đúng, feedback supervisor và tình huống gate/baggage phối hợp tốt.',
        'Chuẩn bị bản xin review tăng lương dựa trên evidence: checklist, boarding pass flow, hộ chiếu/visa check, hành lý và case khó.',
        'Định vị bước tiếp theo: Senior Passenger Service Agent hoặc Ground Service Supervisor dựa trên năng lực xử lý quầy check-in.',
      ],
      milestone: 'Có bộ evidence 4 tuần và script review lương dựa trên KPI thật.',
    },
  ];
}

function chunkTerms(terms: string[], start: number, fallback: string) {
  const picked = terms.slice(start, start + 4).filter(Boolean);
  return picked.length ? picked.join(', ') : fallback;
}

function siblingGuardWeeks(input: DeterministicRoadmapFallbackInput, requiredTerms: string[]): FallbackWeek[] {
  const roleTitle = input.canonicalRoleTitle;
  return [
    {
      week: 1,
      focus: `Lock dung role va skill chinh cua ${roleTitle}`,
      tasks: [
        `Tao checklist cong viec that cho ${roleTitle} voi cac tu khoa: ${chunkTerms(requiredTerms, 0, roleTitle)}.`,
        `Ghi 10 case/log trong ca lam lien quan truc tiep den ${chunkTerms(requiredTerms, 2, roleTitle)}.`,
        `Xin feedback quan ly ve output ${roleTitle}, khong dung task cua role anh em cung nganh.`,
      ],
      milestone: `Co baseline KPI va evidence dung role ${roleTitle}.`,
    },
    {
      week: 2,
      focus: 'Chuan hoa output do duoc',
      tasks: [
        `Chuan hoa 1 template/checklist cho ${chunkTerms(requiredTerms, 4, roleTitle)}.`,
        `Do loi, toc do hoac chat luong dau ra gan voi ${chunkTerms(requiredTerms, 6, roleTitle)}.`,
        `Tao before/after evidence cho ${roleTitle} bang KPI trong ca lam that.`,
      ],
      milestone: 'Co output cu the, KPI do duoc va diem can cai thien.',
    },
    {
      week: 3,
      focus: 'Tang do kho case va giam loi',
      tasks: [
        `Xu ly 5 case kho hon lien quan den ${chunkTerms(requiredTerms, 8, roleTitle)}.`,
        `Tao evidence log gom ${chunkTerms(requiredTerms, 10, roleTitle)}.`,
        `Xin feedback lan 2 sau khi cai thien dung scope ${roleTitle}.`,
      ],
      milestone: 'Co log case kho va feedback cai thien ro rang.',
    },
    {
      week: 4,
      focus: 'Dong goi bang chung review luong',
      tasks: [
        `Tong hop checklist, KPI va feedback cho ${roleTitle}.`,
        `Viet ban review nang luc dua tren ${chunkTerms(requiredTerms, 0, roleTitle)}.`,
        'Chuan bi kich ban trao doi compensation dua tren bang chung, khong dua vao cam tinh.',
      ],
      milestone: 'Co bo evidence 4 tuan du dung de trao doi compensation hoac scope tot hon.',
    },
  ];
}

function genericWeeks(input: DeterministicRoadmapFallbackInput): FallbackWeek[] {
  const siblingFallback = getDeterministicFallbackTerms({
    jobTitle: input.canonicalRoleTitle,
    roleId: input.canonicalRoleId,
    roleProfile: input.roleProfile,
  });
  if (siblingFallback.required.length >= 3) return siblingGuardWeeks(input, siblingFallback.required);

  const skills = input.roleProfile?.skills?.filter(Boolean) || [];
  const evidence = [
    input.roleProfile?.preview?.firstAction,
    input.roleProfile?.preview?.cvBullet,
    input.roleProfile?.language?.proofAsset,
    input.roleProfile?.language?.kpiGuidance,
  ].filter((value): value is string => Boolean(value && value.trim()));
  const skill1 = skills[0] || input.roleProfile?.preview?.coreSkill || `Kỹ năng lõi của ${input.canonicalRoleTitle}`;
  const skill2 = skills[1] || input.roleProfile?.language?.mainSkill || `Quy trình làm việc của ${input.canonicalRoleTitle}`;
  const skill3 = skills[2] || `Bằng chứng hiệu suất của ${input.canonicalRoleTitle}`;

  return [
    {
      week: 1,
      focus: `Đo nền năng lực ${input.canonicalRoleTitle}`,
      tasks: [
        `Tạo checklist công việc thật xoay quanh ${skill1}.`,
        `Ghi log 10 case trong tuần liên quan đến ${skill2}.`,
        evidence[0] || `Xin feedback quản lý trực tiếp về ${skill1} và ${skill2}.`,
      ],
      milestone: `Có baseline KPI và evidence đầu tiên cho ${input.canonicalRoleTitle}.`,
    },
    {
      week: 2,
      focus: 'Chuẩn hóa output đo được',
      tasks: [
        `Chuẩn hóa 1 template/output cho ${skill1}.`,
        `Đo lỗi, thời gian xử lý hoặc chất lượng đầu ra của ${skill2}.`,
        evidence[1] || `Tạo before/after cho ${skill3}.`,
      ],
      milestone: 'Có output cụ thể, KPI đo được và điểm cần cải thiện.',
    },
    {
      week: 3,
      focus: 'Tăng độ khó case và giảm lỗi',
      tasks: [
        `Xử lý 5 case khó hơn liên quan đến ${skill1}.`,
        `Tạo evidence log cho ${skill2} và ${skill3}.`,
        evidence[2] || 'Xin feedback lần 2 từ quản lý trực tiếp sau khi cải thiện.',
      ],
      milestone: 'Có log case khó và feedback cải thiện rõ ràng.',
    },
    {
      week: 4,
      focus: 'Đóng gói bằng chứng review lương',
      tasks: [
        `Tổng hợp checklist, KPI và feedback cho ${input.canonicalRoleTitle}.`,
        `Viết bản review năng lực dựa trên ${skill1}, ${skill2} và ${skill3}.`,
        'Chuẩn bị kịch bản trao đổi lương dựa trên bằng chứng, không dựa vào cảm tính.',
      ],
      milestone: 'Có bộ evidence 4 tuần đủ dùng để xin review lương hoặc role tốt hơn.',
    },
  ];
}

export function buildDeterministicRoadmapFallback(input: DeterministicRoadmapFallbackInput): unknown {
  const roleTitle = input.canonicalRoleTitle || input.roleProfile?.title || 'Vai trò hiện tại';
  const fallbackTerms = getDeterministicFallbackTerms({
    jobTitle: roleTitle,
    roleId: input.canonicalRoleId,
    roleProfile: input.roleProfile,
  });
  const weeks = includesAirportCheckin(input) ? airportCheckinWeeks() : genericWeeks(input);
  const markdown = buildMarkdown(roleTitle, weeks, input.userInputs, fallbackTerms.rules.length > 0);

  return {
    format: 'expert_v2',
    version: 2,
    goal: `Lộ trình tăng lương an toàn cho ${roleTitle}`,
    summary: `Fallback sạch theo role profile ${input.canonicalRoleId || roleTitle}; dùng evidence thật, KPI đo được và không dùng nội dung sai nghề.`,
    weeks,
    negotiation_timing: 'Sau 4 tuần có checklist, case log, KPI trước/sau và feedback quản lý trực tiếp.',
    salary_projection: fallbackTerms.rules.length > 0
      ? 'Neu hoan thanh 70-80% evidence trong lo trinh, ban co co so trao doi compensation hoac scope tot hon. Day khong phai cam ket tang luong.'
      : 'Nếu hoàn thành 70-80% evidence trong lộ trình, bạn có cơ sở xin review lương hoặc bước lên role tốt hơn. Đây không phải cam kết tăng lương.',
    markdown,
    intake: input.userInputs,
    actionPlan: actionPlanFromWeeks(roleTitle, weeks, input.userInputs),
  };
}
