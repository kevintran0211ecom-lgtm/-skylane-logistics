import "server-only";
/**
 * ĐƠN HÀNG DỰ BÁO — vùng chờ trước Vận đơn.
 * Mọi đơn mới (Google Sheet khách, file Excel, nhập tay) vào order_drafts trạng thái CHO_XAC_NHAN.
 * Nhân viên chọn đơn → Xác nhận: tạo vận đơn + kiện + tính giá trong 1 transaction.
 * 1 order_key chỉ có 1 bản ghi (UNIQUE) nên đơn đã xác nhận / đã loại không bị đồng bộ lại.
 */
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orderDrafts, orderPackages, orders } from "@/drizzle/schema";
import type { DraftData, OrderDraft } from "./import-parse";
import { repriceOrders, type RepriceReport } from "./reprice";

export type DraftStatus = "CHO_XAC_NHAN" | "DA_XAC_NHAN" | "DA_LOAI";
export const DRAFT_STATUS_LABEL: Record<DraftStatus, string> = {
  CHO_XAC_NHAN: "Chờ xác nhận",
  DA_XAC_NHAN: "Đã xác nhận",
  DA_LOAI: "Đã loại",
};
const SOURCE_LABEL = { MANUAL: "Nhập tay", IMPORT: "File Excel", SYNC: "Google Sheet", PORTAL: "Cổng khách hàng" } as const;
type Source = keyof typeof SOURCE_LABEL;

export interface StageResult {
  added: number;
  skipped: number; // trùng order_key với Vận đơn / Đơn dự báo
}

const toData = (d: OrderDraft | DraftData): DraftData => {
  const { rows: _rows, ...rest } = d as OrderDraft;
  return rest;
};

/** Thêm đơn vào vùng chờ; đơn trùng order_key bị bỏ qua (kể cả trùng phát sinh đồng thời) */
export async function stageDrafts(
  drafts: (OrderDraft | DraftData)[],
  o: { source: Source; label?: string | null; userId: string | null; accountId?: string | null },
): Promise<StageResult> {
  if (!drafts.length) return { added: 0, skipped: 0 };
  const keys = drafts.map((d) => d.orderKey);
  const inOrders = new Set<string>();
  for (let i = 0; i < keys.length; i += 1000) {
    const rows = await db.select({ k: orders.orderKey }).from(orders).where(inArray(orders.orderKey, keys.slice(i, i + 1000)));
    rows.forEach((r) => inOrders.add(r.k!));
  }
  const fresh = drafts.filter((d) => !inOrders.has(d.orderKey));
  let added = 0;
  for (let i = 0; i < fresh.length; i += 500) {
    const res = await db
      .insert(orderDrafts)
      .values(
        fresh.slice(i, i + 500).map((d) => ({
          customerCode: d.customerCode,
          billCode: d.billCode,
          source: o.source,
          sourceLabel: o.label ?? SOURCE_LABEL[o.source],
          data: toData(d),
          createdBy: o.userId,
          createdByAccount: o.accountId ?? null,
        })),
      )
      .onConflictDoNothing({ target: orderDrafts.orderKey })
      .returning({ id: orderDrafts.id });
    added += res.length;
  }
  return { added, skipped: drafts.length - added };
}

// =============================================================================
// Xác nhận → Vận đơn
// =============================================================================
export interface ConfirmResult {
  confirmed: number;
  duplicates: string[]; // order_key đã có vận đơn (đánh dấu đã xác nhận, gắn với đơn sẵn có)
  reprice: RepriceReport;
}

export async function confirmDrafts(ids: number[], userId: string | null): Promise<ConfirmResult> {
  return db.transaction(async (tx) => {
    const pending = await tx
      .select()
      .from(orderDrafts)
      .where(and(inArray(orderDrafts.id, ids), eq(orderDrafts.status, "CHO_XAC_NHAN")))
      .for("update");
    if (!pending.length) return { confirmed: 0, duplicates: [], reprice: { repriced: 0, locked: 0, failed: [] } };

    const newIds: number[] = [];
    const duplicates: string[] = [];
    for (let i = 0; i < pending.length; i += 500) {
      const chunk = pending.slice(i, i + 500);
      const inserted = await tx
        .insert(orders)
        .values(
          chunk.map(({ data: d, source }) => ({
            customerCode: d.customerCode,
            billCode: d.billCode,
            trackingNumber: d.trackingNumber,
            source,
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
            goodsNameEn: d.goodsNameEn ?? null,
            hsCode: d.hsCode,
            declaredValueUsd: d.declaredValueUsd,
            note: d.note,
          })),
        )
        .onConflictDoNothing({ target: orders.orderKey })
        .returning({ id: orders.id, orderKey: orders.orderKey });
      const byKey = new Map(inserted.map((r) => [r.orderKey!, r.id]));
      const pkgRows = chunk.flatMap((dr) => {
        const id = byKey.get(dr.orderKey!);
        return id ? dr.data.packages.map((p, k) => ({ orderId: id, seq: k + 1, ...p })) : [];
      });
      for (let j = 0; j < pkgRows.length; j += 2000) await tx.insert(orderPackages).values(pkgRows.slice(j, j + 2000));
      newIds.push(...inserted.map((r) => r.id));

      // Đơn đã có vận đơn (tạo ở nơi khác trong lúc chờ) → gắn với vận đơn đó
      const missing = chunk.filter((dr) => !byKey.has(dr.orderKey!)).map((dr) => dr.orderKey!);
      if (missing.length) {
        duplicates.push(...missing);
        for (const r of await tx.select({ id: orders.id, k: orders.orderKey }).from(orders).where(inArray(orders.orderKey, missing))) {
          byKey.set(r.k!, r.id);
        }
      }
      for (const dr of chunk) {
        await tx
          .update(orderDrafts)
          .set({ status: "DA_XAC_NHAN", orderId: byKey.get(dr.orderKey!) ?? null, decidedBy: userId, decidedAt: sql`now()` })
          .where(eq(orderDrafts.id, dr.id));
      }
    }
    const reprice = await repriceOrders(tx, newIds);
    return { confirmed: newIds.length, duplicates, reprice };
  });
}

/** Loại đơn (không đưa vào Vận đơn). Đơn đã loại không bị đồng bộ lại. */
export async function rejectDrafts(ids: number[], reason: string | null, userId: string | null) {
  const rows = await db
    .update(orderDrafts)
    .set({ status: "DA_LOAI", rejectReason: reason, decidedBy: userId, decidedAt: sql`now()` })
    .where(and(inArray(orderDrafts.id, ids), eq(orderDrafts.status, "CHO_XAC_NHAN")))
    .returning({ id: orderDrafts.id });
  return rows.length;
}

/** Đưa đơn đã loại về lại "Chờ xác nhận" */
export async function restoreDrafts(ids: number[]) {
  const rows = await db
    .update(orderDrafts)
    .set({ status: "CHO_XAC_NHAN", rejectReason: null, decidedBy: null, decidedAt: null })
    .where(and(inArray(orderDrafts.id, ids), eq(orderDrafts.status, "DA_LOAI")))
    .returning({ id: orderDrafts.id });
  return rows.length;
}

// =============================================================================
// Truy vấn
// =============================================================================
export async function listDrafts(f: {
  status: DraftStatus;
  q?: string;
  customerCode?: string;
  saleUserId?: string | null;
  page: number;
  pageSize: number;
}) {
  const term = f.q?.trim();
  const scope = and(
    f.customerCode ? eq(orderDrafts.customerCode, f.customerCode) : undefined,
    f.saleUserId ? eq(customers.saleUserId, f.saleUserId) : undefined,
    term ? or(ilike(orderDrafts.billCode, `%${term}%`), ilike(customers.name, `%${term}%`), ilike(orderDrafts.customerCode, `%${term}%`)) : undefined,
  );
  const where = and(eq(orderDrafts.status, f.status), scope);
  const [rows, counts] = await Promise.all([
    db
      .select({
        id: orderDrafts.id,
        customerCode: orderDrafts.customerCode,
        customerName: customers.name,
        billCode: orderDrafts.billCode,
        source: orderDrafts.source,
        sourceLabel: orderDrafts.sourceLabel,
        data: orderDrafts.data,
        status: orderDrafts.status,
        rejectReason: orderDrafts.rejectReason,
        createdAt: orderDrafts.createdAt,
        decidedAt: orderDrafts.decidedAt,
      })
      .from(orderDrafts)
      .innerJoin(customers, eq(customers.customerCode, orderDrafts.customerCode))
      .where(where)
      .orderBy(desc(orderDrafts.createdAt), desc(orderDrafts.id))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db
      .select({ status: orderDrafts.status, n: sql<number>`count(*)::int` })
      .from(orderDrafts)
      .innerJoin(customers, eq(customers.customerCode, orderDrafts.customerCode))
      .where(scope)
      .groupBy(orderDrafts.status),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<Record<DraftStatus, number>>;
  return { rows, total: byStatus[f.status] ?? 0, counts: byStatus };
}
export type DraftRow = Awaited<ReturnType<typeof listDrafts>>["rows"][number];

/** Số đơn đang chờ xác nhận (hiện trên nút "Nhận đơn mới") */
export async function countPendingDrafts(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(orderDrafts).where(eq(orderDrafts.status, "CHO_XAC_NHAN"));
  return r?.n ?? 0;
}
