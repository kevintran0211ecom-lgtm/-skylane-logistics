/**
 * Các module THUẦN của dự án dùng trong bản chạy thử — đóng gói bằng esbuild thành biến toàn cục __M.
 * Bản chạy thử chạy đúng logic thật (engine giá, import, phiên bản, bảng kê, đối soát, phân quyền,
 * tìm nhiều mã, dòng tổng, sửa vận đơn, file Excel bảng kê & file mẫu bảng giá).
 */
export * as engine from "../lib/pricing/engine";
export * as importExcel from "../lib/pricing/import-excel";
export * as versioning from "../lib/pricing/versioning";
export * as priceTemplate from "../lib/pricing/template";
export * as importParse from "../lib/orders/import-parse";
export * as edit from "../lib/orders/edit";
export * as orderTemplate from "../lib/orders/template";
export * as totals from "../lib/orders/totals";
export * as search from "../lib/search";
export * as statementFmt from "../lib/statements/format";
export * as excelLayout from "../lib/statements/excel-layout";
export * as receiptFmt from "../lib/receipts/format";
export * as permissions from "../lib/auth/permissions";
