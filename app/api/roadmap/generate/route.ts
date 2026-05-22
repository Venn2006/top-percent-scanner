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

  const FALLBACK: RoadmapData = {
    goal: `Tăng lương từ ${(currentSalary/1e6).toFixed(1)}M lên ${(targetSalary/1e6).toFixed(1)}M trong ${durationMonths} tháng`,
    summary: `Lộ trình ${durationMonths} tháng tập trung vào 4 trụ cột: ${segment ? segment.priority : compass.topSkillGap}, bằng chứng KPI, gói đàm phán, và thời điểm xin tăng lương.`,
    weeks: Array.from({ length: Math.min(weeks, 12) }, (_, i) => ({
      week: i + 1,
      focus: i < 4 ? `Nâng skill: ${compass.topSkillGap}` : i < 8 ? 'Tạo impact đo được bằng KPI' : 'Chuẩn bị gói đàm phán lương',
      tasks: [
        `Tạo 1 evidence log: ${segment ? segment.proof : 'việc đã làm, số trước/sau, ảnh/link chứng minh, người xác nhận'}`,
        `Hoàn thành 1 deliverable gắn với ${compass.nextMilestone}`,
        `Viết deliverable đó thành 1 bullet CV/LinkedIn có số liệu đo được`,
        i >= 8 ? `Soạn 1 đoạn script deal lương dựa trên gap ${compass.salaryGapFmt}/tháng` : `Xin feedback từ quản lý/khách hàng và lưu quote vào evidence log`,
      ],
      milestone: `Có ít nhất 1 bằng chứng có số liệu để dùng khi deal lương`,
    })),
    negotiation_timing: `Tuần ${Math.round(weeks * 0.75)} là thời điểm tốt nhất để đàm phán: khi bạn đã có evidence log, KPI trước/sau và 1 gói đề xuất lương thay thế.`,
    salary_projection: `Nếu hoàn thành 80% tasks, bạn có case đàm phán hợp lý cho mức ${(targetSalary/1e6).toFixed(1)} triệu/tháng; không cam kết, nhưng đây là mức có cơ sở để yêu cầu.`,
  };

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

    // Nếu đã có roadmap_json rồi thì trả về luôn
    if (roadmap.roadmap_json) {
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
      .update({ roadmap_json: generated })
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
    return NextResponse.json(data);
  }

  if (!vspiId) return NextResponse.json({ error: 'Missing id or phone' }, { status: 400 });

  const { data, error } = await supabaseServer
    .from('roadmaps')
    .select('vspi_id, roadmap_json, task_progress, status, goal_label, job_title, current_salary, target_salary, duration_months')
    .eq('vspi_id', vspiId)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
