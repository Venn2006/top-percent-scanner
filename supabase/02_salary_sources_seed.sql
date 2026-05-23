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

select count(*) as source_count from public.salary_sources;
