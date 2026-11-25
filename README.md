# SkyLane Logistics — Web App

Next.js (App Router, TypeScript) · Tailwind CSS v4 · shadcn/ui · PostgreSQL (Supabase) · Drizzle ORM

## Cài đặt

```bash
npm install
cp .env.example .env          # điền DATABASE_URL / DIRECT_URL của Supabase

# 1. Tạo cấu trúc DB (chạy 1 lần trên DB trống)
DATABASE_URL="$DIRECT_URL" npm run db:apply
#    hoặc dán sql/schema.sql vào Supabase → SQL Editor → Run

# 2. Sinh Drizzle types từ DB → drizzle/schema.ts, drizzle/relations.ts
npm run db:pull

# 3. Thêm component shadcn khi cần
npx shadcn@latest add button input dialog table checkbox select

npm run dev
```

## Nguyên tắc

- `sql/schema.sql` là nguồn sự thật duy nhất của cấu trúc DB; Drizzle types luôn sinh lại bằng `db:pull`, không sửa tay.
- DB chỉ giữ bất biến toàn vẹn: khóa chống trùng `order_key`, CHECK mã chuẩn hóa (TRIM+UPPER), chống chồng lấn phiên bản giá, tự khóa giá khi `xuất bảng kê`, cộng dồn tiền đã phân bổ.
- Tính DIM, làm tròn, tra bảng giá: `lib/pricing/engine.ts` (+ unit test).
- Tạo/Hủy bảng kê, ghi phiếu thu: service layer, bọc trong `db.transaction(...)`.
- NUMERIC từ Postgres về dạng `string` — không ép sang `number` khi tính tiền; dùng engine.

## Đăng nhập & phân quyền (Supabase Auth)

1. `.env`: điền `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. Supabase → Authentication → Users → **Add user** (email + mật khẩu) cho tài khoản quản trị đầu tiên.
3. Đăng nhập: khi bảng `app_users` còn trống, người đăng nhập đầu tiên tự được cấp **Admin**.
4. Admin tạo các tài khoản khác tại `/nguoi-dung` (Kế toán / Kho / Sale) và gán Sale cho khách hàng ở `/khach-hang`.

Ma trận quyền nằm duy nhất ở `lib/auth/permissions.ts` (có test) và được kiểm tra ở cả trang, server action và API:

| Vai trò | Quyền |
|---|---|
| Admin | Toàn quyền, gồm mở khóa/sửa đơn đã khóa giá, người dùng, danh mục, bảng giá |
| Kế toán | Bảng kê, đối soát thu tiền, công nợ, tạo/import/sửa đơn, sửa & mở khóa đơn đã khóa giá; xem danh mục & bảng giá |
| Kho | Xem đơn, sửa kiện/kích thước/cân, trạng thái, tuyến chỉ định, tracking — **không nhận dữ liệu tiền từ server**; không sửa đơn đã khóa giá |
| Sale | Chỉ xem đơn, Tổng quan, báo giá, bảng kê & công nợ của khách có `sale_user_id` = mình |

## Chức năng hiện có

| Trang | Đường dẫn | Ghi chú |
|---|---|---|
| Khách hàng | `/khach-hang` | Sale phụ trách, nhóm giá mặc định (gõ mã mới sẽ tự tạo nhóm), % điều chỉnh, nguồn đồng bộ Google Sheet |
| Tuyến vận chuyển | `/tuyen` | Dịch vụ EPK/CPN/CT, `weight_calc_mode` ACTUAL_ONLY / MAX_ACTUAL_VOL, hệ số DIM, NCC |
| Kho bảng giá | `/bang-gia` | Danh sách phiên bản, lọc theo tuyến/loại/trạng thái; chi tiết `/bang-gia/[id]` có lưới Ma trận, bảng Theo kg, lịch sử phiên bản |
| Tổng quan | `/dashboard` | Doanh thu, giá vốn, lợi nhuận theo ngày/tháng (biểu đồ + bảng), tổng công nợ phải thu (đã/chưa lên bảng kê), lọc theo KH & Sale |
| Người dùng | `/nguoi-dung` | Admin tạo tài khoản Supabase Auth, gán vai trò, khóa/mở |
| Vận đơn | `/don-hang` | Phân trang server, tìm theo mã vận đơn/tracking/KH, tab 5 trạng thái, tạo đơn nhiều kiện, import Excel/CSV/Google Sheet (chặn trùng order_key), Sửa đổi hàng loạt |
| Bảng kê | `/bang-ke` | Lọc đơn chưa lên bảng kê theo KH + ngày gửi → tạo bảng kê `SKLddMMyyXXXX` (snapshot, chuyển “xuất bảng kê”, khóa giá — 1 transaction); xuất `.xlsx` mẫu SkyLane (`/api/bang-ke/[id]/xlsx`, logo + VietQR MSB); hủy bảng kê |
| Đối soát thu tiền | `/doi-soat` | 2 cột: phiếu thu `SKLTHUddMMyyXXX` (format nghìn, đọc bằng chữ, dán ảnh Ctrl+V → Supabase Storage) / công nợ + gợi ý khớp tiền (chính xác → gộp → FIFO); lưu 1 transaction, dư → Thu thừa |
| Tra cứu giá gốc | `/bao-gia` | So sánh mọi tuyến theo điểm đến, cân, kích thước/CBM, ngày áp giá |
| Import Excel | `/bang-gia/import` | 2 bước: Xem trước → Xác nhận. Bắt buộc Ngày hiệu lực; file mẫu `public/templates/mau-bang-gia.xlsx` |

**Import bảng giá** (`lib/pricing/import-excel.ts`, thuần, có test): tự dò dòng tiêu đề "Khối lượng (KG)", tên tuyến ở dòng trên (gộp ô theo cụm), cột nước lấy mã ISO2 đầu tiêu đề. Mốc số → Ma trận; nhãn `21-44`, `45-99`, `100+`, `300+` → Theo kg dạng (Từ, Đến] nối liền. Nước có giá giống hệt được gom 1 vùng. Ghi DB trong 1 transaction: khóa phiên bản đang áp dụng, chốt `effective_to` = ngày hiệu lực mới − 1, thêm phiên bản mới (`lib/pricing/versioning.ts`). Không sửa/xóa giá cũ.

**Tự động tính lại giá** (`lib/orders/reprice.ts`): mọi thao tác tạo/import/sửa đơn gọi `repriceOrders` trong cùng transaction. Đơn `price_locked` được bỏ qua; trường trong `manual_overrides` giữ nguyên; thiếu bảng giá → vẫn cập nhật cân, giữ tiền cũ và báo lỗi.

Migration bổ sung: `sql/migrations/002_orders_volumetric_overrides.sql`, `003_statement_numbering.sql`, `004_receipt_account.sql` (kèm bucket Storage `receipt-proofs`) (đã gộp vào `sql/schema.sql`).

Sinh lại file mẫu: `python3 scripts/make-price-template.py public/templates/mau-bang-gia.xlsx`

## Cấu trúc bảng

| Nhóm | Bảng |
|---|---|
| Danh mục | `app_users`, `price_groups`, `customers`, `suppliers`, `routes` |
| Kho bảng giá | `pricing_versions` → `pricing_zones` → `pricing_zone_countries`, `pricing_matrix_tiers` (≤20kg), `pricing_per_kg_tiers` (>20kg) |
| Vận đơn | `orders`, `order_packages` |
| Công nợ | `statements`, `statement_items`, `receipts`, `receipt_allocations` |
| Nhật ký | `audit_logs` |
