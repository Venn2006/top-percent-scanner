import { NextRequest, NextResponse } from 'next/server';
import { checkSecurity } from '@/lib/security';
import { supabaseServer } from '@/lib/supabaseServer';
import { getExactRoleProfile } from '@/lib/roleProfiles';

const normalizeJobKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const AVIATION_ROLE_REGEX = /tiep vien hang khong|cabin crew|flight attendant|stewardess|steward|hang khong|airline|hang bay/;
const canonicalIndustryForJob = (title: string, industry?: string | null) =>
  AVIATION_ROLE_REGEX.test(normalizeJobKey(title))
    ? 'Dịch vụ/Vận tải hàng không'
    : industry ?? null;

const roleIdForJob = (title: string, industry?: string | null) =>
  getExactRoleProfile(title, industry)?.key || getExactRoleProfile(title)?.key || null;

export async function GET(req: NextRequest) {
  const securityError = checkSecurity(req, 30);
  if (securityError) return securityError;

  try {
    const { data, error } = await supabaseServer
      .from('salary_data')
      .select('industry, job_title'); // chỉ lấy 2 cột cần thiết

    if (error) throw error;

    const merged = new Map<string, { industry: string | null; job_title: string; role_id?: string | null }>();
    (data ?? []).forEach(item => {
      if (item.job_title) {
        const industry = canonicalIndustryForJob(item.job_title, item.industry);
        merged.set(normalizeJobKey(item.job_title), {
          industry,
          job_title: item.job_title,
          role_id: roleIdForJob(item.job_title, industry),
        });
      }
    });

    // Bảng mới có thể chưa tồn tại ở một số môi trường; nếu lỗi thì bỏ qua để app vẫn chạy.
    const { data: benchmarks } = await supabaseServer
      .from('salary_benchmarks')
      .select('industry, canonical_job_title')
      .limit(2000);

    (benchmarks ?? []).forEach(item => {
      const title = item.canonical_job_title as string | undefined;
      if (title) {
        const industry = canonicalIndustryForJob(title, item.industry);
        merged.set(normalizeJobKey(title), {
          industry,
          job_title: title,
          role_id: roleIdForJob(title, industry),
        });
      }
    });

    merged.set(normalizeJobKey('Quản lý trung tâm ngoại ngữ'), {
      industry: 'Giáo dục - Trung tâm ngoại ngữ',
      job_title: 'Quản lý trung tâm ngoại ngữ',
      role_id: 'quan ly trung tam ngoai ngu__giao duc',
    });

    merged.set(normalizeJobKey('Tiếp viên hàng không'), {
      industry: 'Dịch vụ/Vận tải hàng không',
      job_title: 'Tiếp viên hàng không',
      role_id: 'tiep vien hang khong__van tai - logistics',
    });

    return NextResponse.json({ data: Array.from(merged.values()) });

  } catch (err: unknown) {
    console.error('[jobs] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
