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
  (select count(*) from public.salary_data) as legacy_salary_data_count,
  (select count(*) from public.salary_benchmarks) as benchmark_count;
