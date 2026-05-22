/**
 * Group Compare API — "So sánh lương ẩn danh với nhóm bạn"
 *
 * POST /api/group  → Tạo group hoặc join group
 * Body: { action: 'create' | 'join', groupId?, job_title, percent, industry? }
 *
 * Group data lưu tạm trong Supabase table `compare_groups`.
 * Mỗi group tối đa 10 members, hết hạn sau 7 ngày.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { enforceOrigin, rateLimit } from '@/lib/apiProtection';

// Generate short group ID (6 chars, dễ share)
function genGroupId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export async function POST(req: NextRequest) {
  try {
    const originError = enforceOrigin(req);
    if (originError) return originError;
    const limitError = rateLimit(req, 'group-post', 12);
    if (limitError) return limitError;

    const body = await req.json();
    const { action, groupId, job_title, percent, industry } = body;

    if (!action || !job_title || percent === undefined) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    if (action === 'create') {
      // Tạo group mới
      const newGroupId = genGroupId();
      const memberData = {
        job_title: String(job_title).slice(0, 100),
        percent: Number(percent),
        industry: industry || null,
        joined_at: new Date().toISOString(),
      };

      const { error } = await supabaseServer
        .from('compare_groups')
        .insert({
          group_id: newGroupId,
          members: [memberData],
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });

      if (error) throw error;

      return NextResponse.json({
        success: true,
        groupId: newGroupId,
        shareUrl: `https://top-percent-scanner.vercel.app?group=${newGroupId}`,
        members: [memberData],
        yourRank: 1,
        totalMembers: 1,
      });
    }

    if (action === 'join') {
      if (!groupId) {
        return NextResponse.json({ error: 'Missing groupId' }, { status: 400 });
      }

      // Fetch group
      const { data: group, error: fetchErr } = await supabaseServer
        .from('compare_groups')
        .select('*')
        .eq('group_id', String(groupId).toUpperCase())
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!group) {
        return NextResponse.json({ error: 'Group not found or expired' }, { status: 404 });
      }

      // Check expired
      if (new Date(group.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Group expired' }, { status: 410 });
      }

      // Check max members
      const members = (group.members || []) as Array<{ job_title: string; percent: number; industry?: string; joined_at: string }>;
      if (members.length >= 10) {
        return NextResponse.json({ error: 'Group full (max 10)' }, { status: 400 });
      }

      // Add new member
      const newMember = {
        job_title: String(job_title).slice(0, 100),
        percent: Number(percent),
        industry: industry || null,
        joined_at: new Date().toISOString(),
      };
      const updatedMembers = [...members, newMember];

      // Sort by percent (ascending = higher rank)
      updatedMembers.sort((a, b) => a.percent - b.percent);

      const { error: updateErr } = await supabaseServer
        .from('compare_groups')
        .update({ members: updatedMembers })
        .eq('group_id', String(groupId).toUpperCase());

      if (updateErr) throw updateErr;

      // Find your rank
      const yourRank = updatedMembers.findIndex(m =>
        m.percent === Number(percent) && m.job_title === String(job_title).slice(0, 100)
      ) + 1;

      return NextResponse.json({
        success: true,
        groupId: group.group_id,
        members: updatedMembers.map(m => ({
          job_title: m.job_title,
          percent: m.percent,
          // Ẩn danh: không trả industry/timing cho người khác
        })),
        yourRank,
        totalMembers: updatedMembers.length,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (err: unknown) {
    console.error('[group] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET — xem leaderboard group (không cần auth)
export async function GET(req: NextRequest) {
  try {
    const originError = enforceOrigin(req);
    if (originError) return originError;
    const limitError = rateLimit(req, 'group-get', 30);
    if (limitError) return limitError;

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get('id');

    if (!groupId) {
      return NextResponse.json({ error: 'Missing group id' }, { status: 400 });
    }

    const { data: group, error } = await supabaseServer
      .from('compare_groups')
      .select('group_id, members, created_at, expires_at')
      .eq('group_id', groupId.toUpperCase())
      .maybeSingle();

    if (error) throw error;
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const members = (group.members || []) as Array<{ job_title: string; percent: number }>;
    // Sort ascending (Top 5% = rank 1)
    members.sort((a, b) => a.percent - b.percent);

    return NextResponse.json({
      groupId: group.group_id,
      members: members.map((m, i) => ({
        rank: i + 1,
        job_title: m.job_title,
        percent: m.percent,
      })),
      totalMembers: members.length,
      expiresAt: group.expires_at,
    });

  } catch (err: unknown) {
    console.error('[group] GET Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
