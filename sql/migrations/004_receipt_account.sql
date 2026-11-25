-- Tài khoản nhận tiền của phiếu thu (mặc định MSB - 3812042003 (HOANG THU THAO))
ALTER TABLE receipts ADD COLUMN received_account TEXT NOT NULL DEFAULT 'MSB - 3812042003 (HOANG THU THAO)';

-- Supabase Storage: bucket riêng tư cho ảnh minh chứng (đã tạo trên project)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipt-proofs', 'receipt-proofs', false, 5242880, ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;
