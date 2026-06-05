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

function normalizeDurationMonths(value: unknown): 3 | 6 | 9 {
  const numeric = Number(value);
  return numeric === 9 ? 9 : numeric === 6 ? 6 : 3;
}

function cleanRepeatedLoopCopy(value: string) {
  return value
    .replace(/\s*C.p nh.t b.ng ch.ng v.ng \d+\.?/gi, '')
    .replace(/\s*Cap nhat bang chung vong \d+\.?/gi, '')
    .replace(/\s*- v.ng n.ng c.p \d+/gi, '')
    .replace(/\s*- vong nang cap \d+/gi, '')
    .trim();
}

function getFallbackProgressionStage(weekIndex: number) {
  const stages = [
    {
      focus: 'Chot output goc va tieu chuan cham diem',
      task: 'Xac dinh output thuc te, tieu chuan dat/chua dat va bang chung goc',
      milestone: 'Co baseline, checklist va evidence goc duoc xac nhan.',
    },
    {
      focus: 'Lam mot output mau co the dung lai',
      task: 'Bien viec lap lai hang tuan thanh mot template hoac mau output co the kiem tra',
      milestone: 'Co KPI truoc/sau tu tinh huong that, khong chi checklist nhap.',
    },
    {
      focus: 'Do KPI truoc-sau tren ca viec that',
      task: 'Ap dung vao mot ca viec that, do loi/toc do/chat luong truoc-sau',
      milestone: 'Co bang KPI truoc/sau va log cach lam moi.',
    },
    {
      focus: 'Xin feedback lan dau va sua loi lon nhat',
      task: 'Xin feedback truc tiep, chon mot loi anh huong lon nhat va sua bang hanh dong cu the',
      milestone: 'Co feedback va bang chung loi lon nhat da duoc xu ly.',
    },
    {
      focus: 'Dua ky nang vao tinh huong co ap luc',
      task: 'Lam lai output trong tinh huong kho hon, nhieu ap luc hon hoac can phoi hop nguoi khac',
      milestone: 'Co case kho hon va bang chung van giu duoc chat luong.',
    },
    {
      focus: 'Giam loi lap lai va chuan hoa cach xu ly',
      task: 'Lap bang loi lap lai, nguyen nhan va cach chan loi truoc khi xay ra',
      milestone: 'Co log loi lap lai giam ro sau khi doi cach lam.',
    },
    {
      focus: 'Tang scope bang mot viec ngoai checklist cu',
      task: 'Nhan them mot phan viec co lien quan truc tiep, co nguoi xac nhan va output ro',
      milestone: 'Co bang chung scope rong hon ma khong lech nghe.',
    },
    {
      focus: 'Lay feedback lan hai tu nguoi dung ket qua',
      task: 'Lay feedback tu nguoi quan ly, khach hang noi bo hoac nguoi dung output',
      milestone: 'Co feedback lan hai va mot thay doi dua tren feedback.',
    },
    {
      focus: 'Dong goi portfolio bang chung co cau chuyen',
      task: 'Bien evidence thanh case study ngan gom boi canh, hanh dong, KPI va ket qua',
      milestone: 'Co case study gon, doc duoc va kiem tra duoc.',
    },
    {
      focus: 'Tao SOP hoac rate card tu cach lam tot nhat',
      task: 'Rut cach lam tot nhat thanh SOP, rate card, checklist nang cao hoac playbook',
      milestone: 'Co tai lieu co the ban giao hoac dung de deal scope.',
    },
    {
      focus: 'Chung minh tac dong voi team hoac khach hang',
      task: 'Dung bang chung de cho thay tac dong den team, khach hang, doanh thu, loi hoac toc do',
      milestone: 'Co bang chung tac dong vuot qua viec ca nhan hoan thanh task.',
    },
    {
      focus: 'Chuan bi review luong bang luan diem co so lieu',
      task: 'Chon ba bang chung manh nhat va viet luan diem review/deal dua tren so lieu',
      milestone: 'Co ho so review luong gom KPI, feedback, output va next-scope.',
    },
  ];
  const phase = Math.floor(weekIndex / stages.length);
  const stage = stages[weekIndex % stages.length];
  if (phase <= 0) return stage;
  return {
    focus: `${stage.focus} - cap do ${phase + 1}`,
    task: stage.task,
    milestone: stage.milestone,
  };
}

function rewriteFallbackTaskForStage(task: string, weekIndex: number, taskIndex: number) {
  const cleanTask = cleanRepeatedLoopCopy(task).replace(/[.;:]\s*$/, '');
  if (weekIndex <= 3) return cleanTask;
  const stage = getFallbackProgressionStage(weekIndex);
  const suffixes = [
    'ghi so truoc/sau va nguoi xac nhan.',
    'luu anh/file/log hoac feedback co the kiem tra.',
    'rut ra mot diem cai thien de dung cho tuan ke tiep.',
  ];
  return `${stage.task}: ${cleanTask}; ${suffixes[taskIndex % suffixes.length]}`;
}

function expandWeeksForDuration(seedWeeks: FallbackWeek[], durationMonths: number): FallbackWeek[] {
  const targetWeeks = Math.max(12, normalizeDurationMonths(durationMonths) * 4);
  const safeSeedWeeks = seedWeeks.length ? seedWeeks : [{
    week: 1,
    focus: 'Tao bang chung nghe nghiep do duoc',
    tasks: ['Hoan thanh mot output co KPI va nguoi xac nhan.'],
    milestone: 'Co bang chung du ro de dung trong review luong.',
  }];
  return Array.from({ length: targetWeeks }, (_, index) => {
    const seed = safeSeedWeeks[index % safeSeedWeeks.length];
    const stage = getFallbackProgressionStage(index);
    return {
      ...seed,
      week: index + 1,
      focus: index > 3 ? `${stage.focus}: ${cleanRepeatedLoopCopy(seed.focus)}` : cleanRepeatedLoopCopy(seed.focus),
      tasks: seed.tasks.map((task, taskIndex) => rewriteFallbackTaskForStage(task, index, taskIndex)),
      milestone: index > 3 ? `${stage.milestone} ${cleanRepeatedLoopCopy(seed.milestone)}` : cleanRepeatedLoopCopy(seed.milestone),
    };
  });
}

function includesMc(input: DeterministicRoadmapFallbackInput) {
  const text = `${input.canonicalRoleTitle} ${input.canonicalRoleId || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /\bmc\b|nguoi dan chuong trinh|host su kien|presenter|moderator|livestream host|wedding mc/.test(text);
}

function mcWeeks(): FallbackWeek[] {
  return [
    {
      week: 1,
      focus: 'Chuan hoa showreel, voice sample va format dan chuong trinh',
      tasks: [
        'Cat showreel 60-90 giay gom 3 format: khai mac, chuyen tiep tiet muc va xu ly tinh huong live; ghi ro boi canh tung doan.',
        'Ghi voice sample 3 tone: trang trong, nang dong va than mat; do do ro loi, toc do noi va loi lap lai.',
        'Lap checklist brief MC: muc tieu su kien, khan gia, timeline, ten nhan vat, cue san khau va noi dung cam ky.',
      ],
      milestone: 'Co showreel, voice sample va checklist brief co the gui cho agency/khach hang.',
    },
    {
      week: 2,
      focus: 'Viet script va run-of-show bam timeline',
      tasks: [
        'Viet script cho 1 chuong trinh mau gom opening, transition, sponsor mention, game/interaction va closing.',
        'Chuyen agenda thanh run-of-show co cue am thanh, anh sang, man hinh, nguoi phu trach va thoi luong tung block.',
        'Tap 2 lan voi dong ho, ghi lai doan vuot thoi gian, doan noi lap va doan thieu cau noi chuyen y.',
      ],
      milestone: 'Co script va run-of-show dung timeline, co log loi truoc/sau khi tap.',
    },
    {
      week: 3,
      focus: 'Xu ly tinh huong live va giu nang luong khan gia',
      tasks: [
        'Lap 10 kich ban su co: tre tiet muc, micro loi, khach moi den muon, khan gia im lang, trao giai sai ten va cach noi chuyen huong.',
        'Tap 5 cau bridge de lap khoang trong san khau ma khong bi dai dong hoac lech tone su kien.',
        'Xin feedback tu 1 nguoi tung lam event/agency ve presence, eye contact, timing va cach xu ly su co.',
      ],
      milestone: 'Co log tinh huong live, cau bridge va feedback ve kha nang lam chu san khau.',
    },
    {
      week: 4,
      focus: 'Dong goi rate card, feedback va case ban hang dich vu MC',
      tasks: [
        'Lap rate card theo 3 goi: su kien noi bo, brand activation/livestream va gala/wedding; ghi scope, thoi luong, deliverable va phi de xuat.',
        'Tong hop feedback, showreel, script/run-of-show va 1 case su co da xu ly thanh portfolio 1 trang.',
        'Viet tin nhan chao agency/khach hang gom showreel, format manh nhat, rate card va 2 cau chung minh gia tri.',
      ],
      milestone: 'Co portfolio va rate card du dung de chao show hoac deal fee MC cao hon.',
    },
  ];
}
function includesAirportCheckin(input: DeterministicRoadmapFallbackInput) {
  const text = `${input.canonicalRoleTitle} ${input.canonicalRoleId || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /nhan vien check[- ]?in san bay|airport ground|passenger service|ground service/.test(text);
}

function actionPlanFromWeeks(roleTitle: string, weeks: FallbackWeek[], userInputs: Record<string, unknown>) {
  const durationMonths = normalizeDurationMonths(userInputs.durationMonths || userInputs.duration_months || userInputs.duration);
  const monthCount = durationMonths;
  const weeksPerMonth = 4;
  const milestones = Array.from({ length: monthCount }, (_, monthIndex) => {
    const monthWeeks = weeks.slice(monthIndex * weeksPerMonth, monthIndex * weeksPerMonth + weeksPerMonth);
    const safeWeeks = monthWeeks.length ? monthWeeks : weeks.slice(0, weeksPerMonth);
    return {
      month: monthIndex + 1,
      title: monthIndex === 0
        ? `Chuẩn hóa evidence cho ${roleTitle}`
        : `Mở rộng bằng chứng tháng ${monthIndex + 1} cho ${roleTitle}`,
      objective: monthIndex === monthCount - 1
        ? 'Đóng gói case, KPI trước/sau và feedback đủ rõ để dùng trong review lương hoặc ứng tuyển role tốt hơn.'
        : 'Tạo bộ bằng chứng sạch, đúng nghề, có thể kiểm tra được trong tháng này.',
      skills: safeWeeks.flatMap(week => week.tasks).slice(0, 4),
      weeks: safeWeeks.map(week => ({
        week: week.week,
        focus: week.focus,
        tasks: week.tasks.slice(0, 1).map((task, index) => ({
          title: task,
          skill: task,
          output: `Evidence tuần ${week.week}.${index + 1}: ${task}`,
          kpi: week.milestone,
          doneDefinition: 'Có file/log/checklist hoặc feedback xác nhận, không chỉ ghi học lý thuyết.',
        })),
        checkpoint: week.milestone,
      })),
    };
  });
  return {
    standardWeeks: weeks.length,
    flexibleWeeks: Math.max(weeks.length + Math.ceil(durationMonths / 2), weeks.length),
    weeklyHours: asText(userInputs.weeklyTime, '3-5 giờ/tuần'),
    completionRule: 'Hoàn thành evidence từng tuần, đo KPI trước/sau và xin feedback quản lý trực tiếp trước khi dùng để review lương.',
    levelName: roleTitle,
    milestones,
  };
}

function buildMarkdown(roleTitle: string, weeks: FallbackWeek[], userInputs: Record<string, unknown>, avoidEmployeeReviewPhrase = false) {
  const targetDefault = asText(userInputs.futureGoalText || userInputs.twoYearGoal, `Tăng năng lực và có cơ sở review lương trong vai trò ${roleTitle}`);
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

function includesBartender(input: DeterministicRoadmapFallbackInput) {
  const text = `${input.canonicalRoleTitle} ${input.canonicalRoleId || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /bartender|bar tender|pha che.*bar|nhan vien pha che/.test(text);
}

function bartenderWeeks(): FallbackWeek[] {
  return [
    {
      week: 1,
      focus: 'Chu\u1ea9n h\u00f3a recipe card, \u0111\u1ecbnh l\u01b0\u1ee3ng cocktail/mocktail v\u00e0 bar station setup',
      tasks: [
        'T\u1ea1o recipe card cho 10 cocktail/mocktail b\u00e1n ch\u1ea1y, ghi r\u00f5 \u0111\u1ecbnh l\u01b0\u1ee3ng, garnish, glassware v\u00e0 th\u1eddi gian pha ch\u1ebf chu\u1ea9n.',
        'S\u1eafp x\u1ebfp bar station setup theo ca: syrup, garnish, \u0111\u00e1, tools, ly, POS note v\u00e0 checklist b\u00e0n giao qu\u1ea7y bar.',
        'Ghi log 20 order \u0111\u1ed3 u\u1ed1ng: t\u00ean m\u00f3n, recipe d\u00f9ng, l\u1ed7i \u0111\u1ecbnh l\u01b0\u1ee3ng, th\u1eddi gian ho\u00e0n t\u1ea5t \u0111\u1ed3 u\u1ed1ng v\u00e0 feedback kh\u00e1ch.',
      ],
      milestone: 'C\u00f3 recipe card, checklist qu\u1ea7y bar v\u00e0 baseline speed of service cho ca l\u00e0m.',
    },
    {
      week: 2,
      focus: 'T\u0103ng speed of service, POS/bar order accuracy v\u00e0 upsell \u0111\u1ed3 u\u1ed1ng',
      tasks: [
        '\u0110o speed of service cho 30 order cocktail/mocktail, so s\u00e1nh tr\u01b0\u1edbc/sau khi chu\u1ea9n h\u00f3a station.',
        'T\u1ea1o checklist POS/bar order accuracy: t\u00ean m\u00f3n, modifier, size, garnish, bill v\u00e0 th\u1eddi \u0111i\u1ec3m ho\u00e0n t\u1ea5t \u0111\u1ed3 u\u1ed1ng.',
        'Th\u1eed 3 script upsell \u0111\u1ed3 u\u1ed1ng ph\u00f9 h\u1ee3p: cocktail signature, mocktail, combo snack/drink; ghi t\u1ef7 l\u1ec7 kh\u00e1ch nh\u1eadn.',
      ],
      milestone: 'C\u00f3 b\u1ea3ng speed of service, l\u1ed7i POS/order v\u00e0 k\u1ebft qu\u1ea3 upsell \u0111o \u0111\u01b0\u1ee3c.',
    },
    {
      week: 3,
      focus: 'Ki\u1ec3m so\u00e1t t\u1ed3n kho qu\u1ea7y bar, hao h\u1ee5t nguy\u00ean li\u1ec7u pha ch\u1ebf v\u00e0 v\u1ec7 sinh qu\u1ea7y bar',
      tasks: [
        'L\u1eadp log t\u1ed3n kho qu\u1ea7y bar cho r\u01b0\u1ee3u, syrup, garnish, ly, \u0111\u00e1 v\u00e0 nguy\u00ean li\u1ec7u pha ch\u1ebf d\u1ec5 hao h\u1ee5t.',
        'Ghi 10 case hao h\u1ee5t nguy\u00ean li\u1ec7u: sai \u0111\u1ecbnh l\u01b0\u1ee3ng, \u0111\u1ed5 b\u1ecf, breakage, order sai; \u0111\u1ec1 xu\u1ea5t c\u00e1ch gi\u1ea3m.',
        'Chu\u1ea9n h\u00f3a checklist v\u1ec7 sinh qu\u1ea7y bar tr\u01b0\u1edbc/sau ca, c\u00f3 \u1ea3nh ho\u1eb7c supervisor feedback.',
      ],
      milestone: 'C\u00f3 log t\u1ed3n kho qu\u1ea7y bar, hao h\u1ee5t v\u00e0 checklist v\u1ec7 sinh \u0111\u01b0\u1ee3c supervisor xem.',
    },
    {
      week: 4,
      focus: 'T\u1ed5ng h\u1ee3p feedback kh\u00e1ch h\u00e0ng, checklist b\u00e0n giao ca v\u00e0 proposal l\u00ean Lead Bartender/Bar Supervisor',
      tasks: [
        'T\u1ed5ng h\u1ee3p feedback kh\u00e1ch h\u00e0ng v\u1ec1 \u0111\u1ed3 u\u1ed1ng, speed of service, upsell v\u00e0 service recovery t\u1ea1i qu\u1ea7y bar.',
        'Ho\u00e0n thi\u1ec7n checklist b\u00e0n giao ca: t\u1ed3n kho, station, v\u1ec7 sinh qu\u1ea7y bar, POS note, order pending v\u00e0 case kh\u00e1ch c\u1ea7n follow-up.',
        'Vi\u1ebft proposal 1 trang l\u00ean Lead Bartender/Bar Supervisor d\u1ef1a tr\u00ean recipe, speed, upsell, t\u1ed3n kho qu\u1ea7y bar v\u00e0 feedback supervisor.',
      ],
      milestone: 'C\u00f3 b\u1ed9 evidence 4 tu\u1ea7n s\u1eb5n s\u00e0ng \u0111\u1ec3 trao \u0111\u1ed5i compensation ho\u1eb7c scope Lead Bartender/Bar Supervisor.',
    },
  ];
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
        `Lap baseline output cho ${skill1}: 10 case/log, tieu chuan dat/chua dat va nguoi xac nhan ket qua.`,
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
  const isCustomRole = !input.canonicalRoleId && !input.roleProfile;
  const durationMonths = normalizeDurationMonths(input.userInputs.durationMonths || input.userInputs.duration_months || input.userInputs.duration);
  const fallbackTerms = getDeterministicFallbackTerms({
    jobTitle: roleTitle,
    roleId: input.canonicalRoleId,
    roleProfile: input.roleProfile,
  });
  const seedWeeks = includesAirportCheckin(input)
    ? airportCheckinWeeks()
    : includesBartender(input)
      ? bartenderWeeks()
      : includesMc(input)
        ? mcWeeks()
        : genericWeeks(input);
  const weeks = expandWeeksForDuration(seedWeeks, durationMonths);
  const markdown = buildMarkdown(roleTitle, weeks, input.userInputs, fallbackTerms.rules.length > 0);

  return {
    format: 'expert_v2',
    version: 2,
    goal: `Lộ trình tăng lương an toàn ${durationMonths} tháng cho ${roleTitle}`,
    summary: `Fallback sạch theo role profile ${input.canonicalRoleId || roleTitle}; dùng evidence thật, KPI đo được và không dùng nội dung sai nghề trong ${durationMonths} tháng.`,
    custom_role_notice: isCustomRole
      ? 'Custom role without benchmark-safe role_id; benchmark/percentile precision is limited, so this roadmap uses user description, transferable skills, measurable evidence and KPI.'
      : undefined,
    weeks,
    negotiation_timing: `Sau ${Math.max(4, Math.round(weeks.length * 0.75))} tuần có checklist, case log, KPI trước/sau và feedback quản lý trực tiếp.`,
    salary_projection: fallbackTerms.rules.length > 0
      ? 'Neu hoan thanh 70-80% evidence trong lo trinh, ban co co so trao doi compensation hoac scope tot hon. Day khong phai loi hua ve ket qua luong.'
      : 'Nếu hoàn thành 70-80% evidence trong lộ trình, bạn có cơ sở xin review lương hoặc bước lên role tốt hơn. Đây không phải lời hứa về kết quả lương.',
    markdown,
    intake: input.userInputs,
    actionPlan: actionPlanFromWeeks(roleTitle, weeks, input.userInputs),
  };
}
