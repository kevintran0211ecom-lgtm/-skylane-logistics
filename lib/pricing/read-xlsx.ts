import "server-only";
import ExcelJS from "exceljs";
import type { Cell, SheetGrid } from "./import-excel";

const MAX_ROWS = 5000;
const MAX_COLS = 400;

/** Chuẩn hóa giá trị ô exceljs (công thức, rich text, hyperlink...) về chuỗi/số */
function toCell(v: ExcelJS.CellValue | undefined): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return String(v);
  if (v instanceof Date) return null;
  if (typeof v === "object") {
    if ("result" in v) return toCell(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return typeof v.text === "string" ? v.text : toCell(v.text as ExcelJS.CellValue);
    if ("error" in v) return null;
  }
  return null;
}

/**
 * Đọc file .xlsx thành lưới ô cho từng sheet.
 * exceljs trả giá trị ô chính cho mọi ô thuộc vùng gộp → tên tuyến gộp ô theo cụm
 * hiện diện ở mọi cột của khối.
 */
export async function readWorkbook(data: ArrayBuffer): Promise<SheetGrid[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    throw new Error("Không đọc được file. Hãy lưu file dưới định dạng Excel .xlsx (không hỗ trợ .xls/.csv).");
  }
  const sheets: SheetGrid[] = [];
  wb.eachSheet((ws) => {
    if (ws.state !== "visible") return;
    const rowCount = Math.min(ws.rowCount, MAX_ROWS);
    const colCount = Math.min(ws.columnCount, MAX_COLS);
    const rows: Cell[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      const row = ws.getRow(r);
      const cells: Cell[] = [];
      for (let c = 1; c <= colCount; c++) cells.push(toCell(row.getCell(c).value));
      rows.push(cells);
    }
    sheets.push({ name: ws.name, rows });
  });
  return sheets;
}
