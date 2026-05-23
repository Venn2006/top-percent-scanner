alter table public.purchases
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists referrer text;

alter table public.scan_history
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists referrer text;

alter table public.roadmaps
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists referrer text;

create index if not exists idx_purchases_utm_source on public.purchases (utm_source);
create index if not exists idx_scan_history_utm_source on public.scan_history (utm_source);
create index if not exists idx_roadmaps_utm_source on public.roadmaps (utm_source);
