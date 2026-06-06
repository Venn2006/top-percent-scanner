create table if not exists public.pregenerated_roadmaps (
  id uuid default gen_random_uuid() primary key,
  "roleId" text not null,
  "jobTitle" text not null,
  "seniorityLevel" text not null check ("seniorityLevel" in ('Junior (0-2 năm)', 'Mid (3-5 năm)', 'Senior (5+ năm)')),
  "roadmapContent" jsonb not null,
  "qualityScore" integer not null default 0,
  "topKeywords" text[] not null default '{}'::text[],
  status text not null default 'NEEDS_REVIEW' check (status in ('APPROVED', 'NEEDS_REVIEW')),
  "generatedAt" timestamptz not null default now(),
  "reviewReason" text,
  "suspiciousItems" text[] not null default '{}'::text[]
);

create unique index if not exists idx_pregenerated_roadmaps_role_seniority
on public.pregenerated_roadmaps ("roleId", "seniorityLevel");

create index if not exists idx_pregenerated_roadmaps_status
on public.pregenerated_roadmaps (status);

create index if not exists idx_pregenerated_roadmaps_generated_at
on public.pregenerated_roadmaps ("generatedAt" desc);

alter table public.pregenerated_roadmaps enable row level security;

create policy "service_role_all_pregenerated_roadmaps" on public.pregenerated_roadmaps
  for all to service_role using (true) with check (true);

alter table public.roadmaps
add column if not exists seniority_level text default 'Mid (3-5 năm)'
check (seniority_level in ('Junior (0-2 năm)', 'Mid (3-5 năm)', 'Senior (5+ năm)'));

create index if not exists idx_roadmaps_seniority_level
on public.roadmaps (seniority_level);

