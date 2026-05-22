import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { getCareerCompassContext } from '@/lib/careerCompassEngine';
import { enforceOrigin, rateLimit } from '@/lib/apiProtection';

export const dynamic = 'force-dynamic';

interface WeekPlan {
  week: number;
  focus: string;       // "Tuần 1: Xây portfolio"
  tasks: string[];     // 3-4 tasks cụ thể
  milestone: string;   // Kết quả đo được cuối tuần
}

interface RoadmapData {
  goal: string;
  summary: string;
  weeks: WeekPlan[];
  negotiation_timing: string;  // "Tuần X là thời điểm tốt nhất để đàm phán"
  salary_projection: string;   // "Nếu hoàn thành 80% tasks, lương kỳ vọng: X triệu"
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

const normalizeForRoadmapQuality = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bw\d+\b|\btuan\s+\d+\b|\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();

function isLowQualityRoadmap(value: unknown): value is RoadmapData {
  const roadmap = value as RoadmapData | null;
  if (!roadmap?.weeks || roadmap.weeks.length < 3) return true;

  const focusSignatures = roadmap.weeks.map(week => normalizeForRoadmapQuality(week.focus ?? ''));
  const uniqueFocus = new Set(focusSignatures.filter(Boolean));
  const taskSignatures = roadmap.weeks.flatMap(week =>
    (week.tasks ?? []).map(task => normalizeForRoadmapQuality(task))
  ).filter(Boolean);
  const uniqueTasks = new Set(taskSignatures);
  const repeatedFallbackTask = taskSignatures.filter(task =>
    task.includes('tao # evidence log') ||
    task.includes('viet deliverable') ||
    task.includes('xin feedback tu quan ly')
  ).length;

  return (
    uniqueFocus.size <= Math.ceil(roadmap.weeks.length * 0.45) ||
    uniqueTasks.size <= Math.ceil(taskSignatures.length * 0.55) ||
    repeatedFallbackTask >= roadmap.weeks.length
  );
}

function buildFallbackRoadmap(
  jobTitle: string,
  currentSalary: number,
  targetSalary: number,
  durationMonths: number,
  compass: ReturnType<typeof getCareerCompassContext>,
  segment: ReturnType<typeof detectRoadmapSegment>
): RoadmapData {
  const totalWeeks = Math.min(durationMonths * 4, 12);
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
        'Đo baseline hiện tại trong 3-5 ngày hoặc lấy số liệu gần nhất đang có.',
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
    goal: `Tăng lương từ ${(currentSalary / 1e6).toFixed(1)}M lên ${(targetSalary / 1e6).toFixed(1)}M trong ${durationMonths} tháng`,
    summary: `Lộ trình này đi theo chuỗi: chọn hướng trả cao hơn, học đúng kỹ năng, tạo bằng chứng thật, đo KPI, đóng gói CV/LinkedIn và dùng dữ liệu để deal lương.${segmentNote}`,
    weeks: blueprints.slice(0, totalWeeks).map((week, index) => ({ week: index + 1, ...week })),
    negotiation_timing: `Tuần ${Math.max(4, Math.round(totalWeeks * 0.75))} là thời điểm tốt nhất để đàm phán: khi bạn đã có case study, KPI trước/sau và gói đề xuất lương rõ ràng.`,
    salary_projection: `Nếu hoàn thành 70-80% task, bạn có case đàm phán hợp lý cho mức ${targetLabel}; không cam kết tăng lương, nhưng đây là mức có cơ sở để yêu cầu.`,
  };
}

async function generateRoadmap(
  jobTitle: string,
  currentSalary: number,
  targetSalary: number,
  durationMonths: number
): Promise<RoadmapData> {
  const weeks = durationMonths * 4;
  const salaryGap = targetSalary - currentSalary;
  const compass = getCareerCompassContext(jobTitle, currentSalary, 50);
  const segment = detectRoadmapSegment(jobTitle);

  const FALLBACK = buildFallbackRoadmap(jobTitle, currentSalary, targetSalary, durationMonths, compass, segment);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return FALLBACK;

  const prompt = `Bạn là career coach chuyên nghiệp tại Việt Nam. Tạo lộ trình tăng lương chi tiết cho:

- Nghề nghiệp: ${jobTitle}
- Lương hiện tại: ${currentSalary.toLocaleString('vi-VN')} VNĐ/tháng
- Lương mục tiêu: ${targetSalary.toLocaleString('vi-VN')} VNĐ/tháng  
- Thời gian: ${durationMonths} tháng (${weeks} tuần)
- Cần tăng: ${salaryGap.toLocaleString('vi-VN')} VNĐ/tháng
- Nhóm nghề: ${compass.jobGroup}
- Band hiện tại: ${compass.bandLabel} (${compass.currentBandRange}/tháng)
- Skill gap quan trọng nhất: ${compass.topSkillGap}
- Milestone để lên band: ${compass.nextMilestone}
- Insight thị trường: ${compass.marketInsight}
${segment ? `- Segment đặc biệt: ${segment.label}
- Ưu tiên roadmap: ${segment.priority}
- Loại bằng chứng phải thu thập: ${segment.proof}` : ''}

Trả về JSON CHÍNH XÁC theo format sau (không thêm text ngoài JSON):
{
  "goal": "Mô tả mục tiêu ngắn gọn",
  "summary": "Tóm tắt chiến lược 2-3 câu, thẳng thắn, thực tế",
  "weeks": [
    {
      "week": 1,
      "focus": "Tiêu đề tuần — ngắn gọn, hành động",
      "tasks": [
        "Task cụ thể 1 — có thể đo được, không chung chung",
        "Task cụ thể 2",
        "Task cụ thể 3"
      ],
      "milestone": "Kết quả đo được cuối tuần này là gì"
    }
  ],
  "negotiation_timing": "Tuần X là thời điểm tốt nhất để đàm phán vì...",
  "salary_projection": "Nếu hoàn thành 80% tasks, lương kỳ vọng: X triệu/tháng"
}

Tạo đúng ${Math.min(weeks, 12)} tuần. Tasks phải CỰC KỲ CỤ THỂ cho ngành ${jobTitle}, không generic.
Mỗi task phải tạo ra 1 output hữu hình: evidence log, KPI trước/sau, portfolio artifact, script deal lương, CV bullet, LinkedIn proof, hoặc email xin raise.
Nếu là sinh viên mới tốt nghiệp: tập trung offer đầu đời, thử việc, portfolio, CV bullet và script xin review lương sau 60-90 ngày.
Nếu là công nhân Bình Dương/nhà máy: tập trung chuyên cần, sản lượng, tỷ lệ lỗi, an toàn lao động, kỹ năng vận hành máy và bước lên tổ phó/tổ trưởng.
Không được hứa chắc tăng lương. Viết thực tế: nếu hoàn thành 70-80% thì có case đàm phán tốt hơn.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 3000, temperature: 0.7 },
        }),
      }
    );
    clearTimeout(timeout);

    if (!res.ok) return FALLBACK;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Extract JSON từ response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return FALLBACK;

    const parsed = JSON.parse(jsonMatch[0]) as RoadmapData;
    if (!parsed.weeks?.length) return FALLBACK;
    if (isLowQualityRoadmap(parsed)) return FALLBACK;
    return parsed;

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

    const { vspiId } = await req.json();
    if (!vspiId) return NextResponse.json({ error: 'Missing vspiId' }, { status: 400 });

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
    if (roadmap.roadmap_json && !isLowQualityRoadmap(roadmap.roadmap_json)) {
      return NextResponse.json({ roadmap: roadmap.roadmap_json, progress: roadmap.task_progress });
    }

    // Generate mới
    const generated = await generateRoadmap(
      roadmap.job_title,
      roadmap.current_salary,
      roadmap.target_salary,
      roadmap.duration_months
    );

    // Lưu vào DB
    await supabaseServer
      .from('roadmaps')
      .update({ roadmap_json: generated, task_progress: {} })
      .eq('vspi_id', vspiId);

    return NextResponse.json({ roadmap: generated, progress: {} });

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

  // Lookup bằng SĐT — trả về roadmap paid mới nhất
  if (phone && !vspiId) {
    const clean = phone.replace(/\D/g, '');
    const { data, error } = await supabaseServer
      .from('roadmaps')
      .select('vspi_id, roadmap_json, task_progress, status, goal_label, job_title, current_salary, target_salary, duration_months, paid_at')
      .eq('phone', clean)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (data.roadmap_json && isLowQualityRoadmap(data.roadmap_json)) {
      const generated = await generateRoadmap(
        data.job_title,
        data.current_salary,
        data.target_salary,
        data.duration_months
      );
      await supabaseServer
        .from('roadmaps')
        .update({ roadmap_json: generated, task_progress: {} })
        .eq('vspi_id', data.vspi_id);
      return NextResponse.json({ ...data, roadmap_json: generated, task_progress: {} });
    }
    return NextResponse.json(data);
  }

  if (!vspiId) return NextResponse.json({ error: 'Missing id or phone' }, { status: 400 });

  const { data, error } = await supabaseServer
    .from('roadmaps')
    .select('vspi_id, roadmap_json, task_progress, status, goal_label, job_title, current_salary, target_salary, duration_months')
    .eq('vspi_id', vspiId)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (data.roadmap_json && isLowQualityRoadmap(data.roadmap_json)) {
    const generated = await generateRoadmap(
      data.job_title,
      data.current_salary,
      data.target_salary,
      data.duration_months
    );
    await supabaseServer
      .from('roadmaps')
      .update({ roadmap_json: generated, task_progress: {} })
      .eq('vspi_id', data.vspi_id);
    return NextResponse.json({ ...data, roadmap_json: generated, task_progress: {} });
  }
  return NextResponse.json(data);
}
