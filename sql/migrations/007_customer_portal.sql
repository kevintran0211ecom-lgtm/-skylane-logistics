-- =============================================================================
-- 007 — CỔNG KHÁCH HÀNG (giai đoạn 1)
--  * customer_accounts: tài khoản đăng nhập của khách (id = auth.users.id), gắn 1 mã khách.
--    Nhiều email có thể cùng 1 mã khách; không phân quyền bên trong tài khoản khách.
--    SkyLane tạo tài khoản với mật khẩu mặc định → must_change_password = true,
--    khách phải đổi mật khẩu ở lần đăng nhập đầu.
--  * Đơn khách đặt trên cổng vào Đơn hàng dự báo với nguồn 'PORTAL'.
-- Chỉ THÊM, không đổi dữ liệu cũ → an toàn khi code cũ vẫn đang chạy.
-- =============================================================================

-- ADD VALUE không dùng được giá trị mới trong cùng transaction → để riêng, trước BEGIN
ALTER TYPE order_source ADD VALUE IF NOT EXISTS 'PORTAL';

BEGIN;

CREATE TABLE IF NOT EXISTS customer_accounts (
  id                    UUID PRIMARY KEY,               -- = auth.users.id
  customer_code         TEXT NOT NULL REFERENCES customers(customer_code) ON UPDATE CASCADE,
  email                 TEXT NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  must_change_password  BOOLEAN NOT NULL DEFAULT true,
  last_login_at         TIMESTAMPTZ,
  created_by            UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_customer_accounts_email UNIQUE (email),
  CONSTRAINT ck_customer_accounts_email CHECK (email = lower(btrim(email)) AND email LIKE '%@%')
);
DROP TRIGGER IF EXISTS customer_accounts_updated_at ON customer_accounts;
CREATE TRIGGER customer_accounts_updated_at BEFORE UPDATE ON customer_accounts
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE INDEX IF NOT EXISTS ix_customer_accounts_customer ON customer_accounts (customer_code);
ALTER TABLE customer_accounts ENABLE ROW LEVEL SECURITY;

-- Đơn hàng dự báo: tài khoản khách đã đặt đơn (đơn nội bộ dùng created_by)
ALTER TABLE order_drafts
  ADD COLUMN IF NOT EXISTS created_by_account UUID REFERENCES customer_accounts(id) ON DELETE SET NULL;

COMMIT;
