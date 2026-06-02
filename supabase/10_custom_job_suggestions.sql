-- Job nhập tay chờ owner duyệt.
-- Bảng này chỉ lưu tín hiệu nhu cầu, không tham gia tính benchmark tự động.
CREATE TABLE IF NOT EXISTS public.custom_job_suggestions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_title text NOT NULL,
  salary integer NOT NULL,
  percent integer,
  experience text,
  market_location text,
  work_province text,
  match_type text,
  has_direct_data boolean DEFAULT false,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_job_suggestions_status
  ON public.custom_job_suggestions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_custom_job_suggestions_job
  ON public.custom_job_suggestions (job_title);

ALTER TABLE public.custom_job_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_custom_job_suggestions
  ON public.custom_job_suggestions;

CREATE POLICY service_role_all_custom_job_suggestions
  ON public.custom_job_suggestions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
