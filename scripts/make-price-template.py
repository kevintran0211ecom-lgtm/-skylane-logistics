"""Sinh file mẫu public/templates/mau-bang-gia.xlsx (ma trận ngang SkyLane)."""
import sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side

out = sys.argv[1] if len(sys.argv) > 1 else "public/templates/mau-bang-gia.xlsx"
wb = Workbook(); ws = wb.active; ws.title = "Bảng giá"
blue = PatternFill("solid", fgColor="1F3A8A"); light = PatternFill("solid", fgColor="DBEAFE")
thin = Side(style="thin", color="94A3B8"); box = Border(left=thin, right=thin, top=thin, bottom=thin)
center = Alignment(horizontal="center", vertical="center", wrap_text=True)

blocks = [
    ("VNFZZXR", [("GB", "Anh"), ("DE", "Đức"), ("FR", "Pháp"), ("US", "Mỹ")],
     [0.1, 0.2, 0.3, 0.5, 1, 2, 5, 10, 20], [], [79360, 128712, 128712, 138572]),
    ("UPS HAN S5500", [("US", "Mỹ"), ("CA", "Canada")],
     [0.5, 1, 2, 5, 10, 15, 20], [("21-44", 246113, 251000), ("45-99", 240000, 245000), ("100+", 235000, 240000), ("300+", 230000, 235000)],
     [300000, 330000]),
]
col = 1
for route, countries, fixed, ranges, base in blocks:
    width = 1 + len(countries)
    ws.merge_cells(start_row=1, start_column=col, end_row=1, end_column=col + width - 1)
    c = ws.cell(1, col, route); c.font = Font(bold=True, color="FFFFFF", size=12); c.fill = blue; c.alignment = center
    h = ws.cell(2, col, "Khối lượng (KG)"); h.font = Font(bold=True); h.fill = light; h.alignment = center; h.border = box
    for j, (iso, name) in enumerate(countries):
        h = ws.cell(2, col + 1 + j, f"{iso} – {name}\n(VND)"); h.font = Font(bold=True); h.fill = light; h.alignment = center; h.border = box
    r = 3
    for w in fixed:
        ws.cell(r, col, w).number_format = "0.00"
        for j in range(len(countries)):
            ws.cell(r, col + 1 + j, round(base[j] * (1 + w * 0.9))).number_format = "#,##0"
        r += 1
    for label, *prices in ranges:
        ws.cell(r, col, label)
        for j, p in enumerate(prices):
            ws.cell(r, col + 1 + j, p).number_format = "#,##0"
        r += 1
    for rr in range(2, r):
        for cc in range(col, col + width):
            ws.cell(rr, cc).border = box
    for cc in range(col, col + width):
        ws.column_dimensions[ws.cell(2, cc).column_letter].width = 15
    col += width
ws.row_dimensions[2].height = 34
ws.freeze_panes = "A3"

g = wb.create_sheet("Hướng dẫn")
for i, line in enumerate([
    "HƯỚNG DẪN NHẬP BẢNG GIÁ (ma trận ngang)",
    "Dòng 1: tên tuyến, gộp ô theo cụm cột của tuyến (trùng mã tuyến trong Danh mục Tuyến).",
    "Dòng 2: cột 'Khối lượng (KG)' rồi tới các cột nước, mã ISO2 đứng đầu: 'US – Mỹ (VND)'. Dùng (USD) nếu giá USD.",
    "Mốc số (0,10 … 20,00) = giá trọn mốc (Ma trận). Nhãn khoảng 21-44, 45-99, 100+, 300+ = đơn giá/kg (Theo kg).",
    "Ô để trống hoặc '-' = không phục vụ mốc đó.",
    "Mỗi tuyến một cụm cột; có thể đặt nhiều tuyến cạnh nhau hoặc ở nhiều sheet.",
    "Khi tải lên phải chọn Ngày hiệu lực: hệ thống tạo phiên bản mới, phiên bản cũ được giữ nguyên làm lịch sử.",
], start=1):
    g.cell(i, 1, line).font = Font(bold=(i == 1))
g.column_dimensions["A"].width = 110
wb.save(out)
print("saved", out)
