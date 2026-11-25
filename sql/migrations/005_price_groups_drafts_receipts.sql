-- =============================================================================
-- 005 — Nhóm giá theo %, Đơn hàng dự báo, Hủy/sửa phiếu thu, Hủy bảng kê mở khóa giá
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Nhóm giá: % so với bảng giá chung (áp khi nhóm không có bảng giá riêng cho tuyến)
-- -----------------------------------------------------------------------------
ALTER TABLE price_groups
  ADD COLUMN adjust_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT ck_price_groups_adjust CHECK (adjust_pct > -100 AND adjust_pct <= 1000);

-- -----------------------------------------------------------------------------
-- 2. ĐƠN HÀNG DỰ BÁO — vùng chờ: mọi đơn mới (Google Sheet khách, file Excel,
--    nhập tay) vào đây trước; nhân viên chọn & xác nhận mới chuyển sang Vận đơn.
--    1 order_key chỉ có 1 bản ghi: đơn đã xác nhận / đã loại không bị đồng bộ lại.
-- -----------------------------------------------------------------------------
CREATE TYPE draft_status AS ENUM ('CHO_XAC_NHAN', 'DA_XAC_NHAN', 'DA_LOAI');

CREATE TABLE order_drafts (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_code  TEXT NOT NULL REFERENCES customers(customer_code) ON UPDATE CASCADE,
  bill_code      TEXT NOT NULL,
  order_key      TEXT GENERATED ALWAYS AS (customer_code || '|' || bill_code) STORED,
  source         order_source NOT NULL,
  source_label   TEXT,                                  -- "SKL116.xlsx · DON", "Google Sheet · tab DON", "Nhập tay"
  data           JSONB NOT NULL,                        -- tuyến, điểm đến, người nhận, kiện… (OrderDraft)
  status         draft_status NOT NULL DEFAULT 'CHO_XAC_NHAN',
  order_id       BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  reject_reason  TEXT,
  created_by     UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by     UUID REFERENCES app_users(id) ON DELETE SET NULL,
  decided_at     TIMESTAMPTZ,
  CONSTRAINT uq_drafts_order_key UNIQUE (order_key),
  CONSTRAINT ck_drafts_bill_code CHECK (bill_code = upper(btrim(bill_code)) AND bill_code <> ''),
  CONSTRAINT ck_drafts_decided   CHECK ((status = 'CHO_XAC_NHAN') = (decided_at IS NULL))
);
CREATE TRIGGER order_drafts_updated_at BEFORE UPDATE ON order_drafts
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE INDEX ix_drafts_pending  ON order_drafts (customer_code, created_at DESC) WHERE status = 'CHO_XAC_NHAN';
CREATE INDEX ix_drafts_status   ON order_drafts (status, created_at DESC);
ALTER TABLE order_drafts ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. Phiếu thu: lý do hủy (hủy = gỡ toàn bộ phân bổ → công nợ bảng kê về như trước).
--    Sửa phiếu thu & dùng Thu thừa đều đi qua receipt_allocations → trigger sẵn có cộng dồn.
-- -----------------------------------------------------------------------------
ALTER TABLE receipts ADD COLUMN cancel_reason TEXT;


COMMIT;
