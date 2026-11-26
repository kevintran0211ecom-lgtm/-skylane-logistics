-- =============================================================================
-- 006 — Vận đơn: Thời gian xuất hàng, Tên hàng tiếng Anh (theo góp ý 26/11/2026)
--  * exported_at: tự ghi khi đơn chuyển sang 'Đã xuất hàng' (giữ nguyên nếu đã có;
--    Admin/Kế toán/Kho sửa tay được). Khác shipped_at = Ngày gửi hàng (dùng tra bảng giá).
--  * goods_name_en: tách khỏi goods_description (= Tên hàng tiếng Việt).
-- Chỉ THÊM cột, không đổi dữ liệu cũ → an toàn khi code cũ vẫn đang chạy.
-- =============================================================================
BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS exported_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS goods_name_en TEXT;

CREATE INDEX IF NOT EXISTS ix_orders_exported ON orders (exported_at DESC) WHERE exported_at IS NOT NULL;

-- Tách "Tên VI / Tên EN" đã gộp khi import trước đây (chỉ khi chưa có tên EN)
UPDATE orders
   SET goods_name_en    = btrim(split_part(goods_description, ' / ', 2)),
       goods_description = btrim(split_part(goods_description, ' / ', 1))
 WHERE goods_name_en IS NULL AND goods_description LIKE '% / %';

-- Đơn đang ở 'Đã xuất hàng' / 'Đã giao hàng' chưa có thời gian xuất: lấy lần cập nhật gần nhất (ước lượng)
UPDATE orders SET exported_at = updated_at
 WHERE exported_at IS NULL AND status IN ('Đã xuất hàng', 'Đã giao hàng');

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

  -- Thời gian xuất hàng: ghi khi chuyển sang 'Đã xuất hàng' (mọi đường cập nhật: sửa 1 đơn, hàng loạt, import)
  IF NEW.status = 'Đã xuất hàng'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.exported_at IS NULL THEN
    NEW.exported_at := now();
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at  := now();
    NEW.row_version := OLD.row_version + 1;
  END IF;
  RETURN NEW;
END $$;

COMMIT;
