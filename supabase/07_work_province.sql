-- ============================================================
-- VSPI — collect work province/city for regional salary insight
-- Run in Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS work_province text;

ALTER TABLE public.scan_history
  ADD COLUMN IF NOT EXISTS market_location text,
  ADD COLUMN IF NOT EXISTS work_province text;

CREATE INDEX IF NOT EXISTS idx_purchases_work_province
  ON public.purchases (work_province);

CREATE INDEX IF NOT EXISTS idx_scan_history_market_location
  ON public.scan_history (market_location);

CREATE INDEX IF NOT EXISTS idx_scan_history_work_province
  ON public.scan_history (work_province);

-- Quick anonymous aggregate for future recruiter/headhunter insight products.
-- Never export phone/raw users; aggregate only.
SELECT
  work_province,
  market_location,
  job_title,
  COUNT(*) AS scans,
  ROUND(AVG(salary)) AS avg_salary,
  ROUND(AVG(percent)) AS avg_percentile
FROM public.scan_history
WHERE work_province IS NOT NULL
GROUP BY work_province, market_location, job_title
ORDER BY scans DESC
LIMIT 20;
