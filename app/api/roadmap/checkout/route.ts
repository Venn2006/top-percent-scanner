import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { supabaseServer } from '@/lib/supabaseServer';
import { protectPublicMutation } from '@/lib/apiProtection';
import { issueRoadmapAccessCode } from '@/lib/roadmapAccessServer';
import { detectRoadmapIntentPhrase, ROADMAP_INTENT_CONTEXT, type RoadmapIntent } from '@/lib/roadmapAccess';
import { findClosestRoleProfiles, getRoleProfileById, resolveRoadmapRoleFromJobTitle } from '@/lib/roleProfiles';
import {
  buildTrustedRoadmapTarget,
  normalizeRoadmapDuration,
  parseTrustedSalaryInput,
  resolveTrustedSalaryBenchmark,
} from '@/lib/serverSalaryGuard';

function genVSPIId(): string {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'VSPI-2026-';
  for (let i = 0; i < 4; i++) s += c[randomInt(c.length)];
  s += '-';
  for (let i = 0; i < 4; i++) s += c[randomInt(c.length)];
  return s;
}

function safeJsonError(error: string, code: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, code, ...extra }, { status });
}

async function readJsonBody(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function roleSuggestions(jobTitle: string) {
  if (detectRoadmapIntentPhrase(jobTitle)) return [];
  return findClosestRoleProfiles(jobTitle, 3).map(profile => ({
    role_id: profile.key,
    title: profile.title,
    industry: profile.industry,
  }));
}

function normalizeRoadmapIntent(value: unknown): RoadmapIntent | null {
  if (typeof value === 'string' && value in ROADMAP_INTENT_CONTEXT) return value as RoadmapIntent;
  return detectRoadmapIntentPhrase(value);
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object') {
      return safeJsonError('Payload không hợp lệ. Vui lòng thử lại.', 'INVALID_JSON', 400);
    }
    const protectionError = protectPublicMutation(req, body, {
      namespace: 'roadmap-checkout',
      maxRequests: 5,
      requireConsent: true,
    });
    if (protectionError) return protectionError;

    const {
      phone,
      job_title,
      current_salary,
      duration_months,
      goal_label,
      experience,
      market_location,
      work_province,
      utm_source,
      utm_medium,
      utm_campaign,
      referrer,
    } = body;
    const selectedRoleId = typeof (body.selectedRoleId ?? body.selected_role_id) === 'string'
      ? String(body.selectedRoleId ?? body.selected_role_id).trim()
      : '';
    const selectedRoleProfile = selectedRoleId ? getRoleProfileById(selectedRoleId) : null;
    const rawJobTitle = typeof job_title === 'string' ? job_title.trim() : '';
    const rawJobIntent = detectRoadmapIntentPhrase(rawJobTitle);
    const roadmapIntent = normalizeRoadmapIntent(body.roadmapIntent ?? body.roadmap_intent) || rawJobIntent;

    if (selectedRoleId && !selectedRoleProfile) {
      return safeJsonError('Hệ thống chưa có bộ kỹ năng đủ chắc cho nghề này. Vui lòng chọn nghề gần nhất trong danh sách.', 'MISSING_ROLE_ID', 400, {
        suggestions: roleSuggestions(rawJobTitle),
      });
    }

    const intentNeedsRoleSelection = Boolean(roadmapIntent && !selectedRoleProfile && (!rawJobTitle || rawJobIntent));
    if (intentNeedsRoleSelection) {
      return safeJsonError('Chọn nghề cụ thể trước khi tạo lộ trình. Các mẫu như Mới tốt nghiệp, 3+ năm dậm chân hoặc Muốn đổi hướng chỉ là bối cảnh, không phải nghề để benchmark.', 'ROLE_SELECTION_REQUIRED', 400, {
        roadmapIntent,
        prompt: roadmapIntent ? ROADMAP_INTENT_CONTEXT[roadmapIntent].prompt : 'Chọn nghề cụ thể trước khi tạo lộ trình.',
        suggestions: [],
      });
    }

    const trustedInput = parseTrustedSalaryInput({
      job_title: selectedRoleProfile?.title || job_title,
      current_salary,
      experience,
      market_location,
      work_province,
    });
    if ('error' in trustedInput) {
      return NextResponse.json({ error: trustedInput.error }, { status: 400 });
    }
    if (phone && (typeof phone !== 'string' || !/^0[0-9]{9}$/.test(phone))) {
      return NextResponse.json({ error: 'Invalid phone format' }, { status: 400 });
    }
    const resolvedJobRole = resolveRoadmapRoleFromJobTitle(trustedInput.jobTitle);
    const exactRoleId = selectedRoleProfile?.key || resolvedJobRole?.role_id || '';
    const exactRoleTitle = selectedRoleProfile?.title || resolvedJobRole?.title || trustedInput.jobTitle;
    if (!exactRoleId) {
      return safeJsonError('Nghề bạn nhập hơi dài hoặc chưa khớp chắc với dữ liệu. Vui lòng chọn nghề gần nhất trước khi tạo lộ trình.', 'ROLE_CONFIRMATION_REQUIRED', 400, {
        suggestions: roleSuggestions(trustedInput.jobTitle),
      });
    }

    const duration = normalizeRoadmapDuration(duration_months);
    const resolved = await resolveTrustedSalaryBenchmark(supabaseServer, trustedInput, true);
    const targetSalary = buildTrustedRoadmapTarget(
      trustedInput.salary,
      duration,
      resolved.benchmark.strategicTargetSalary
    );
    const serverGoalLabel = typeof goal_label === 'string' && goal_label.trim()
      ? goal_label.trim().slice(0, 180)
      : 'Server verified ' + duration + 'm target: ' + targetSalary + '/month from ' + trustedInput.salary + '/month';

    const vspiId = genVSPIId();

    let { error } = await supabaseServer
      .from('roadmaps')
      .insert({
        vspi_id:         vspiId,
        phone:           phone || null,
        job_title:       exactRoleTitle.slice(0, 200),
        role_id:         exactRoleId,
        current_salary:  trustedInput.salary,
        target_salary:   targetSalary,
        duration_months: duration,
        goal_label:      serverGoalLabel,
        utm_source:      cleanTrackingValue(utm_source),
        utm_medium:      cleanTrackingValue(utm_medium),
        utm_campaign:    cleanTrackingValue(utm_campaign),
        referrer:        cleanTrackingValue(referrer),
        status:          'pending',
      });

    if (error && /utm_|referrer|schema cache|column/i.test(error.message)) {
      const fallback = await supabaseServer
        .from('roadmaps')
        .insert({
          vspi_id:         vspiId,
          phone:           phone || null,
          job_title:       exactRoleTitle.slice(0, 200),
          role_id:         exactRoleId,
          current_salary:  trustedInput.salary,
          target_salary:   targetSalary,
          duration_months: duration,
          goal_label:      serverGoalLabel,
          status:          'pending',
        });
      error = fallback.error;
    }

    if (error) {
      console.error('[roadmap/checkout]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, vspiId, accessCode: issueRoadmapAccessCode(vspiId), role_id: exactRoleId });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[roadmap/checkout]', msg);
    return safeJsonError(msg || 'Không tạo được lộ trình lúc này. Vui lòng kiểm tra lại nghề/lương hoặc thử lại sau 1 phút.', 'ROADMAP_GENERATION_FAILED', 500);
  }
}

function cleanTrackingValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, 120);
  return cleaned || null;
}
