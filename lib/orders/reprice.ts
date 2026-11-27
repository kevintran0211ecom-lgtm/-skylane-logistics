import "server-only";
import { inArray, sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { customers, orderPackages, orders, priceGroups } from "@/drizzle/schema";
import { calcOrderPricing, PricingError, type OverrideField, type OrderPricingResult } from "@/lib/pricing/engine";
import { loadPricingCatalog } from "@/lib/pricing/catalog";

import { addRepriced, emptyReport, repriceMessage, type RepriceReport } from "./reprice-summary";
export { repriceMessage, type RepriceReport };

const CHUNK = 500;
const values = (rows: SQL[]) => sql.join(rows, sql`, `);

/**
 * TỰ ĐỘNG TÍNH LẠI GIÁ — gọi trong cùng transaction sau mọi thay đổi kích thước / cân / tuyến / điểm đến.
 * - Đơn price_locked = true: bỏ qua, giữ nguyên cân & tiền đã chốt.
 * - Đơn chưa khóa: engine tính lại billed/shipped weight, sell/cost amount (profit là cột generated),
 *   cân từng kiện; trường có trong manual_overrides được giữ nguyên.
 * - Không tra được giá (thiếu bảng giá / vùng / mốc): vẫn cập nhật cân, giữ tiền cũ, báo lỗi.
 */
export async function repriceOrders(tx: Tx, orderIds: number[]): Promise<RepriceReport> {
  const report: RepriceReport = emptyReport();
  if (orderIds.length === 0) return report;

  const rows = await tx
    .select({
      id: orders.id,
      billCode: orders.billCode,
      customerCode: orders.customerCode,
      routeCode: orders.routeCode,
      assignedRouteCode: orders.assignedRouteCode,
      destinationIso2: orders.destinationIso2,
      pricingDate: orders.pricingDate,
      priceLocked: orders.priceLocked,
      manualOverrides: orders.manualOverrides,
      actualWeight: orders.actualWeight,
      volumetricWeight: orders.volumetricWeight,
      billedWeight: orders.billedWeight,
      shippedWeight: orders.shippedWeight,
      sellAmount: orders.sellAmount,
      costAmount: orders.costAmount,
      priceGroupCode: customers.priceGroupCode,
      priceAdjustPct: customers.priceAdjustPct,
      groupAdjustPct: priceGroups.adjustPct,
    })
    .from(orders)
    .innerJoin(customers, sql`${customers.customerCode} = ${orders.customerCode}`)
    .leftJoin(priceGroups, sql`${priceGroups.code} = ${customers.priceGroupCode}`)
    .where(inArray(orders.id, orderIds))
    .for("update", { of: orders });

  const open = rows.filter((r) => !r.priceLocked);
  report.locked = rows.length - open.length;
  if (open.length === 0) return report;

  const pkgs = await tx
    .select()
    .from(orderPackages)
    .where(
      inArray(
        orderPackages.orderId,
        open.map((o) => o.id),
      ),
    )
    .orderBy(orderPackages.orderId, orderPackages.seq);
  const pkgByOrder = new Map<number, typeof pkgs>();
  for (const p of pkgs) pkgByOrder.set(p.orderId, [...(pkgByOrder.get(p.orderId) ?? []), p]);

  const dates = open.map((o) => o.pricingDate!).sort();
  const catalog = await loadPricingCatalog(
    tx,
    open.flatMap((o) => [o.routeCode, o.assignedRouteCode]),
    dates[0],
    dates[dates.length - 1],
  );

  const orderUpdates: SQL[] = [];
  const pkgUpdates: SQL[] = [];
  for (const o of open) {
    const packages = pkgByOrder.get(o.id) ?? [];
    const overrides = (o.manualOverrides ?? []) as OverrideField[];
    const input = {
      customerCode: o.customerCode,
      priceGroupCode: o.priceGroupCode,
      priceAdjustPct: o.priceAdjustPct,
      groupAdjustPct: o.groupAdjustPct,
      routeCode: o.routeCode,
      assignedRouteCode: o.assignedRouteCode,
      destinationIso2: o.destinationIso2,
      shippedAt: o.pricingDate, // ngày tra giá đã quy đổi Asia/Saigon (shipped_at, fallback created_at)
      createdAt: o.pricingDate!,
      packages: packages.map((p) => ({ lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm, actualWeight: p.actualWeight })),
      manualOverrides: overrides,
      current: {
        actual_weight: o.actualWeight,
        volumetric_weight: o.volumetricWeight,
        billed_weight: o.billedWeight,
        shipped_weight: o.shippedWeight,
        sell_amount: o.sellAmount,
        cost_amount: o.costAmount,
      },
    };

    let result: OrderPricingResult;
    let keepVersions = false;
    try {
      result = calcOrderPricing(input, catalog);
      report.repriced++;
    } catch (e) {
      if (!(e instanceof PricingError)) throw e;
      report.failed.push({ billCode: o.billCode, message: e.message });
      try {
        // Vẫn tính lại cân: coi tiền như ghi đè để engine không tra giá
        result = calcOrderPricing({ ...input, manualOverrides: [...overrides, "sell_amount", "cost_amount"] }, catalog);
        keepVersions = true;
      } catch (e2) {
        if (!(e2 instanceof PricingError)) throw e2;
        continue; // VD tuyến không tồn tại — giữ nguyên toàn bộ
      }
    }

    const b = result.billed;
    const s = result.shipped;
    if (!keepVersions) addRepriced(report, o.sellAmount, b.amount, b.scope);
    orderUpdates.push(
      sql`(${o.id}::bigint, ${packages.length}::int, ${b.totalActual}::numeric, ${b.totalVolumetric}::numeric,
           ${b.weight}::numeric, ${s.weight}::numeric, ${b.amount}::numeric, ${s.amount}::numeric,
           ${keepVersions ? null : b.versionId === null ? null : Number(b.versionId)}::bigint,
           ${keepVersions ? null : s.versionId === null ? null : Number(s.versionId)}::bigint, ${keepVersions || b.amountOverridden}::boolean,
           ${keepVersions || s.amountOverridden}::boolean)`,
    );
    packages.forEach((p, i) => {
      pkgUpdates.push(
        sql`(${p.id}::bigint, ${b.packages[i].volumetricWeight}::numeric, ${b.packages[i].chargeableWeight}::numeric,
             ${s.packages[i].volumetricWeight}::numeric, ${s.packages[i].chargeableWeight}::numeric)`,
      );
    });
  }

  for (let i = 0; i < orderUpdates.length; i += CHUNK) {
    await tx.execute(sql`
      update orders o set
        package_count = v.pc, actual_weight = v.aw, volumetric_weight = v.vw,
        billed_weight = v.bw, shipped_weight = v.sw, sell_amount = v.sa, cost_amount = v.ca,
        sell_version_id = case when v.keep_sv then o.sell_version_id else v.sv end,
        cost_version_id = case when v.keep_cv then o.cost_version_id else v.cv end
      from (values ${values(orderUpdates.slice(i, i + CHUNK))}) as v(id, pc, aw, vw, bw, sw, sa, ca, sv, cv, keep_sv, keep_cv)
      where o.id = v.id`);
  }
  for (let i = 0; i < pkgUpdates.length; i += CHUNK) {
    await tx.execute(sql`
      update order_packages p set
        volumetric_weight = v.vw, chargeable_weight = v.cw,
        shipped_volumetric_weight = v.svw, shipped_chargeable_weight = v.scw
      from (values ${values(pkgUpdates.slice(i, i + CHUNK))}) as v(id, vw, cw, svw, scw)
      where p.id = v.id`);
  }
  return report;
}

/** Tính lại giá mọi đơn CHƯA khóa giá của các khách hàng (khi đổi nhóm giá / % điều chỉnh) */
export async function repriceOpenOrdersOfCustomers(tx: Tx, customerCodes: string[]): Promise<RepriceReport> {
  if (!customerCodes.length) return emptyReport();
  const ids = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(sql`${orders.priceLocked} = false and ${inArray(orders.customerCode, customerCodes)}`);
  return repriceOrders(tx, ids.map((r) => r.id));
}
