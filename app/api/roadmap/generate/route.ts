import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

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

async function generateRoadmap(
  jobTitle: string,
  currentSalary: number,
  targetSalary: number,
  durationMonths: number
): Promise<RoadmapData> {
  const weeks = durationMonths * 4;
  const salaryGap = targetSalary - currentSalary;

  const FALLBACK: RoadmapData = {
    goal: `Tăng lương từ ${(currentSalary/1e6).toFixed(1)}M lên ${(targetSalary/1e6).toFixed(1)}M trong ${durationMonths} tháng`,
    summary: `Lộ trình ${durationMonths} tháng tập trung vào 3 trụ cột: nâng kỹ năng chuyên môn, xây dựng bằng chứng thành tích, và đàm phán lương có số liệu.`,
    weeks: Array.from({ length: Math.min(weeks, 12) }, (_, i) => ({
      week: i + 1,
      focus: i < 4 ? 'Nâng kỹ năng & xây portfolio' : i < 8 ? 'Tạo impact đo được' : 'Chuẩn bị đàm phán',
      tasks: [
        `Hoàn thành 1 task chuyên môn có thể đo được bằng số`,
        `Ghi lại kết quả vào "bằng chứng thành tích" cá nhân`,
        `Học 1 kỹ năng mới liên quan đến vị trí mục tiêu`,
      ],
      milestone: `Có ít nhất 1 thành tích cụ thể để trình bày`,
    })),
    negotiation_timing: `Tuần ${Math.round(weeks * 0.75)} là thời điểm tốt nhất để đàm phán — sau khi đã có đủ bằng chứng.`,
    salary_projection: `Nếu hoàn thành 80% tasks, lương kỳ vọng: ${(targetSalary/1e6).toFixed(1)} triệu/tháng.`,
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return FALLBACK;

  const prompt = `Bạn là career coach chuyên nghiệp tại Việt Nam. Tạo lộ trình tăng lương chi tiết cho:

- Nghề nghiệp: ${jobTitle}
- Lương hiện tại: ${currentSalary.toLocaleString('vi-VN')} VNĐ/tháng
- Lương mục tiêu: ${targetSalary.toLocaleString('vi-VN')} VNĐ/tháng  
- Thời gian: ${durationMonths} tháng (${weeks} tuần)
- Cần tăng: ${salaryGap.toLocaleString('vi-VN')} VNĐ/tháng

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

Tạo đúng ${Math.min(weeks, 12)} tuần. Tasks phải CỰC KỲ CỤ THỂ cho ngành ${jobTitle}, không generic. Mỗi task phải có thể tick "done" được.`;

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

// GET — lấy roadmap + progress
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vspiId = searchParams.get('id');
  if (!vspiId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data, error } = await supabaseServer
    .from('roadmaps')
    .select('roadmap_json, task_progress, status, goal_label, job_title, target_salary, duration_months')
    .eq('vspi_id', vspiId)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
