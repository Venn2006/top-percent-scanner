select
  (select count(*) from public.salary_sources) as source_count,
  (select count(*) from public.salary_benchmarks) as benchmark_count,
  (select count(*) from public.job_aliases) as alias_count;

select
  canonical_job_title,
  industry,
  top_50,
  top_20,
  top_10,
  top_5,
  confidence_score
from public.salary_benchmarks
order by confidence_score desc, canonical_job_title asc
limit 10;
