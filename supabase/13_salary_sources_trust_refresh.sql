insert into public.salary_sources
  (source_name, source_url, source_year, source_tier, methodology, license_note)
values
  ('NSO/GSO Labour Force Survey', 'https://www.nso.gov.vn/en/data-and-statistics/2025/12/press-release-social-economic-situation-in-the-3rd-quarter-and-the-9-months-of-2025/', 2025, 'A', 'Official labour-force and earnings statistics used for macro validation, not as direct role-level salary tables.', 'Public statistics; cite NSO/GSO and do not imply direct percentile microdata access.'),
  ('Vietnam Minimum Wage Zones', 'https://vanban.chinhphu.vn/', 2026, 'A', 'Legal wage floor guardrail for low-income and frontline roles by region.', 'Public legal document; cite the Government legal document portal.'),
  ('Adecco Vietnam Salary Guide 2026', 'https://www.adecco.com/en-vn/salary-guide', 2026, 'A', 'Recruitment salary guide used as role/function benchmark reference.', 'Cite source; do not republish proprietary salary tables without permission.'),
  ('ManpowerGroup Vietnam Salary Guide 2025', 'https://www.manpower.com.vn/en/insights/blogs/2024/12/manpowergroup-vietnam-releases-salary-guide-2025', 2025, 'A', 'Recruitment salary guide used for cross-industry salary band validation.', 'Cite ManpowerGroup Vietnam Salary Guide 2025.'),
  ('Talentnet-Mercer Vietnam Total Remuneration Survey 2025', 'https://www.talentnetgroup.com/vn/vi/phan-tich-chuyen-sau/rewards-vi/bao-cao-luong-thi-truong-lao-dong-viet-nam-2025', 2025, 'A', 'Total remuneration reference for large-company and leadership compensation sanity checks.', 'Cite Talentnet-Mercer; avoid copying proprietary report tables.'),
  ('ITviec Vietnam IT Salary Report', 'https://itviec.com/report/vietnam-it-salary-and-recruitment-market', 2025, 'A', 'IT salary report used only for technology roles and tech hiring signals.', 'Cite ITviec report; do not generalize IT data to non-IT jobs.'),
  ('CareerViet VietnamSalary', 'https://vietnamsalary.careerviet.vn/', 2026, 'A', 'Public salary lookup used as job-posting market signal.', 'Reference only; respect CareerViet terms.'),
  ('TopCV Salary Tool and Market Reports', 'https://www.topcv.vn/cong-cu-tra-cuu-muc-luong', 2026, 'A', 'Job-market signal used for demand and public salary lookup cross-checking.', 'Reference only; respect TopCV terms.'),
  ('VietnamWorks/Navigos Salary and Talent Signals', 'https://www.vietnamworks.com/', 2026, 'B', 'Recruitment ecosystem signal used for hiring demand and salary sanity checks.', 'Reference only; cite source and do not imply official endorsement.'),
  ('Reeracoen Vietnam Salary Guide 2025/2026', 'https://www.reeracoen.com.vn/en/events/vietnam-salary-guide-2025-2026', 2026, 'B', 'Recruitment salary guide used for FDI/Japan-facing and cross-functional benchmarks.', 'Cite Reeracoen; do not republish proprietary tables.'),
  ('PERSOLKELLY Vietnam Salary Guide', 'https://www.persolkelly.com.vn/', 2025, 'B', 'Recruitment consultant salary guide used for professional and specialist roles.', 'Cite PERSOLKELLY; verify current report page before public citation.'),
  ('Michael Page Vietnam Salary Benchmark', 'https://www.michaelpage.com.vn/salary-guide', 2026, 'B', 'Recruitment salary benchmark used for white-collar and management roles.', 'Cite Michael Page; do not copy proprietary benchmark tables.'),
  ('Robert Walters Vietnam Salary Survey', 'https://www.robertwalters.com.vn/our-services/salary-survey.html', 2026, 'B', 'Recruitment salary survey used for professional, finance, legal, sales, tech and leadership checks.', 'Cite Robert Walters; do not republish proprietary salary tables.'),
  ('ILOSTAT and World Bank Labour Macrodata', 'https://ilostat.ilo.org/data/', 2026, 'C', 'Macro labour data used for context and sanity checks only, not direct salary percentile calculation.', 'Public/open data; cite ILOSTAT or World Bank where used.'),
  ('VSPI Legacy Salary Data', 'https://topluong.com', 2026, 'B', 'Existing VSPI salary_data table migrated into the multi-source benchmark layer.', 'Internal benchmark seed; replace and augment with stronger salary guide rows over time.')
on conflict (source_name) do update set
  source_url = excluded.source_url,
  source_year = excluded.source_year,
  source_tier = excluded.source_tier,
  methodology = excluded.methodology,
  license_note = excluded.license_note;

select count(*) as source_count from public.salary_sources;
