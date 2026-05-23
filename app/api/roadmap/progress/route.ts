import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { enforceOrigin, rateLimit } from '@/lib/apiProtection';
import { roadmapAccessCodeMatches } from '@/lib/roadmapAccess';

export const dynamic = 'force-dynamic';

// POST — update task progress
export async function POST(req: NextRequest) {
  try {
    const originError = enforceOrigin(req);
    if (originError) return originError;
    const limitError = rateLimit(req, 'roadmap-progress', 80);
    if (limitError) return limitError;

    const { vspiId, accessCode, taskKey, done } = await req.json();
    if (!vspiId || !taskKey) return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    if (typeof vspiId !== 'string' || !/^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(vspiId)) {
      return NextResponse.json({ error: 'Invalid vspiId' }, { status: 400 });
    }
    if (!roadmapAccessCodeMatches(vspiId, accessCode)) {
      return NextResponse.json({ error: 'Access code required' }, { status: 401 });
    }
    if (typeof taskKey !== 'string' || !/^w\d{1,2}_t\d{1,2}$/.test(taskKey)) {
      return NextResponse.json({ error: 'Invalid taskKey' }, { status: 400 });
    }

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
