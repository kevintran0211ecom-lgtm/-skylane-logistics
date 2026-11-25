import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orderPackages, orders, routes } from "@/drizzle/schema";
import { readWorkbook } from "@/lib/pricing/read-xlsx";
import type { Cell } from "@/lib/pricing/import-excel";
import { parseCsv, parseOrderSheet, parseSheetUrl, type OrderDraft, type OrderParseResult } from "./import-parse";
import { repriceOrders, type RepriceReport } from "./reprice";

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
  duplicatesDb: string[]; // order_key đã có trong hệ thống
  duplicatesFile: { row: number; orderKey: string }[];
  errors: { row: number; billCode?: string; message: string }[];
  warnings: string[];
  ignoredColumns: string[];
  sample: { orderKey: string; routeCode: string; destinationIso2: string; packages: number; actualWeight: string }[];
  canCommit: boolean;
}

export interface OrderImportResult {
  inserted: number;
  duplicates: number;
  reprice: RepriceReport;
}

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

async function loadRows(o: OrderImportOptions, file: File | null): Promise<{ rows: Cell[][]; label: string }> {
  if (o.source === "FILE" && file) {
    if (/\.csv$/i.test(file.name)) return { rows: parseCsv((await file.text()).replace(/^﻿/, "")), label: file.name };
    const sheets = await readWorkbook(await file.arrayBuffer());
    const hasHeader = (rows: Cell[][]) => !parseOrderSheet(rows.slice(0, 16)).errors.some((e) => e.message.startsWith("Không tìm thấy"));
    const pick = sheets.find((s) => hasHeader(s.rows)) ?? sheets[0];
    if (!pick) throw new OrderImportError("File không có sheet nào.");
    return { rows: pick.rows, label: `${file.name} · ${pick.name}` };
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
  const { rows, label } = await loadRows(o, file);
  const parsed: OrderParseResult = parseOrderSheet(rows, { defaultCustomerCode: o.defaultCustomerCode });
  const errors = [...parsed.errors];
  const drafts = parsed.drafts;

  const custCodes = [...new Set(drafts.map((d) => d.customerCode))];
  const routeCodes = [...new Set(drafts.flatMap((d) => [d.routeCode, d.assignedRouteCode].filter((x): x is string => !!x)))];
  const keys = drafts.map((d) => d.orderKey);
  const [custRows, routeRows] = await Promise.all([
    custCodes.length ? db.select({ c: customers.customerCode }).from(customers).where(inArray(customers.customerCode, custCodes)) : [],
    routeCodes.length ? db.select({ c: routes.routeCode }).from(routes).where(inArray(routes.routeCode, routeCodes)) : [],
  ]);
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    for (const r of await db.select({ k: orders.orderKey }).from(orders).where(inArray(orders.orderKey, chunk))) existing.add(r.k!);
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

/** Ghi các đơn mới (bỏ qua đơn trùng order_key, kể cả trùng phát sinh đồng thời) rồi tính giá */
export async function commitOrderImport(o: OrderImportOptions, file: File | null): Promise<OrderImportResult> {
  const a = await analyze(o, file);
  if (a.valid.length === 0) throw new OrderImportError("Không có đơn mới hợp lệ để nhập.");
  const source = o.source === "SHEET" ? "SYNC" : "IMPORT";

  return db.transaction(async (tx) => {
    const ids: number[] = [];
    for (let i = 0; i < a.valid.length; i += 500) {
      const chunk = a.valid.slice(i, i + 500);
      const inserted = await tx
        .insert(orders)
        .values(
          chunk.map((d) => ({
            customerCode: d.customerCode,
            billCode: d.billCode,
            trackingNumber: d.trackingNumber,
            source: source as "SYNC" | "IMPORT",
            routeCode: d.routeCode,
            assignedRouteCode: d.assignedRouteCode ?? d.routeCode,
            destinationIso2: d.destinationIso2,
            ...(d.createdAt && { createdAt: d.createdAt }),
            shippedAt: d.shippedAt,
            receiverName: d.receiverName,
            receiverPhone: d.receiverPhone,
            receiverEmail: d.receiverEmail,
            receiverAddress: d.receiverAddress,
            receiverCity: d.receiverCity,
            receiverState: d.receiverState,
            receiverPostalCode: d.receiverPostalCode,
            goodsDescription: d.goodsDescription,
            hsCode: d.hsCode,
            declaredValueUsd: d.declaredValueUsd,
            note: d.note,
          })),
        )
        .onConflictDoNothing({ target: orders.orderKey })
        .returning({ id: orders.id, orderKey: orders.orderKey });
      const byKey = new Map(inserted.map((r) => [r.orderKey!, r.id]));
      const pkgRows = chunk.flatMap((d) => {
        const id = byKey.get(d.orderKey);
        return id ? d.packages.map((p, k) => ({ orderId: id, seq: k + 1, ...p })) : [];
      });
      for (let j = 0; j < pkgRows.length; j += 2000) await tx.insert(orderPackages).values(pkgRows.slice(j, j + 2000));
      ids.push(...inserted.map((r) => r.id));
    }
    const reprice = await repriceOrders(tx, ids);
    return { inserted: ids.length, duplicates: a.duplicatesDb.length + (a.valid.length - ids.length), reprice };
  });
}
