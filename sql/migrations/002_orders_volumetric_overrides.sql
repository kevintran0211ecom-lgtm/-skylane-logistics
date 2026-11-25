-- Tổng cân quy đổi của đơn (theo tuyến vận chuyển) + cho phép ghi đè thủ công cân thực / quy đổi
ALTER TABLE orders ADD COLUMN volumetric_weight NUMERIC(12,3) NOT NULL DEFAULT 0;
ALTER TABLE orders DROP CONSTRAINT ck_orders_weights;
ALTER TABLE orders ADD CONSTRAINT ck_orders_weights
  CHECK (actual_weight >= 0 AND volumetric_weight >= 0 AND billed_weight >= 0 AND shipped_weight >= 0);
ALTER TABLE orders DROP CONSTRAINT ck_orders_overrides;
ALTER TABLE orders ADD CONSTRAINT ck_orders_overrides CHECK (manual_overrides <@
  ARRAY['actual_weight','volumetric_weight','billed_weight','shipped_weight','sell_amount','cost_amount']::text[]);
