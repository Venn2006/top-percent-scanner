-- Zalo alert subscribers for salary data update notifications.
CREATE TABLE IF NOT EXISTS public.zalo_subscribers (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone       text        NOT NULL,
  job         text,
  city        text,
  percentile  integer,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zalo_subscribers_phone
  ON public.zalo_subscribers (phone);

CREATE INDEX IF NOT EXISTS idx_zalo_subscribers_created_at
  ON public.zalo_subscribers (created_at DESC);

ALTER TABLE public.zalo_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_zalo_subscribers" ON public.zalo_subscribers
  FOR ALL TO service_role USING (true) WITH CHECK (true);
