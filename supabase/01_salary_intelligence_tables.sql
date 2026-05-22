create table if not exists public.salary_sources (
  id uuid default gen_random_uuid() primary key,
  source_name text not null unique,
  source_url text,
  source_year integer,
  source_tier text not null default 'B'
    check (source_tier in ('A', 'B', 'C', 'D')),
  methodology text,
  license_note text,
  created_at timestamptz default now()
);

create table if not exists public.salary_benchmarks (
  id uuid default gen_random_uuid() primary key,
  canonical_job_title text not null,
  industry text,
  function_group text,
  level text,
  location text default 'Vietnam',
  company_type text,
  currency text not null default 'VND',
  salary_min integer,
  salary_median integer,
  salary_avg integer,
  salary_max integer,
  top_50 integer,
  top_40 integer,
  top_30 integer,
  top_20 integer,
  top_10 integer,
  top_5 integer,
  source_id uuid references public.salary_sources(id) on delete set null,
  sample_size integer,
  confidence_score integer default 50 check (confidence_score between 0 and 100),
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.job_aliases (
  id uuid default gen_random_uuid() primary key,
  alias_title text not null,
  canonical_job_title text not null,
  match_type text not null default 'alias'
    check (match_type in ('exact', 'alias', 'similar_role', 'industry_estimate', 'special_income_model')),
  confidence_score integer default 70 check (confidence_score between 0 and 100),
  created_at timestamptz default now(),
  unique (alias_title, canonical_job_title)
);

create index if not exists idx_salary_benchmarks_job
  on public.salary_benchmarks (canonical_job_title);

create index if not exists idx_salary_benchmarks_industry
  on public.salary_benchmarks (industry);

create index if not exists idx_salary_benchmarks_confidence
  on public.salary_benchmarks (confidence_score desc);

create index if not exists idx_job_aliases_alias
  on public.job_aliases (alias_title);

create index if not exists idx_job_aliases_canonical
  on public.job_aliases (canonical_job_title);

alter table public.salary_sources enable row level security;
alter table public.salary_benchmarks enable row level security;
alter table public.job_aliases enable row level security;

drop policy if exists salary_sources_public_read on public.salary_sources;
drop policy if exists salary_benchmarks_public_read on public.salary_benchmarks;
drop policy if exists job_aliases_public_read on public.job_aliases;

create policy salary_sources_public_read
  on public.salary_sources
  for select
  to anon, authenticated
  using (true);

create policy salary_benchmarks_public_read
  on public.salary_benchmarks
  for select
  to anon, authenticated
  using (true);

create policy job_aliases_public_read
  on public.job_aliases
  for select
  to anon, authenticated
  using (true);

select
  (select count(*) from public.salary_sources) as source_count,
  (select count(*) from public.salary_benchmarks) as benchmark_count,
  (select count(*) from public.job_aliases) as alias_count;
