-- =============================================================================
-- SKYLANE LOGISTICS — DATABASE SCHEMA (PostgreSQL 15+ / Supabase)
-- -----------------------------------------------------------------------------
-- Nguồn sự thật duy nhất cho cấu trúc DB. Drizzle types sinh từ DB bằng
-- `npm run db:pull` (drizzle-kit pull) — KHÔNG sửa tay lib/db/schema sinh ra.
--
-- Quy ước:
--   * Tiền tệ  : NUMERIC(18,2)  (VND làm tròn số nguyên ở tầng app; USD 2 số lẻ)
--   * Cân nặng : NUMERIC(12,3)  (kg)
--   * Kích thước: NUMERIC(10,2) (cm)
--   * Mã (KH, tuyến, NCC, ISO2, vận đơn) luôn TRIM + UPPER — DB chặn bằng CHECK.
--   * Mốc thời gian: TIMESTAMPTZ; ngày nghiệp vụ quy đổi theo Asia/Saigon.
--   * DB chỉ giữ các bất biến toàn vẹn (khóa, CHECK, tổng cộng dồn).
--     Tính cân/giá nằm ở lib/pricing/engine.ts; chuyển trạng thái nằm ở
--     service layer trong transaction.
-- =============================================================================

BEGIN;

SET TIME ZONE 'Asia/Saigon';

-- Supabase khuyến nghị đặt extension trong schema riêng `extensions`
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;  -- EXCLUDE chống chồng lấn phiên bản giá
CREATE EXTENSION IF NOT EXISTS pg_trgm    WITH SCHEMA extensions;  -- tìm kiếm mã vận đơn theo chuỗi con
SET search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 0. ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE order_status AS ENUM ('Phát sinh', 'Đã nhận kho', 'Đã xuất hàng', 'Đã giao hàng', 'Hoàn');
CREATE TYPE debt_status  AS ENUM ('Chưa thanh toán', 'xuất bảng kê', 'Thanh toán 1 phần', 'Đã thanh toán');

CREATE TYPE service_type      AS ENUM ('EPK', 'CPN', 'CT');
CREATE TYPE weight_calc_mode  AS ENUM ('ACTUAL_ONLY', 'MAX_ACTUAL_VOL');
CREATE TYPE price_kind        AS ENUM ('COST', 'SELL');
CREATE TYPE pricing_status    AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
-- MA_TRAN: chỉ ma trận | THEO_KG: chỉ đơn giá/kg | MA_TRAN+THEO_KG: ≤20kg ma trận, >20kg theo kg
CREATE TYPE pricing_mode      AS ENUM ('MA_TRAN', 'THEO_KG', 'MA_TRAN+THEO_KG');
CREATE TYPE user_role         AS ENUM ('ADMIN', 'KE_TOAN', 'SALE', 'KHO');
CREATE TYPE sync_source_type  AS ENUM ('NONE', 'GOOGLE_SHEET', 'API');
CREATE TYPE order_source      AS ENUM ('MANUAL', 'IMPORT', 'SYNC');
CREATE TYPE doc_status        AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE payment_method    AS ENUM ('CHUYEN_KHOAN', 'TIEN_MAT', 'KHAC');

-- -----------------------------------------------------------------------------
-- 1. TRIGGER DÙNG CHUNG
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- -----------------------------------------------------------------------------
-- 2. NGƯỜI DÙNG (id trùng auth.users.id của Supabase)
-- -----------------------------------------------------------------------------
CREATE TABLE app_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'SALE',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_app_users_email CHECK (email = lower(btrim(email)))
);

-- -----------------------------------------------------------------------------
-- 3. DANH MỤC: NHÓM GIÁ, KHÁCH HÀNG, NHÀ CUNG CẤP, TUYẾN
-- -----------------------------------------------------------------------------
CREATE TABLE price_groups (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  note        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_price_groups_code CHECK (code = upper(btrim(code)) AND code <> '')
);

CREATE TABLE customers (
  customer_code     TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  phone             TEXT,
  email             TEXT,
  address           TEXT,
  sale_user_id      UUID REFERENCES app_users(id) ON DELETE SET NULL,      -- Sale phụ trách
  price_group_code  TEXT REFERENCES price_groups(code) ON UPDATE CASCADE,  -- Nhóm giá mặc định
  -- % điều chỉnh trên giá bán tra được (VD: -5.00 = giảm 5%, 10.00 = tăng 10%)
  price_adjust_pct  NUMERIC(6,2) NOT NULL DEFAULT 0,
  currency          CHAR(3) NOT NULL DEFAULT 'VND',
  -- Cấu hình đồng bộ nguồn đơn (VD Google Sheet của khách)
  sync_source_type  sync_source_type NOT NULL DEFAULT 'NONE',
  sync_enabled      BOOLEAN NOT NULL DEFAULT false,
  sync_config       JSONB NOT NULL DEFAULT '{}'::jsonb, -- {spreadsheet_id, sheet, range, column_map, ...}
  last_synced_at    TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_customers_code     CHECK (customer_code = upper(btrim(customer_code)) AND customer_code <> '' AND position('|' IN customer_code) = 0),
  CONSTRAINT ck_customers_adjust   CHECK (price_adjust_pct > -100 AND price_adjust_pct <= 1000),
  CONSTRAINT ck_customers_currency CHECK (currency IN ('VND', 'USD')),
  CONSTRAINT ck_customers_sync     CHECK (sync_source_type <> 'NONE' OR sync_enabled = false)
);
CREATE INDEX ix_customers_sale        ON customers (sale_user_id);
CREATE INDEX ix_customers_price_group ON customers (price_group_code);
CREATE INDEX ix_customers_name_trgm   ON customers USING gin (name gin_trgm_ops);

CREATE TABLE suppliers (
  supplier_code TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  contact       TEXT,
  note          TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_suppliers_code CHECK (supplier_code = upper(btrim(supplier_code)) AND supplier_code <> '')
);

CREATE TABLE routes (
  route_code        TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  supplier_code     TEXT REFERENCES suppliers(supplier_code) ON UPDATE CASCADE,
  service_type      service_type NOT NULL,                       -- quyết định quy tắc làm tròn
  weight_calc_mode  weight_calc_mode NOT NULL DEFAULT 'MAX_ACTUAL_VOL',
  dim_divisor       NUMERIC(10,2) NOT NULL DEFAULT 5000,         -- L*W*H(cm) / DIM
  is_active         BOOLEAN NOT NULL DEFAULT true,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_routes_code CHECK (route_code = upper(btrim(route_code)) AND route_code <> ''),
  CONSTRAINT ck_routes_dim  CHECK (dim_divisor > 0)
);
CREATE INDEX ix_routes_supplier ON routes (supplier_code);

-- -----------------------------------------------------------------------------
-- 4. KHO BẢNG GIÁ — 3 LỚP, LƯU THEO PHIÊN BẢN
--    pricing_versions (phiên bản: tuyến + COST/SELL + phạm vi + hiệu lực)
--      └─ pricing_zones (Vùng giá) ─┬─ pricing_zone_countries (ISO2 → vùng)
--                                   ├─ pricing_matrix_tiers  (Ma trận: giá trọn mốc)
--                                   └─ pricing_per_kg_tiers  (Đơn giá/kg)
--    pricing_mode quyết định dùng lớp nào (mốc 20kg cho MA_TRAN+THEO_KG).
--    Phạm vi SELL: riêng KH (customer_code) > nhóm giá (price_group_code) > chung.
--    COST luôn là bảng giá chung của tuyến (giá NCC).
-- -----------------------------------------------------------------------------
CREATE TABLE pricing_versions (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  route_code        TEXT NOT NULL REFERENCES routes(route_code) ON UPDATE CASCADE,
  price_kind        price_kind NOT NULL,
  customer_code     TEXT REFERENCES customers(customer_code) ON UPDATE CASCADE,
  price_group_code  TEXT REFERENCES price_groups(code) ON UPDATE CASCADE,
  name              TEXT NOT NULL,
  pricing_mode      pricing_mode NOT NULL DEFAULT 'MA_TRAN+THEO_KG',
  currency          CHAR(3) NOT NULL DEFAULT 'VND',
  effective_from    DATE NOT NULL,
  effective_to      DATE,                                   -- NULL = vô thời hạn; bao gồm ngày cuối
  status            pricing_status NOT NULL DEFAULT 'DRAFT',
  note              TEXT,
  created_by        UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_pv_dates    CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT ck_pv_scope    CHECK (customer_code IS NULL OR price_group_code IS NULL),
  CONSTRAINT ck_pv_cost     CHECK (price_kind = 'SELL' OR (customer_code IS NULL AND price_group_code IS NULL)),
  CONSTRAINT ck_pv_currency CHECK (currency IN ('VND', 'USD')),
  -- Tại 1 ngày, mỗi (tuyến, loại, phạm vi) chỉ có tối đa 1 phiên bản ACTIVE.
  -- Tách 2 ràng buộc theo loại để không cần btree_gist hỗ trợ enum (chạy được PG15).
  CONSTRAINT ex_pv_sell_no_overlap EXCLUDE USING gist (
    route_code                       WITH =,
    (COALESCE(customer_code, ''))    WITH =,
    (COALESCE(price_group_code, '')) WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  ) WHERE (status = 'ACTIVE' AND price_kind = 'SELL'),
  CONSTRAINT ex_pv_cost_no_overlap EXCLUDE USING gist (
    route_code WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  ) WHERE (status = 'ACTIVE' AND price_kind = 'COST')
);
-- Tra phiên bản hiệu lực: route + kind + phạm vi, effective_from <= ngày gửi
CREATE INDEX ix_pv_lookup ON pricing_versions
  (route_code, price_kind, customer_code, price_group_code, effective_from DESC)
  INCLUDE (effective_to)
  WHERE status = 'ACTIVE';
CREATE INDEX ix_pv_customer ON pricing_versions (customer_code) WHERE customer_code IS NOT NULL;

CREATE TABLE pricing_zones (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id  BIGINT NOT NULL REFERENCES pricing_versions(id) ON DELETE CASCADE,
  zone_code   TEXT NOT NULL,
  zone_name   TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  CONSTRAINT uq_zones_code    UNIQUE (version_id, zone_code),
  CONSTRAINT uq_zones_id_ver  UNIQUE (id, version_id),     -- cho FK kép bên dưới
  CONSTRAINT ck_zones_code    CHECK (zone_code = upper(btrim(zone_code)) AND zone_code <> '')
);

CREATE TABLE pricing_zone_countries (
  version_id  BIGINT NOT NULL,
  iso2        CHAR(2) NOT NULL,
  zone_id     BIGINT NOT NULL,
  PRIMARY KEY (version_id, iso2),                          -- 1 nước thuộc đúng 1 vùng / phiên bản
  CONSTRAINT fk_zc_zone FOREIGN KEY (zone_id, version_id)
    REFERENCES pricing_zones(id, version_id) ON DELETE CASCADE,
  CONSTRAINT ck_zc_iso2 CHECK (iso2 ~ '^[A-Z]{2}$')
);
CREATE INDEX ix_zc_zone ON pricing_zone_countries (zone_id);

-- Ma trận: giá trọn gói cho mốc cân. Tra: mốc nhỏ nhất có weight_max >= cân tính phí.
CREATE TABLE pricing_matrix_tiers (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zone_id     BIGINT NOT NULL REFERENCES pricing_zones(id) ON DELETE CASCADE,
  weight_max  NUMERIC(12,3) NOT NULL,
  price       NUMERIC(18,2) NOT NULL,
  CONSTRAINT uq_matrix_step  UNIQUE (zone_id, weight_max),   -- đồng thời là index tra cứu
  CONSTRAINT ck_matrix_w     CHECK (weight_max > 0),
  CONSTRAINT ck_matrix_price CHECK (price >= 0)
);

-- Đơn giá/kg: khoảng (weight_min, weight_max], weight_max NULL = trở lên.
-- Thành tiền = cân tính phí × unit_price.
CREATE TABLE pricing_per_kg_tiers (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zone_id     BIGINT NOT NULL REFERENCES pricing_zones(id) ON DELETE CASCADE,
  weight_min  NUMERIC(12,3) NOT NULL,                       -- loại trừ (>)
  weight_max  NUMERIC(12,3),                                -- bao gồm (<=)
  unit_price  NUMERIC(18,2) NOT NULL,
  CONSTRAINT uq_perkg_min   UNIQUE (zone_id, weight_min),   -- đồng thời là index tra cứu
  CONSTRAINT ck_perkg_range CHECK (weight_min >= 0 AND (weight_max IS NULL OR weight_max > weight_min)),
  CONSTRAINT ck_perkg_price CHECK (unit_price >= 0),
  CONSTRAINT ex_perkg_no_overlap EXCLUDE USING gist (
    zone_id WITH =,
    numrange(weight_min, weight_max, '(]') WITH &&
  )
);

-- -----------------------------------------------------------------------------
-- 5. VẬN ĐƠN
-- -----------------------------------------------------------------------------
CREATE TABLE orders (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_code         TEXT NOT NULL REFERENCES customers(customer_code) ON UPDATE CASCADE,
  bill_code             TEXT NOT NULL,
  order_key             TEXT GENERATED ALWAYS AS (customer_code || '|' || bill_code) STORED,
  tracking_number       TEXT,                                -- mã tracking NCC
  source                order_source NOT NULL DEFAULT 'MANUAL',

  -- Hai tuyến độc lập
  route_code            TEXT NOT NULL REFERENCES routes(route_code) ON UPDATE CASCADE, -- báo khách → billed/sell
  assigned_route_code   TEXT NOT NULL REFERENCES routes(route_code) ON UPDATE CASCADE, -- xuất NCC  → shipped/cost
  destination_iso2      CHAR(2) NOT NULL,

  status                order_status NOT NULL DEFAULT 'Phát sinh',
  debt_status           debt_status  NOT NULL DEFAULT 'Chưa thanh toán',

  -- Mốc thời gian
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at           TIMESTAMPTZ,                         -- nhận kho
  shipped_at            TIMESTAMPTZ,                         -- Ngày gửi hàng
  delivered_at          TIMESTAMPTZ,
  -- Ngày tra bảng giá (Asia/Saigon): shipped_at, fallback created_at
  pricing_date          DATE GENERATED ALWAYS AS ((timezone('Asia/Saigon', COALESCE(shipped_at, created_at)))::date) STORED,

  -- Cân nặng (tổng bill)
  package_count         INT NOT NULL DEFAULT 0,
  actual_weight         NUMERIC(12,3) NOT NULL DEFAULT 0,    -- tổng cân thực
  volumetric_weight     NUMERIC(12,3) NOT NULL DEFAULT 0,    -- tổng cân quy đổi (theo route_code)
  billed_weight         NUMERIC(12,3) NOT NULL DEFAULT 0,    -- cân tính phí khách (theo route_code)
  shipped_weight        NUMERIC(12,3) NOT NULL DEFAULT 0,    -- cân xuất NCC (theo assigned_route_code)

  -- Tiền (theo customers.currency)
  sell_amount           NUMERIC(18,2) NOT NULL DEFAULT 0,    -- cước bán
  surcharge_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,    -- phụ phí thu khách
  cost_amount           NUMERIC(18,2) NOT NULL DEFAULT 0,    -- giá vốn NCC
  total_amount          NUMERIC(18,2) GENERATED ALWAYS AS (sell_amount + surcharge_amount) STORED,
  profit                NUMERIC(18,2) GENERATED ALWAYS AS (sell_amount + surcharge_amount - cost_amount) STORED,

  -- Truy vết bảng giá đã áp dụng
  sell_version_id       BIGINT REFERENCES pricing_versions(id) ON DELETE SET NULL,
  cost_version_id       BIGINT REFERENCES pricing_versions(id) ON DELETE SET NULL,

  -- Ghi đè thủ công: engine bỏ qua các trường có trong mảng này khi tính lại
  manual_overrides      TEXT[] NOT NULL DEFAULT '{}',

  -- Khóa giá
  price_locked          BOOLEAN NOT NULL DEFAULT false,
  price_locked_at       TIMESTAMPTZ,
  price_locked_by       UUID REFERENCES app_users(id) ON DELETE SET NULL,

  -- Người gửi / người nhận
  sender_name           TEXT,
  receiver_name         TEXT,
  receiver_phone        TEXT,
  receiver_email        TEXT,
  receiver_address      TEXT,
  receiver_city         TEXT,
  receiver_state        TEXT,
  receiver_postal_code  TEXT,

  -- Hải quan (USD)
  goods_description     TEXT,
  hs_code               TEXT,
  declared_value_usd    NUMERIC(14,2),
  customs_items         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{name, qty, unit_value_usd, hs_code}]

  note                  TEXT,
  internal_note         TEXT,
  row_version           INT NOT NULL DEFAULT 1,              -- khóa lạc quan cho Modal sửa đơn / đa đơn
  created_by            UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by            UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_orders_order_key UNIQUE (order_key),
  CONSTRAINT ck_orders_bill_code CHECK (bill_code = upper(btrim(bill_code)) AND bill_code <> ''),
  CONSTRAINT ck_orders_iso2      CHECK (destination_iso2 ~ '^[A-Z]{2}$'),
  CONSTRAINT ck_orders_weights   CHECK (actual_weight >= 0 AND volumetric_weight >= 0 AND billed_weight >= 0 AND shipped_weight >= 0),
  CONSTRAINT ck_orders_amounts   CHECK (sell_amount >= 0 AND surcharge_amount >= 0 AND cost_amount >= 0),
  CONSTRAINT ck_orders_pkg_count CHECK (package_count >= 0),
  CONSTRAINT ck_orders_customs   CHECK (declared_value_usd IS NULL OR declared_value_usd >= 0),
  CONSTRAINT ck_orders_overrides CHECK (manual_overrides <@ ARRAY['actual_weight','volumetric_weight','billed_weight','shipped_weight','sell_amount','cost_amount']::text[])
);

-- assigned_route_code mặc định = route_code; đơn chuyển sang 'xuất bảng kê' → tự khóa giá
CREATE OR REPLACE FUNCTION trg_orders_before_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.assigned_route_code IS NULL OR btrim(NEW.assigned_route_code) = '' THEN
    NEW.assigned_route_code := NEW.route_code;
  END IF;

  IF NEW.debt_status = 'xuất bảng kê'
     AND (TG_OP = 'INSERT' OR OLD.debt_status IS DISTINCT FROM NEW.debt_status)
     AND NOT NEW.price_locked THEN
    NEW.price_locked    := true;
    NEW.price_locked_at := now();
  END IF;

  IF NOT NEW.price_locked THEN
    NEW.price_locked_at := NULL;
    NEW.price_locked_by := NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at  := now();
    NEW.row_version := OLD.row_version + 1;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER orders_before_write
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION trg_orders_before_write();

-- Index lọc đơn (keyset pagination: ... ORDER BY pricing_date DESC, id DESC)
CREATE INDEX ix_orders_customer_date ON orders (customer_code, pricing_date DESC, id DESC);
CREATE INDEX ix_orders_date          ON orders (pricing_date DESC, id DESC);
CREATE INDEX ix_orders_created       ON orders (created_at DESC);
CREATE INDEX ix_orders_status_date   ON orders (status, pricing_date DESC);
CREATE INDEX ix_orders_route         ON orders (route_code, pricing_date DESC);
CREATE INDEX ix_orders_assigned      ON orders (assigned_route_code, pricing_date DESC);
CREATE INDEX ix_orders_bill_code     ON orders (bill_code);
CREATE INDEX ix_orders_bill_trgm     ON orders USING gin (bill_code gin_trgm_ops);
CREATE INDEX ix_orders_tracking      ON orders (tracking_number) WHERE tracking_number IS NOT NULL;
-- Gom đơn chưa lên bảng kê theo khách
CREATE INDEX ix_orders_unbilled      ON orders (customer_code, pricing_date)
  WHERE debt_status = 'Chưa thanh toán';
-- Công nợ theo khách (ngoài 'Chưa thanh toán')
CREATE INDEX ix_orders_debt          ON orders (customer_code, debt_status)
  WHERE debt_status <> 'Chưa thanh toán';
CREATE INDEX ix_orders_created_by    ON orders (created_by);

-- -----------------------------------------------------------------------------
-- 6. KIỆN HÀNG (1-N với orders)
-- -----------------------------------------------------------------------------
CREATE TABLE order_packages (
  id                         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id                   BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seq                        INT NOT NULL,                     -- kiện thứ mấy
  length_cm                  NUMERIC(10,2) NOT NULL DEFAULT 0,
  width_cm                   NUMERIC(10,2) NOT NULL DEFAULT 0,
  height_cm                  NUMERIC(10,2) NOT NULL DEFAULT 0,
  actual_weight              NUMERIC(12,3) NOT NULL DEFAULT 0, -- cân thực
  -- Theo route_code (khách)
  volumetric_weight          NUMERIC(12,3) NOT NULL DEFAULT 0, -- cân quy đổi = L*W*H/DIM
  chargeable_weight          NUMERIC(12,3) NOT NULL DEFAULT 0, -- cân tính phí (đã làm tròn nếu CPN)
  -- Theo assigned_route_code (NCC) — DIM/mode có thể khác
  shipped_volumetric_weight  NUMERIC(12,3) NOT NULL DEFAULT 0,
  shipped_chargeable_weight  NUMERIC(12,3) NOT NULL DEFAULT 0,
  note                       TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_pkg_seq     UNIQUE (order_id, seq),            -- đồng thời là index theo order_id
  CONSTRAINT ck_pkg_seq     CHECK (seq > 0),
  CONSTRAINT ck_pkg_dims    CHECK (length_cm >= 0 AND width_cm >= 0 AND height_cm >= 0),
  CONSTRAINT ck_pkg_weights CHECK (actual_weight >= 0 AND volumetric_weight >= 0 AND chargeable_weight >= 0
                                   AND shipped_volumetric_weight >= 0 AND shipped_chargeable_weight >= 0)
);
CREATE TRIGGER order_packages_updated_at BEFORE UPDATE ON order_packages
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. BẢNG KÊ & SNAPSHOT ĐƠN
-- -----------------------------------------------------------------------------
CREATE TABLE statements (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  statement_no       TEXT NOT NULL UNIQUE,                    -- SKLddMMyyXXXX, VD: SKL2311260002
  name               TEXT NOT NULL DEFAULT '',                -- "{Tên KH} - {Mã KH} - {Mã bảng kê}"
  customer_code      TEXT NOT NULL REFERENCES customers(customer_code) ON UPDATE CASCADE,
  period_from        DATE,
  period_to          DATE,
  issued_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  currency           CHAR(3) NOT NULL DEFAULT 'VND',
  order_count        INT NOT NULL DEFAULT 0,
  total_weight       NUMERIC(12,3) NOT NULL DEFAULT 0,
  subtotal_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,        -- tổng tiền các đơn
  adjustment_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,        -- giảm trừ (-) / cộng thêm (+)
  total_amount       NUMERIC(18,2) GENERATED ALWAYS AS (subtotal_amount + adjustment_amount) STORED,
  paid_amount        NUMERIC(18,2) NOT NULL DEFAULT 0,        -- trigger cộng dồn từ receipt_allocations
  balance_amount     NUMERIC(18,2) GENERATED ALWAYS AS (subtotal_amount + adjustment_amount - paid_amount) STORED,
  debt_status        debt_status NOT NULL DEFAULT 'xuất bảng kê',
  status             doc_status  NOT NULL DEFAULT 'ACTIVE',
  file_path          TEXT,                                    -- file .xlsx trên Supabase Storage
  note               TEXT,
  created_by         UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at       TIMESTAMPTZ,
  cancelled_by       UUID REFERENCES app_users(id) ON DELETE SET NULL,
  cancel_reason      TEXT,
  CONSTRAINT ck_st_period   CHECK (period_to IS NULL OR period_from IS NULL OR period_to >= period_from),
  CONSTRAINT ck_st_debt     CHECK (debt_status <> 'Chưa thanh toán'),
  CONSTRAINT ck_st_paid     CHECK (paid_amount >= 0 AND paid_amount <= subtotal_amount + adjustment_amount),
  CONSTRAINT ck_st_total    CHECK (subtotal_amount + adjustment_amount >= 0),
  CONSTRAINT ck_st_cancel   CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
  CONSTRAINT ck_st_currency CHECK (currency IN ('VND', 'USD'))
);
CREATE TRIGGER statements_updated_at BEFORE UPDATE ON statements
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE INDEX ix_st_customer_issued ON statements (customer_code, issued_at DESC);
CREATE INDEX ix_st_issued          ON statements (issued_at DESC);
CREATE INDEX ix_st_open_debt       ON statements (customer_code, issued_at)
  WHERE status = 'ACTIVE' AND debt_status <> 'Đã thanh toán';  -- gợi ý khớp tiền

-- Snapshot đơn tại thời điểm xuất bảng kê (không đổi khi đơn gốc sửa sau này)
CREATE TABLE statement_items (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  statement_id      BIGINT NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  order_id          BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  is_active         BOOLEAN NOT NULL DEFAULT true,           -- false khi bảng kê bị hủy
  line_no           INT NOT NULL,
  order_key         TEXT NOT NULL,
  bill_code         TEXT NOT NULL,
  shipped_date      DATE,
  route_code        TEXT NOT NULL,
  destination_iso2  CHAR(2) NOT NULL,
  receiver_name     TEXT,
  package_count     INT NOT NULL DEFAULT 0,
  billed_weight     NUMERIC(12,3) NOT NULL,
  sell_amount       NUMERIC(18,2) NOT NULL,
  surcharge_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(18,2) NOT NULL,
  snapshot          JSONB NOT NULL DEFAULT '{}'::jsonb,       -- kiện, kích thước... để in lại đúng bản cũ
  CONSTRAINT uq_si_line  UNIQUE (statement_id, line_no),
  CONSTRAINT uq_si_order UNIQUE (statement_id, order_id)
);
-- 1 đơn chỉ nằm trong tối đa 1 bảng kê còn hiệu lực
CREATE UNIQUE INDEX uq_si_order_active ON statement_items (order_id) WHERE is_active;
CREATE INDEX ix_si_order ON statement_items (order_id);

-- -----------------------------------------------------------------------------
-- 8. PHIẾU THU & PHÂN BỔ (hỗ trợ "Thu thừa")
-- -----------------------------------------------------------------------------
CREATE TABLE receipts (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_no        TEXT NOT NULL UNIQUE,                     -- SKLTHUddMMyyXXX, VD: SKLTHU251126001
  customer_code     TEXT NOT NULL REFERENCES customers(customer_code) ON UPDATE CASCADE,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  currency          CHAR(3) NOT NULL DEFAULT 'VND',
  amount            NUMERIC(18,2) NOT NULL,
  allocated_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,         -- trigger cộng dồn
  overpaid_amount   NUMERIC(18,2) GENERATED ALWAYS AS (amount - allocated_amount) STORED, -- Thu thừa
  method            payment_method NOT NULL DEFAULT 'CHUYEN_KHOAN',
  received_account  TEXT NOT NULL DEFAULT 'MSB - 3812042003 (HOANG THU THAO)',
  bank_ref          TEXT,                                     -- mã giao dịch / nội dung CK
  payer_name        TEXT,
  proof_images      TEXT[] NOT NULL DEFAULT '{}',             -- đường dẫn ảnh minh chứng (Supabase Storage)
  status            doc_status NOT NULL DEFAULT 'ACTIVE',
  note              TEXT,
  created_by        UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      UUID REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT ck_rc_amount    CHECK (amount > 0),
  CONSTRAINT ck_rc_allocated CHECK (allocated_amount >= 0 AND allocated_amount <= amount),
  CONSTRAINT ck_rc_cancel    CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
  CONSTRAINT ck_rc_cancel_alloc CHECK (status = 'ACTIVE' OR allocated_amount = 0),
  CONSTRAINT ck_rc_currency  CHECK (currency IN ('VND', 'USD'))
);
CREATE TRIGGER receipts_updated_at BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE INDEX ix_rc_customer_date ON receipts (customer_code, received_at DESC);
CREATE INDEX ix_rc_date          ON receipts (received_at DESC);
CREATE INDEX ix_rc_overpaid      ON receipts (customer_code, received_at)
  WHERE status = 'ACTIVE' AND amount > allocated_amount;      -- số dư thu thừa còn dùng được
CREATE INDEX ix_rc_bank_ref      ON receipts (bank_ref) WHERE bank_ref IS NOT NULL;

CREATE TABLE receipt_allocations (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_id    BIGINT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  statement_id  BIGINT NOT NULL REFERENCES statements(id) ON DELETE RESTRICT,
  amount        NUMERIC(18,2) NOT NULL,
  note          TEXT,
  created_by    UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ra_pair   UNIQUE (receipt_id, statement_id),  -- đồng thời là index theo receipt_id
  CONSTRAINT ck_ra_amount CHECK (amount > 0)
);
CREATE INDEX ix_ra_statement ON receipt_allocations (statement_id);

-- Kiểm tra: cùng khách, cùng tiền tệ, phiếu thu & bảng kê còn hiệu lực
CREATE OR REPLACE FUNCTION trg_ra_validate() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  r receipts%ROWTYPE;
  s statements%ROWTYPE;
BEGIN
  SELECT * INTO r FROM receipts   WHERE id = NEW.receipt_id;
  SELECT * INTO s FROM statements WHERE id = NEW.statement_id;
  IF r.customer_code <> s.customer_code THEN
    RAISE EXCEPTION 'Phiếu thu % và bảng kê % không cùng khách hàng', r.receipt_no, s.statement_no
      USING ERRCODE = 'check_violation';
  END IF;
  IF r.currency <> s.currency THEN
    RAISE EXCEPTION 'Phiếu thu % và bảng kê % khác loại tiền', r.receipt_no, s.statement_no
      USING ERRCODE = 'check_violation';
  END IF;
  IF r.status <> 'ACTIVE' OR s.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Không thể phân bổ cho phiếu thu/bảng kê đã hủy'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER receipt_allocations_validate
  BEFORE INSERT OR UPDATE ON receipt_allocations
  FOR EACH ROW EXECUTE FUNCTION trg_ra_validate();

-- Cộng dồn receipts.allocated_amount & statements.paid_amount (CHECK chặn phân bổ vượt)
CREATE OR REPLACE FUNCTION trg_ra_sync_totals() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  rid BIGINT;
  sid BIGINT;
BEGIN
  FOR rid IN SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.receipt_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.receipt_id END]) AS x WHERE x IS NOT NULL
  LOOP
    UPDATE receipts SET allocated_amount =
      COALESCE((SELECT sum(amount) FROM receipt_allocations WHERE receipt_id = rid), 0)
    WHERE id = rid;
  END LOOP;

  FOR sid IN SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.statement_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.statement_id END]) AS x WHERE x IS NOT NULL
  LOOP
    UPDATE statements SET paid_amount =
      COALESCE((SELECT sum(amount) FROM receipt_allocations WHERE statement_id = sid), 0)
    WHERE id = sid;
  END LOOP;
  RETURN NULL;
END $$;

CREATE TRIGGER receipt_allocations_sync_totals
  AFTER INSERT OR UPDATE OR DELETE ON receipt_allocations
  FOR EACH ROW EXECUTE FUNCTION trg_ra_sync_totals();

-- Bộ đếm số chứng từ theo ngày (cấp số trong transaction: INSERT ... ON CONFLICT DO UPDATE RETURNING)
CREATE TABLE doc_counters (
  prefix   TEXT NOT NULL,
  day      DATE NOT NULL,
  last_no  INT  NOT NULL,
  PRIMARY KEY (prefix, day)
);

-- -----------------------------------------------------------------------------
-- 9. NHẬT KÝ THAO TÁC (mở khóa giá, ghi đè thủ công, hủy bảng kê...)
-- -----------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type  TEXT NOT NULL,                     -- 'order' | 'statement' | 'receipt' | 'pricing_version' ...
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL,                     -- 'UNLOCK_PRICE' | 'OVERRIDE' | 'BULK_EDIT' | 'CANCEL' ...
  changes      JSONB NOT NULL DEFAULT '{}'::jsonb, -- {field: [old, new]}
  actor_id     UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_entity ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX ix_audit_actor  ON audit_logs (actor_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 10. updated_at cho các bảng danh mục
-- -----------------------------------------------------------------------------
CREATE TRIGGER app_users_updated_at        BEFORE UPDATE ON app_users        FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER price_groups_updated_at     BEFORE UPDATE ON price_groups     FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER customers_updated_at        BEFORE UPDATE ON customers        FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER suppliers_updated_at        BEFORE UPDATE ON suppliers        FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER routes_updated_at           BEFORE UPDATE ON routes           FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER pricing_versions_updated_at BEFORE UPDATE ON pricing_versions FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- -----------------------------------------------------------------------------
-- 11. BẢO MẬT SUPABASE
-- App truy cập DB qua kết nối Postgres phía server (Drizzle) — vai trò owner
-- bỏ qua RLS. Bật RLS không kèm policy để chặn truy cập trực tiếp qua
-- PostgREST bằng anon/authenticated key.
-- -----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- THAM KHẢO: truy vấn tra giá (engine.ts sẽ dùng)
-- -----------------------------------------------------------------------------
-- 1) Phiên bản hiệu lực (SELL, ưu tiên KH > nhóm giá > chung):
--   SELECT id FROM pricing_versions
--   WHERE route_code = $route AND price_kind = 'SELL' AND status = 'ACTIVE'
--     AND effective_from <= $date AND (effective_to IS NULL OR effective_to >= $date)
--     AND (customer_code = $cust OR price_group_code = $group
--          OR (customer_code IS NULL AND price_group_code IS NULL))
--   ORDER BY (customer_code IS NOT NULL) DESC, (price_group_code IS NOT NULL) DESC
--   LIMIT 1;
-- 2) Vùng:   SELECT zone_id FROM pricing_zone_countries WHERE version_id = $v AND iso2 = $iso2;
-- 3a) ≤20kg: SELECT price FROM pricing_matrix_tiers
--            WHERE zone_id = $z AND weight_max >= $w ORDER BY weight_max LIMIT 1;
-- 3b) >20kg: SELECT unit_price FROM pricing_per_kg_tiers
--            WHERE zone_id = $z AND weight_min < $w AND (weight_max IS NULL OR weight_max >= $w)
--            ORDER BY weight_min DESC LIMIT 1;
-- =============================================================================
