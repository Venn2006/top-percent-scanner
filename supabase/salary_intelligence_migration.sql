-- VSPI salary intelligence migration
-- Run this file by itself in Supabase SQL Editor.

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

create index if not exists idx_salary_benchmarks_job
  on public.salary_benchmarks (canonical_job_title);

create index if not exists idx_salary_benchmarks_industry
  on public.salary_benchmarks (industry);

create index if not exists idx_salary_benchmarks_confidence
  on public.salary_benchmarks (confidence_score desc);

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

insert into public.salary_sources
  (source_name, source_url, source_year, source_tier, methodology, license_note)
values
  ('Adecco Vietnam Salary Guide 2026', 'https://www.adecco.com/en-vn/salary-guide', 2026, 'A', 'Salary guide for 1,000+ positions across major Vietnam sectors.', 'Cite source; do not republish proprietary tables without permission.'),
  ('ManpowerGroup Vietnam Salary Guide 2025', 'https://www.manpower.com.vn/en/insights/blogs/2024/12/manpowergroup-vietnam-releases-salary-guide-2025', 2025, 'A', '700+ roles across 12 industry verticals; gross monthly wages in USD.', 'Cite ManpowerGroup Vietnam Salary Guide 2025.'),
  ('CareerViet VietnamSalary', 'https://vietnamsalary.careerviet.vn/', 2026, 'A', 'Salary references aggregated from CareerViet job postings by title, experience, and location.', 'Reference only; respect CareerViet terms.'),
  ('TopCV Salary Tool', 'https://www.topcv.vn/cong-cu-tra-cuu-muc-luong', 2026, 'A', 'Salary lookup from TopCV job posting database, updated periodically by title, experience, and region.', 'Reference only; respect TopCV terms.'),
  ('VietnamWorks/Navigos', 'https://www.vietnamworks.com/', 2026, 'B', 'Salary insights from VietnamWorks/Navigos recruitment ecosystem.', 'Reference only; cite source.'),
  ('ITviec Salary Report', 'https://itviec.com/report/vietnam-it-salary-and-recruitment-market', 2025, 'A', 'IT salary reports based on surveyed IT professionals and role-level breakdowns.', 'Cite ITviec report.'),
  ('JobOKO Job Market Report 2025', 'https://vn.joboko.com/', 2025, 'B', 'Market report using job posting analysis and HR/candidate surveys.', 'Cite JobOKO report.'),
  ('Reeracoen Vietnam Salary Guide 2025/2026', 'https://www.reeracoen.com.vn/en/events/vietnam-salary-guide-2025-2026', 2026, 'B', 'Salary guide based on verified recruitment data across industries and job categories.', 'Cite Reeracoen.'),
  ('PERSOLKELLY Vietnam Salary Guide 2025', 'https://www.persolkelly.com.vn/', 2025, 'B', 'Recruitment consultant and placement-data salary guide across major functions.', 'Cite PERSOLKELLY.'),
  ('NSO/GSO Labour Force Survey', 'https://www.nso.gov.vn/en/data-and-statistics/2026/05/report-on-labour-force-survey-2024/', 2024, 'A', 'National labour force and earnings statistics used for macro sanity checks.', 'Public statistics; cite NSO/GSO.'),
  ('VSPI Legacy Salary Data', 'https://topluong.com', 2026, 'B', 'Existing VSPI salary_data table migrated into the multi-source benchmark layer.', 'Internal benchmark seed; replace/augment with stronger salary guide rows over time.')
on conflict (source_name) do update set
  source_url = excluded.source_url,
  source_year = excluded.source_year,
  source_tier = excluded.source_tier,
  methodology = excluded.methodology,
  license_note = excluded.license_note;

insert into public.salary_benchmarks (
  canonical_job_title,
  industry,
  location,
  currency,
  top_50,
  top_20,
  top_10,
  top_5,
  source_id,
  confidence_score,
  notes
)
select
  sd.job_title,
  sd.industry,
  'Vietnam',
  'VND',
  sd.top_50,
  sd.top_20,
  sd.top_10,
  sd.top_5,
  src.id,
  case
    when sd.top_10 is not null and sd.top_5 is not null then 78
    when sd.top_20 is not null then 68
    else 56
  end,
  'Migrated from legacy salary_data table'
from public.salary_data sd
cross join (
  select id
  from public.salary_sources
  where source_name = 'VSPI Legacy Salary Data'
  limit 1
) src
where not exists (
  select 1
  from public.salary_benchmarks sb
  where sb.canonical_job_title = sd.job_title
    and sb.source_id = src.id
);

select
  (select count(*) from public.salary_sources) as source_count,
  (select count(*) from public.salary_benchmarks) as benchmark_count,
  (select count(*) from public.job_aliases) as alias_count;
