import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// POST — update task progress
export async function POST(req: NextRequest) {
  try {
    const { vspiId, taskKey, done } = await req.json();
    if (!vspiId || !taskKey) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

    // Fetch current progress
    const { data, error } = await supabaseServer
      .from('roadmaps')
      .select('task_progress')
      .eq('vspi_id', vspiId)
      .eq('status', 'paid')
      .maybeSingle();

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const progress = (data.task_progress as Record<string, boolean>) || {};
    progress[taskKey] = Boolean(done);

    await supabaseServer
      .from('roadmaps')
      .update({ task_progress: progress })
      .eq('vspi_id', vspiId);

    return NextResponse.json({ success: true, progress });
  } catch (err: unknown) {
    console.error('[roadmap/progress]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
