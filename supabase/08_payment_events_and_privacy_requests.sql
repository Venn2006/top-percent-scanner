create table if not exists public.payment_events (
  id uuid default gen_random_uuid() primary key,
  status text not null check (status in ('matched','ignored','amount_too_low','no_match','error','unauthorized')),
  product text check (product in ('premium','roadmap')),
  vspi_id text,
  amount integer,
  payment_ref text,
  content text,
  message text,
  created_at timestamptz default now()
);

create index if not exists idx_payment_events_created_at on public.payment_events (created_at desc);
create index if not exists idx_payment_events_status on public.payment_events (status);
create index if not exists idx_payment_events_vspi_id on public.payment_events (vspi_id);

alter table public.payment_events enable row level security;
drop policy if exists service_role_all_payment_events on public.payment_events;
create policy service_role_all_payment_events on public.payment_events
  for all to service_role using (true) with check (true);

create table if not exists public.data_deletion_requests (
  id uuid default gen_random_uuid() primary key,
  phone text,
  email text,
  vspi_id text,
  note text,
  status text default 'pending' check (status in ('pending','verifying','done','rejected')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create index if not exists idx_data_deletion_requests_status on public.data_deletion_requests (status);
create index if not exists idx_data_deletion_requests_phone on public.data_deletion_requests (phone);
create index if not exists idx_data_deletion_requests_vspi_id on public.data_deletion_requests (vspi_id);

alter table public.data_deletion_requests enable row level security;
drop policy if exists service_role_all_data_deletion_requests on public.data_deletion_requests;
create policy service_role_all_data_deletion_requests on public.data_deletion_requests
  for all to service_role using (true) with check (true);
