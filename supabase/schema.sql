-- ============================================================
-- VSPI Scanner — Supabase Schema & Security Setup
-- Chạy toàn bộ file này trong Supabase SQL Editor
-- ============================================================


-- ── BẢNG purchases ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  vspi_id     text        NOT NULL UNIQUE,
  email       text,
  phone       text,
  job_title   text,
  percent     integer,
  amount      integer     DEFAULT 29000,   -- đã sửa từ 49000 → 29000
  status      text        DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'delivered')),
  payment_ref text,
  created_at  timestamptz DEFAULT now(),
  paid_at     timestamptz
);

-- Index để webhook lookup nhanh
CREATE INDEX IF NOT EXISTS idx_purchases_vspi_id ON purchases (vspi_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status  ON purchases (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_payment_ref_unique
  ON purchases (payment_ref)
  WHERE payment_ref IS NOT NULL;


-- ── BẢNG salary_data (nếu chưa tồn tại) ────────────────────
-- Giả sử bảng đã có, chỉ thêm index
CREATE INDEX IF NOT EXISTS idx_salary_data_job_title ON salary_data (job_title);

-- ============================================================
-- SALARY INTELLIGENCE LAYER
-- Hợp nhất nhiều nguồn benchmark thay vì chỉ lưu 1 dòng/job.
-- ============================================================

CREATE TABLE IF NOT EXISTS salary_sources (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  source_name   text        NOT NULL UNIQUE,
  source_url    text,
  source_year   integer,
  source_tier   text        NOT NULL DEFAULT 'B'
                            CHECK (source_tier IN ('A','B','C','D')),
  methodology   text,
  license_note  text,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salary_benchmarks (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  canonical_job_title text        NOT NULL,
  industry            text,
  function_group      text,
  level               text,
  location            text        DEFAULT 'Vietnam',
  company_type        text,
  currency            text        NOT NULL DEFAULT 'VND',
  salary_min          integer,
  salary_median       integer,
  salary_avg          integer,
  salary_max          integer,
  top_50              integer,
  top_40              integer,
  top_30              integer,
  top_20              integer,
  top_10              integer,
  top_5               integer,
  source_id           uuid        REFERENCES salary_sources(id) ON DELETE SET NULL,
  sample_size         integer,
  confidence_score    integer     DEFAULT 50 CHECK (confidence_score BETWEEN 0 AND 100),
  notes               text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_benchmarks_job ON salary_benchmarks (canonical_job_title);
CREATE INDEX IF NOT EXISTS idx_salary_benchmarks_industry ON salary_benchmarks (industry);
CREATE INDEX IF NOT EXISTS idx_salary_benchmarks_confidence ON salary_benchmarks (confidence_score DESC);

CREATE TABLE IF NOT EXISTS job_aliases (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  alias_title          text        NOT NULL,
  canonical_job_title  text        NOT NULL,
  match_type           text        NOT NULL DEFAULT 'alias'
                                      CHECK (match_type IN ('exact','alias','similar_role','industry_estimate','special_income_model')),
  confidence_score     integer     DEFAULT 70 CHECK (confidence_score BETWEEN 0 AND 100),
  created_at           timestamptz DEFAULT now(),
  UNIQUE(alias_title, canonical_job_title)
);

CREATE INDEX IF NOT EXISTS idx_job_aliases_alias ON job_aliases (alias_title);
CREATE INDEX IF NOT EXISTS idx_job_aliases_canonical ON job_aliases (canonical_job_title);

ALTER TABLE salary_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salary_sources_public_read" ON salary_sources;
DROP POLICY IF EXISTS "salary_benchmarks_public_read" ON salary_benchmarks;
DROP POLICY IF EXISTS "job_aliases_public_read" ON job_aliases;

CREATE POLICY "salary_sources_public_read"
  ON salary_sources
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "salary_benchmarks_public_read"
  ON salary_benchmarks
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "job_aliases_public_read"
  ON job_aliases
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO salary_sources (source_name, source_url, source_year, source_tier, methodology, license_note)
VALUES
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
ON CONFLICT (source_name) DO UPDATE SET
  source_url = EXCLUDED.source_url,
  source_year = EXCLUDED.source_year,
  source_tier = EXCLUDED.source_tier,
  methodology = EXCLUDED.methodology,
  license_note = EXCLUDED.license_note;

-- Seed benchmark layer from existing salary_data so the new engine has immediate coverage.
INSERT INTO salary_benchmarks (
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
SELECT
  sd.job_title,
  sd.industry,
  'Vietnam',
  'VND',
  sd.top_50,
  sd.top_20,
  sd.top_10,
  sd.top_5,
  src.id,
  CASE
    WHEN sd.top_10 IS NOT NULL AND sd.top_5 IS NOT NULL THEN 78
    WHEN sd.top_20 IS NOT NULL THEN 68
    ELSE 56
  END,
  'Migrated from legacy salary_data table'
FROM salary_data sd
CROSS JOIN (
  SELECT id FROM salary_sources WHERE source_name = 'VSPI Legacy Salary Data' LIMIT 1
) src
WHERE NOT EXISTS (
  SELECT 1
  FROM salary_benchmarks sb
  WHERE sb.canonical_job_title = sd.job_title
    AND sb.source_id = src.id
);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- ── purchases: KHÓA HOÀN TOÀN với anon/authenticated ────────
-- Service role (server) bypass RLS tự động → không cần policy
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Không tạo policy nào = deny all cho anon và authenticated roles.
-- Chỉ service_role key (dùng trong API routes) mới có quyền đọc/ghi.

-- Xóa policy cũ nếu có (chạy an toàn dù không tồn tại)
DROP POLICY IF EXISTS "purchases_anon_read"   ON purchases;
DROP POLICY IF EXISTS "purchases_anon_insert" ON purchases;
DROP POLICY IF EXISTS "purchases_anon_update" ON purchases;


-- ── salary_data: CHỈ CHO PHÉP SELECT ẩn danh ────────────────
ALTER TABLE salary_data ENABLE ROW LEVEL SECURITY;

-- Xóa policy cũ nếu có
DROP POLICY IF EXISTS "salary_data_public_read"   ON salary_data;
DROP POLICY IF EXISTS "salary_data_anon_insert"   ON salary_data;
DROP POLICY IF EXISTS "salary_data_anon_update"   ON salary_data;
DROP POLICY IF EXISTS "salary_data_anon_delete"   ON salary_data;

-- Cho phép SELECT ẩn danh (anon key từ browser)
CREATE POLICY "salary_data_public_read"
  ON salary_data
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Chặn INSERT/UPDATE/DELETE từ mọi role ngoài service_role
-- (không tạo policy = deny by default khi RLS đã bật)


-- ============================================================
-- VERIFY: Kiểm tra RLS đã bật đúng chưa
-- Chạy 2 query này để xác nhận:
-- ============================================================

-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname IN ('purchases', 'salary_data');
-- Kết quả mong đợi: relrowsecurity = true cho cả 2 bảng

-- SELECT schemaname, tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE tablename IN ('purchases', 'salary_data');
-- Kết quả mong đợi:
--   salary_data | salary_data_public_read | {anon,authenticated} | SELECT
--   purchases   | (không có dòng nào)


-- ============================================================
-- MIGRATION: Thêm cột experience vào bảng purchases
-- Chạy câu lệnh này nếu bảng purchases đã tồn tại trước đó
-- ============================================================

-- Thêm cột experience (junior | mid | senior) — nullable để tương thích ngược
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS experience text
    CHECK (experience IN ('junior', 'mid', 'senior'));

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS current_salary integer;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS market_location text;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS work_province text;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS referrer text;

-- Index để phân tích data theo nhóm kinh nghiệm
CREATE INDEX IF NOT EXISTS idx_purchases_experience ON purchases (experience);
CREATE INDEX IF NOT EXISTS idx_purchases_current_salary ON purchases (current_salary);
CREATE INDEX IF NOT EXISTS idx_purchases_market_location ON purchases (market_location);
CREATE INDEX IF NOT EXISTS idx_purchases_work_province ON purchases (work_province);
CREATE INDEX IF NOT EXISTS idx_purchases_utm_source ON purchases (utm_source);

-- Ví dụ query phân tích sau này:
-- SELECT experience, COUNT(*), AVG(percent) FROM purchases
-- WHERE status = 'paid' GROUP BY experience;


-- ============================================================
-- BẢNG compare_groups — "So sánh ẩn danh với nhóm bạn"
-- ============================================================
CREATE TABLE IF NOT EXISTS compare_groups (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id   text        NOT NULL UNIQUE,   -- 6 ký tự, dễ share
  members    jsonb       DEFAULT '[]'::jsonb, -- array of { job_title, percent, joined_at }
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL            -- hết hạn sau 7 ngày
);

CREATE INDEX IF NOT EXISTS idx_compare_groups_group_id ON compare_groups (group_id);

-- RLS: deny all anon (service role bypass)
ALTER TABLE compare_groups ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- BẢNG scan_history — Lưu lịch sử quét lương, tracking tiến độ
-- ============================================================
CREATE TABLE IF NOT EXISTS scan_history (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone       text,              -- SĐT để nhận diện user (không cần auth)
  job_title   text        NOT NULL,
  salary      integer     NOT NULL,
  percent     integer     NOT NULL,
  experience  text,
  market_location text,
  work_province text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  scanned_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_history_phone ON scan_history (phone);
CREATE INDEX IF NOT EXISTS idx_scan_history_scanned_at ON scan_history (scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_history_market_location ON scan_history (market_location);
CREATE INDEX IF NOT EXISTS idx_scan_history_work_province ON scan_history (work_province);
CREATE INDEX IF NOT EXISTS idx_scan_history_utm_source ON scan_history (utm_source);

-- RLS: deny all anon (service role bypass)
ALTER TABLE scan_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_scan" ON scan_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- BẢNG zalo_subscribers — Nhận cảnh báo dữ liệu lương mới
-- ============================================================
CREATE TABLE IF NOT EXISTS zalo_subscribers (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone       text        NOT NULL,
  job         text,
  city        text,
  percentile  integer,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zalo_subscribers_phone ON zalo_subscribers (phone);
CREATE INDEX IF NOT EXISTS idx_zalo_subscribers_created_at ON zalo_subscribers (created_at DESC);

-- RLS: deny all anon (service role bypass)
ALTER TABLE zalo_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_zalo_subscribers" ON zalo_subscribers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- BẢNG custom_job_suggestions — Job nhập tay chờ owner duyệt
-- Không dùng bảng này để tính benchmark tự động.
-- Owner xem nhu cầu thật rồi mới quyết định thêm vào salary_data/
-- salary_benchmarks bằng quy trình duyệt riêng.
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_job_suggestions (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  job_title   text        NOT NULL,
  salary      integer     NOT NULL,
  percent     integer,
  experience  text,
  market_location text,
  work_province text,
  match_type  text,
  has_direct_data boolean DEFAULT false,
  status      text        DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  note        text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_job_suggestions_status ON custom_job_suggestions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_job_suggestions_job ON custom_job_suggestions (job_title);

ALTER TABLE custom_job_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_custom_job_suggestions" ON custom_job_suggestions
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- BẢNG roadmaps — Lộ trình 79k cá nhân hóa
-- ============================================================
CREATE TABLE IF NOT EXISTS roadmaps (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  vspi_id       text        NOT NULL UNIQUE,  -- link với purchases
  phone         text,
  job_title     text        NOT NULL,
  current_salary integer    NOT NULL,
  target_salary  integer    NOT NULL,
  duration_months integer   NOT NULL DEFAULT 3,
  goal_label    text,                          -- "Tăng 3 triệu trong 3 tháng"
  roadmap_json  jsonb,                         -- lộ trình AI generate
  payment_ref   text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  referrer      text,
  task_progress jsonb       DEFAULT '{}'::jsonb, -- { "week1_task0": true, ... }
  status        text        DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  created_at    timestamptz DEFAULT now(),
  paid_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_roadmaps_vspi_id ON roadmaps (vspi_id);
CREATE INDEX IF NOT EXISTS idx_roadmaps_phone   ON roadmaps (phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roadmaps_payment_ref_unique
  ON roadmaps (payment_ref)
  WHERE payment_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roadmaps_utm_source ON roadmaps (utm_source);

ALTER TABLE roadmaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_roadmaps" ON roadmaps
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- BẢNG payment_events — log webhook/alert thanh toán
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_events (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  status      text        NOT NULL CHECK (status IN ('matched','ignored','amount_too_low','no_match','error','unauthorized')),
  product     text        CHECK (product IN ('premium','roadmap')),
  vspi_id     text,
  amount      integer,
  payment_ref text,
  content     text,
  message     text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_events_created_at ON payment_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_status ON payment_events (status);
CREATE INDEX IF NOT EXISTS idx_payment_events_vspi_id ON payment_events (vspi_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_matched_ref_unique
  ON payment_events (payment_ref)
  WHERE payment_ref IS NOT NULL AND status = 'matched';

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_payment_events" ON payment_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- BẢNG data_deletion_requests — yêu cầu xóa dữ liệu cá nhân
-- ============================================================
CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  phone       text,
  email       text,
  vspi_id     text,
  note        text,
  status      text        DEFAULT 'pending' CHECK (status IN ('pending','verifying','done','rejected')),
  created_at  timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_status ON data_deletion_requests (status);
CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_phone ON data_deletion_requests (phone);
CREATE INDEX IF NOT EXISTS idx_data_deletion_requests_vspi_id ON data_deletion_requests (vspi_id);

ALTER TABLE data_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_data_deletion_requests" ON data_deletion_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
