import { NextRequest, NextResponse } from 'next/server';
import { checkSecurity } from '@/lib/security';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const securityError = checkSecurity(req, 10); // Stricter limit for scan
  if (securityError) return securityError;

  try {
    const body = await req.json();
    const { job_title, salary } = body;

    if (!job_title || !salary) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from('salary_data')
      .select('*')
      .eq('job_title', job_title)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    let percent = 80;
    let lostMoney = 48_000_000;
    const userSal = Number(salary);
    let isAboveMedian = false;

    // Masked data to return to client
    const safeData = {
      top_50: data?.top_50 ?? 15_000_000,
      top_20: data?.top_20 ?? null,
      top_10: null as number | null, // Masked
      top_5: null as number | null, // Masked
      industry: data?.industry,
      job_title: data?.job_title
    };

    if (data) {
      if (userSal >= (data.top_5 ?? Infinity)) percent = 5;
      else if (userSal >= (data.top_10 ?? Infinity)) percent = 10;
      else if (userSal >= (data.top_20 ?? Infinity)) percent = 20;
      else if (userSal >= (data.top_50 ?? Infinity)) percent = 50;
      
      isAboveMedian = userSal >= (data.top_50 ?? 0);
      
      if (!isAboveMedian) {
        lostMoney = Math.max(0, (data.top_50 - userSal) * 12);
      } else if (percent > 10) {
        lostMoney = Math.max(0, ((data.top_10 ?? data.top_50 * 1.8) - userSal) * 12);
      } else {
        lostMoney = Math.max(0, ((data.top_5 ?? data.top_50 * 2.2) - userSal) * 12);
      }
    }

    return NextResponse.json({ 
      percent, 
      lostMoney, 
      isAboveMedian,
      dbData: safeData 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
