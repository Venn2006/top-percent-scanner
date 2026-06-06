import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { rateLimit } from '@/lib/apiProtection';
import { cleanRoadmapAccessCode } from '@/lib/roadmapAccess';
import { issueRoadmapAccessCode, roadmapAccessCodeMatches } from '@/lib/roadmapAccessServer';
import { parseTrustedSalaryInput, resolveTrustedSalaryBenchmark } from '@/lib/serverSalaryGuard';
import { enforceUpstashRateLimit } from '@/lib/rateLimit';

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' };

type RecoveryItem = {
  id: string;
  product: 'report29' | 'roadmap79';
  productLabel: string;
  jobTitle: string | null;
  roleId?: string | null;
  targetJobTitle: string | null;
  currentSalary: number | null;
  targetSalary: number | null;
  status: string;
  statusLabel: string;
  progressDone: number | null;
  progressTotal: number | null;
  certificateEligible: boolean;
  lastUpdated: string | null;
  maskedAccessCode: string;
  accessVerified: boolean;
  vspiId?: string;
  accessCode?: string;
};

// POST — lưu 1 lần quét vào history
export async function POST(req: NextRequest) {
  const upstashLimitError = await enforceUpstashRateLimit(req, { namespace: 'api:history', requests: 20 });
  if (upstashLimitError) return upstashLimitError;

  try {
    const {
      phone,
      job_title,
      salary,
      experience,
      market_location,
      work_province,
      utm_source,
      utm_medium,
      utm_campaign,
      referrer,
      is_custom_job,
      match_type,
      estimated_industry,
      estimated_top_50,
      estimated_top_20,
      estimated_top_10,
      estimated_top_5,
      estimated_skills,
    } = await req.json();

    const trustedInput = parseTrustedSalaryInput({ job_title, salary, experience, market_location, work_province });
    if ('error' in trustedInput) {
      return NextResponse.json({ error: trustedInput.error }, { status: 400 });
    }
    const resolved = await resolveTrustedSalaryBenchmark(supabaseServer, trustedInput, false);

    const isCustomJob = is_custom_job === true;
    const hasDirectData = resolved.hasDirectData;
    const matchType = resolved.matchType || (typeof match_type === 'string' ? match_type : '');

    const payload = {
      phone:      phone || null,
      job_title:  trustedInput.jobTitle.slice(0, 200),
      salary:     trustedInput.salary,
      percent:    resolved.percentileBucket,
      experience: trustedInput.experience,
      market_location: trustedInput.marketLocation,
      work_province: trustedInput.workProvince,
      utm_source: cleanTrackingValue(utm_source),
      utm_medium: cleanTrackingValue(utm_medium),
      utm_campaign: cleanTrackingValue(utm_campaign),
      referrer: cleanTrackingValue(referrer),
    };

    const { error } = await supabaseServer.from('scan_history').insert(payload);
    if (error && /utm_|referrer|market_location|work_province|schema cache|column/i.test(error.message)) {
      const fallback = await supabaseServer.from('scan_history').insert({
        phone: payload.phone,
        job_title: payload.job_title,
        salary: payload.salary,
        percent: payload.percent,
        experience: payload.experience,
      });
      if (fallback.error) throw fallback.error;
    } else if (error) {
      throw error;
    }

    if (isCustomJob || (!hasDirectData && ['national_fallback', 'industry_estimate', 'ai_estimate'].includes(matchType))) {
      await insertCustomJobSuggestion({
        job_title: payload.job_title,
        salary: payload.salary,
        percent: payload.percent,
        experience: payload.experience,
        market_location: payload.market_location,
        work_province: payload.work_province,
        match_type: matchType || (isCustomJob ? 'custom_input' : null),
        has_direct_data: hasDirectData,
        note: buildEstimateNote({
          estimated_industry: resolved.industry ?? estimated_industry,
          estimated_top_50: resolved.fullDbData.top_50 ?? estimated_top_50,
          estimated_top_20: resolved.fullDbData.top_20 ?? estimated_top_20,
          estimated_top_10: resolved.fullDbData.top_10 ?? estimated_top_10,
          estimated_top_5: resolved.fullDbData.top_5 ?? estimated_top_5,
          estimated_skills,
        }),
      });
    }

    return NextResponse.json({ success: true, queuedForReview: isCustomJob || (!hasDirectData && ['national_fallback', 'industry_estimate', 'ai_estimate'].includes(matchType)) });
  } catch (err: unknown) {
    console.error('[history] POST error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function insertCustomJobSuggestion(payload: {
  job_title: string;
  salary: number;
  percent: number;
  experience: unknown;
  market_location: string;
  work_province: string;
  match_type: string | null;
  has_direct_data: boolean;
  note?: string | null;
}) {
  const { error } = await supabaseServer
    .from('custom_job_suggestions')
    .insert({
      job_title: payload.job_title,
      salary: payload.salary,
      percent: payload.percent,
      experience: typeof payload.experience === 'string' ? payload.experience : null,
      market_location: payload.market_location,
      work_province: payload.work_province,
      match_type: payload.match_type,
      has_direct_data: payload.has_direct_data,
      status: 'pending',
      note: payload.note,
    });

  if (error && !/custom_job_suggestions|schema cache|relation/i.test(error.message)) {
    console.warn('[history] custom job suggestion insert failed:', error.message);
  }
}

function buildEstimateNote(input: Record<string, unknown>) {
  const skills = Array.isArray(input.estimated_skills)
    ? input.estimated_skills.filter(item => typeof item === 'string').slice(0, 4)
    : [];
  const note = {
    industry: typeof input.estimated_industry === 'string' ? input.estimated_industry.slice(0, 120) : null,
    top_50: Number(input.estimated_top_50) || null,
    top_20: Number(input.estimated_top_20) || null,
    top_10: Number(input.estimated_top_10) || null,
    top_5: Number(input.estimated_top_5) || null,
    skills,
  };
  if (!note.industry && !note.top_50 && !skills.length) return null;
  return JSON.stringify(note).slice(0, 900);
}

function cleanTrackingValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, 120);
  return cleaned || null;
}

function maskAccessCode(value: unknown): string {
  const clean = cleanRoadmapAccessCode(value);
  if (!clean) return '';
  if (clean.length <= 8) return `${clean.slice(0, 2)}••••${clean.slice(-2)}`;
  return `${clean.slice(0, 4)}••••${clean.slice(-3)}`;
}

function reportAccessMatches(vspiId: unknown, accessCode: string): boolean {
  const cleanId = cleanRoadmapAccessCode(vspiId);
  return Boolean(cleanId && accessCode && cleanId === accessCode);
}

function countActionTasks(roadmapJson: unknown): number {
  const data = roadmapJson && typeof roadmapJson === 'object' ? roadmapJson as Record<string, unknown> : {};
  const actionPlan = data.actionPlan && typeof data.actionPlan === 'object' ? data.actionPlan as Record<string, unknown> : null;
  const milestones = Array.isArray(actionPlan?.milestones) ? actionPlan.milestones : [];
  let total = 0;
  for (const milestone of milestones) {
    const m = milestone && typeof milestone === 'object' ? milestone as Record<string, unknown> : {};
    const weeks = Array.isArray(m.weeks) ? m.weeks : [];
    for (const week of weeks) {
      const w = week && typeof week === 'object' ? week as Record<string, unknown> : {};
      total += Array.isArray(w.tasks) ? w.tasks.length : 0;
    }
  }
  return total;
}

function countCompletedTasks(taskProgress: unknown): number {
  const progress = taskProgress && typeof taskProgress === 'object' ? taskProgress as Record<string, unknown> : {};
  return Object.entries(progress)
    .filter(([key, value]) => /^w\d{1,2}_t\d{1,2}$/.test(key) && value === true)
    .length;
}

function extractRoadmapTargetTitle(roadmapJson: unknown): string | null {
  const data = roadmapJson && typeof roadmapJson === 'object' ? roadmapJson as Record<string, unknown> : {};
  const userInputs = data.userInputs && typeof data.userInputs === 'object' ? data.userInputs as Record<string, unknown> : null;
  const target = userInputs?.targetJobTitle || userInputs?.targetRoleTitle || data.targetJobTitle || data.targetRoleTitle;
  return typeof target === 'string' && target.trim() ? target.trim().slice(0, 200) : null;
}

function recoveryStatusLabel(product: RecoveryItem['product'], status: string, hasRoadmap: boolean, done: number, total: number): string {
  if (status !== 'paid') return 'Đang chờ xác nhận thanh toán';
  if (product === 'report29') return 'Đã mở khóa — mở báo cáo';
  if (!hasRoadmap) return 'Đã mở khóa — tạo lộ trình';
  if (total > 0 && done >= total) return 'Hoàn thành';
  if (done > 0) return 'Đang thực thi';
  return 'Đã tạo lộ trình';
}

async function fetchRecoveryItems(phone: string, accessCode: string): Promise<RecoveryItem[]> {
  const [purchaseResult, roadmapResult] = await Promise.all([
    supabaseServer
      .from('purchases')
      .select('vspi_id, job_title, current_salary, status, paid_at, created_at')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(30),
    supabaseServer
      .from('roadmaps')
      .select('vspi_id, job_title, role_id, current_salary, target_salary, duration_months, status, roadmap_json, task_progress, paid_at, created_at')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  if (purchaseResult.error) throw purchaseResult.error;
  if (roadmapResult.error) throw roadmapResult.error;

  const purchases: RecoveryItem[] = (purchaseResult.data || []).map(row => {
    const vspiId = String(row.vspi_id || '');
    const verified = reportAccessMatches(vspiId, accessCode);
    const status = String(row.status || 'pending');
    return {
      id: `report29:${maskAccessCode(vspiId)}:${row.created_at || ''}`,
      product: 'report29',
      productLabel: 'Báo cáo lương 29K',
      jobTitle: row.job_title || null,
      roleId: null,
      targetJobTitle: null,
      currentSalary: Number(row.current_salary) || null,
      targetSalary: null,
      status,
      statusLabel: recoveryStatusLabel('report29', status, false, 0, 0),
      progressDone: null,
      progressTotal: null,
      certificateEligible: false,
      lastUpdated: row.paid_at || row.created_at || null,
      maskedAccessCode: maskAccessCode(vspiId),
      accessVerified: verified,
      ...(verified ? { vspiId, accessCode: vspiId } : {}),
    };
  });

  const roadmaps: RecoveryItem[] = (roadmapResult.data || []).map(row => {
    const vspiId = String(row.vspi_id || '');
    const fullAccessCode = issueRoadmapAccessCode(vspiId);
    const verified = roadmapAccessCodeMatches(vspiId, accessCode);
    const hasRoadmap = Boolean(row.roadmap_json);
    const total = hasRoadmap ? countActionTasks(row.roadmap_json) : 0;
    const done = countCompletedTasks(row.task_progress);
    const status = String(row.status || 'pending');
    return {
      id: `roadmap79:${maskAccessCode(fullAccessCode)}:${row.created_at || ''}`,
      product: 'roadmap79',
      productLabel: 'Lộ trình 79K',
      jobTitle: row.job_title || null,
      roleId: row.role_id || null,
      targetJobTitle: extractRoadmapTargetTitle(row.roadmap_json),
      currentSalary: Number(row.current_salary) || null,
      targetSalary: Number(row.target_salary) || null,
      status: hasRoadmap && status === 'paid' ? 'generated' : status,
      statusLabel: recoveryStatusLabel('roadmap79', status, hasRoadmap, done, total),
      progressDone: hasRoadmap ? done : null,
      progressTotal: hasRoadmap ? total : null,
      certificateEligible: hasRoadmap && total > 0 && done >= total,
      lastUpdated: row.paid_at || row.created_at || null,
      maskedAccessCode: maskAccessCode(fullAccessCode),
      accessVerified: verified,
      ...(verified ? { vspiId, accessCode: fullAccessCode } : {}),
    };
  });

  return [...purchases, ...roadmaps].sort((a, b) => Date.parse(b.lastUpdated || '') - Date.parse(a.lastUpdated || ''));
}

// GET — lấy lịch sử theo SĐT
export async function GET(req: NextRequest) {
  const upstashLimitError = await enforceUpstashRateLimit(req, { namespace: 'api:history', requests: 20 });
  if (upstashLimitError) return upstashLimitError;

  try {
    const limitError = rateLimit(req, 'scan-history-read', 20);
    if (limitError) return limitError;

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');
    const accessCode = cleanRoadmapAccessCode(searchParams.get('accessCode') || searchParams.get('code') || '');

    if (!phone || !/^0[0-9]{9}$/.test(phone)) {
      return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
    }

    const query = await supabaseServer
      .from('scan_history')
      .select('job_title, salary, percent, experience, market_location, work_province, scanned_at')
      .eq('phone', phone)
      .order('scanned_at', { ascending: false })
      .limit(20);
    let history = query.data as unknown[] | null;
    let error = query.error;

    if (error && /market_location|work_province|schema cache|column/i.test(error.message)) {
      const fallback = await supabaseServer
        .from('scan_history')
        .select('job_title, salary, percent, experience, scanned_at')
        .eq('phone', phone)
        .order('scanned_at', { ascending: false })
        .limit(20);
      history = fallback.data as unknown[] | null;
      error = fallback.error;
    }

    if (error) throw error;

    const recoveries = await fetchRecoveryItems(phone, accessCode);

    return NextResponse.json({ history: history || [], recoveries }, { headers: NO_CACHE_HEADERS });
  } catch (err: unknown) {
    console.error('[history] GET error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
