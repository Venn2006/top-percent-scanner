alter table public.roadmaps
  add column if not exists payment_ref text;

create unique index if not exists idx_purchases_payment_ref_unique
  on public.purchases (payment_ref)
  where payment_ref is not null;

create unique index if not exists idx_roadmaps_payment_ref_unique
  on public.roadmaps (payment_ref)
  where payment_ref is not null;

create unique index if not exists idx_payment_events_matched_ref_unique
  on public.payment_events (payment_ref)
  where payment_ref is not null and status = 'matched';
