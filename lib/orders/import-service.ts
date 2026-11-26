import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orderDrafts, orders, routes } from "@/drizzle/schema";
import { readWorkbook } from "@/lib/pricing/read-xlsx";
import { detectTemplateCustomer } from "./template";
import type { Cell } from "@/lib/pricing/import-excel";
import { parseCsv, parseOrderSheet, parseSheetUrl, type OrderDraft, type OrderParseResult } from "./import-parse";
import { stageDrafts, type StageResult } from "./drafts-service";

export class OrderImportError extends Error {}

const MAX_BYTES = 10 * 1024 * 1024;
const SAMPLE = 50;

export interface OrderImportOptions {
  source: "FILE" | "SHEET";
  defaultCustomerCode: string | null;
  sheetUrl: string | null;
  sheetTab: string | null;
}

export interface OrderImportPreview {
  sourceLabel: string;
  totalRows: number;
  newCount: number;
  packageCount: number;
  duplicatesDb: string[]; // order_key đã có trong Vận đơn hoặc Đơn hàng dự báo
  duplicatesFile: { row: number; orderKey: string }[];
  errors: { row: number; billCode?: string; message: string }[];
  warnings: string[];
  ignoredColumns: string[];
  sample: { orderKey: string; routeCode: string; destinationIso2: string; packages: number; actualWeight: string }[];
  canCommit: boolean;
}

export type OrderImportResult = StageResult;

// -----------------------------------------------------------------------------
export function readOrderImportForm(fd: FormData): { options: OrderImportOptions; file: File | null } {
  const source = fd.get("source") === "SHEET" ? "SHEET" : "FILE";
  const defaultCustomerCode = String(fd.get("customerCode") ?? "").trim().toUpperCase() || null;
  const file = fd.get("file");
  if (source === "FILE") {
    if (!(file instanceof File) || file.size === 0) throw new OrderImportError("Chọn file Excel (.xlsx) hoặc CSV.");
    if (!/\.(xlsx|csv)$/i.test(file.name)) throw new OrderImportError("Chỉ hỗ trợ file .xlsx hoặc .csv.");
    if (file.size > MAX_BYTES) throw new OrderImportError("File vượt quá 10 MB.");
  }
  return {
    file: source === "FILE" ? (file as File) : null,
    options: {
      source,
      defaultCustomerCode,
      sheetUrl: String(fd.get("sheetUrl") ?? "").trim() || null,
      sheetTab: String(fd.get("sheetTab") ?? "").trim() || null,
    },
  };
}

async function loadRows(o: OrderImportOptions, file: File | null): Promise<{ rows: Cell[][]; label: string; templateCustomer?: string | null }> {
  if (o.source === "FILE" && file) {
    if (/\.csv$/i.test(file.name)) return { rows: parseCsv((await file.text()).replace(/^﻿/, "")), label: file.name };
    const sheets = await readWorkbook(await file.arrayBuffer());
    const hasHeader = (rows: Cell[][]) => !parseOrderSheet(rows.slice(0, 16)).errors.some((e) => e.message.startsWith("Không tìm thấy"));
    const pick = sheets.find((s) => s.name.trim().toUpperCase() === "DON" && hasHeader(s.rows)) ?? sheets.find((s) => hasHeader(s.rows)) ?? sheets[0];
    if (!pick) throw new OrderImportError("File không có sheet nào.");
    // File mẫu SkyLane cấp cho khách (kể cả tải từ Google Sheet) ghi sẵn mã khách ở sheet "Hướng dẫn"
    return { rows: pick.rows, label: `${file.name} · ${pick.name}`, templateCustomer: detectTemplateCustomer(sheets, file.name) };
  }

  // Google Sheet: lấy link nhập tay, hoặc link nguồn đồng bộ của khách hàng
  let url = o.sheetUrl;
  let tab = o.sheetTab;
  if (!url && o.defaultCustomerCode) {
    const [c] = await db.select({ cfg: customers.syncConfig }).from(customers).where(eq(customers.customerCode, o.defaultCustomerCode));
    url = c?.cfg?.url ?? null;
    tab = tab ?? c?.cfg?.sheet ?? null;
  }
  if (!url) throw new OrderImportError("Nhập link Google Sheet (hoặc chọn khách hàng đã cấu hình nguồn đồng bộ).");
  const parsed = parseSheetUrl(url);
  if (!parsed) throw new OrderImportError("Link Google Sheet không hợp lệ.");
  const csvUrl = `https://docs.google.com/spreadsheets/d/${parsed.id}/gviz/tq?tqx=out:csv&headers=1${tab ? `&sheet=${encodeURIComponent(tab)}` : ""}`;
  let res: Response;
  try {
    res = await fetch(csvUrl, { cache: "no-store", redirect: "follow" });
  } catch {
    throw new OrderImportError("Không kết nối được Google Sheet.");
  }
  const text = await res.text();
  if (!res.ok || /^\s*</.test(text)) {
    throw new OrderImportError(
      'Không đọc được Google Sheet. Hãy bật chia sẻ "Bất kỳ ai có đường liên kết — Người xem" và kiểm tra tên tab.',
    );
  }
  return { rows: parseCsv(text), label: `Google Sheet${tab ? ` · tab ${tab}` : ""}` };
}

async function analyze(o: OrderImportOptions, file: File | null) {
  const { rows, label, templateCustomer } = await loadRows(o, file);
  const chosen = o.defaultCustomerCode?.trim().toUpperCase() || null;
  if (templateCustomer && chosen && templateCustomer !== chosen)
    throw new OrderImportError(`File này là mẫu nhập đơn của khách ${templateCustomer}, nhưng bạn đang chọn ${chosen}. Chọn đúng khách hoặc để trống ô khách hàng.`);
  const parsed: OrderParseResult = parseOrderSheet(rows, { defaultCustomerCode: chosen ?? templateCustomer });
  const errors = [...parsed.errors];
  const drafts = parsed.drafts;

  const custCodes = [...new Set(drafts.map((d) => d.customerCode))];
  const routeCodes = [...new Set(drafts.flatMap((d) => [d.routeCode, d.assignedRouteCode].filter((x): x is string => !!x)))];
  const keys = drafts.map((d) => d.orderKey);
  const [custRows, routeRows] = await Promise.all([
    custCodes.length ? db.select({ c: customers.customerCode }).from(customers).where(inArray(customers.customerCode, custCodes)) : [],
    routeCodes.length ? db.select({ c: routes.routeCode }).from(routes).where(inArray(routes.routeCode, routeCodes)) : [],
  ]);
  // Trùng = đã có trong Vận đơn, hoặc đã nằm trong Đơn hàng dự báo (đang chờ / đã xác nhận / đã loại)
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    const [a, b] = await Promise.all([
      db.select({ k: orders.orderKey }).from(orders).where(inArray(orders.orderKey, chunk)),
      db.select({ k: orderDrafts.orderKey }).from(orderDrafts).where(inArray(orderDrafts.orderKey, chunk)),
    ]);
    for (const r of [...a, ...b]) existing.add(r.k!);
  }
  const knownC = new Set(custRows.map((r) => r.c));
  const knownR = new Set(routeRows.map((r) => r.c));

  const valid: OrderDraft[] = [];
  const duplicatesDb: string[] = [];
  for (const d of drafts) {
    const bad: string[] = [];
    if (!knownC.has(d.customerCode)) bad.push(`khách hàng ${d.customerCode} chưa có trong Danh mục`);
    if (!knownR.has(d.routeCode)) bad.push(`tuyến ${d.routeCode} chưa có trong Danh mục`);
    if (d.assignedRouteCode && !knownR.has(d.assignedRouteCode)) bad.push(`tuyến chỉ định ${d.assignedRouteCode} chưa có`);
    if (bad.length) errors.push({ row: d.rows[0], billCode: d.billCode, message: bad.join("; ") });
    else if (existing.has(d.orderKey)) duplicatesDb.push(d.orderKey);
    else valid.push(d);
  }
  return { label, parsed, errors, valid, duplicatesDb, totalRows: Math.max(0, rows.length - 1) };
}

export async function previewOrderImport(o: OrderImportOptions, file: File | null): Promise<OrderImportPreview> {
  const a = await analyze(o, file);
  return {
    sourceLabel: a.label,
    totalRows: a.totalRows,
    newCount: a.valid.length,
    packageCount: a.valid.reduce((t, d) => t + d.packages.length, 0),
    duplicatesDb: a.duplicatesDb.slice(0, 200),
    duplicatesFile: a.parsed.duplicatesInFile.slice(0, 200),
    errors: a.errors.slice(0, 200),
    warnings: a.parsed.warnings,
    ignoredColumns: a.parsed.ignoredColumns,
    sample: a.valid.slice(0, SAMPLE).map((d) => ({
      orderKey: d.orderKey,
      routeCode: d.routeCode,
      destinationIso2: d.destinationIso2,
      packages: d.packages.length,
      actualWeight: d.packages.reduce((t, p) => t + Number(p.actualWeight), 0).toFixed(3),
    })),
    canCommit: a.valid.length > 0,
  };
}

/** Đưa các đơn mới hợp lệ vào Đơn hàng dự báo (chờ nhân viên xác nhận) */
export async function stageOrderImport(o: OrderImportOptions, file: File | null, userId: string | null): Promise<OrderImportResult> {
  const a = await analyze(o, file);
  if (a.valid.length === 0) throw new OrderImportError("Không có đơn mới hợp lệ để đưa vào Đơn hàng dự báo.");
  const r = await stageDrafts(a.valid, { source: o.source === "SHEET" ? "SYNC" : "IMPORT", label: a.label, userId });
  if (o.source === "SHEET" && o.defaultCustomerCode && !o.sheetUrl) {
    await db.update(customers).set({ lastSyncedAt: new Date().toISOString() }).where(eq(customers.customerCode, o.defaultCustomerCode));
  }
  return { ...r, skipped: r.skipped + a.duplicatesDb.length };
}
