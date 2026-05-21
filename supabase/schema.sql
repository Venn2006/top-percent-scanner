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


-- ── BẢNG salary_data (nếu chưa tồn tại) ────────────────────
-- Giả sử bảng đã có, chỉ thêm index
CREATE INDEX IF NOT EXISTS idx_salary_data_job_title ON salary_data (job_title);


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

-- Index để phân tích data theo nhóm kinh nghiệm
CREATE INDEX IF NOT EXISTS idx_purchases_experience ON purchases (experience);

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
