import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, priceGroups, routes } from "@/drizzle/schema";
import { loadPricingCatalog } from "./catalog";
import type { PackageInput, ServiceType } from "./engine";
import { quoteSellRoutes, type SellQuoteResult } from "./sell-quote";

export interface SellQuoteInput {
  customerCode: string;
  iso2: string;
  date: string; // YYYY-MM-DD — ngày áp giá
  packages: PackageInput[];
  supplierCode?: string | null;
  serviceType?: ServiceType | null;
  saleScope?: string | null; // SALE: chỉ khách mình phụ trách
}

export interface SellQuoteCustomerInfo {
  customerCode: string;
  name: string;
  priceGroupCode: string | null;
  groupName: string | null;
  groupAdjustPct: string | null;
  priceAdjustPct: string;
}

/** Giá bán mọi tuyến đang hoạt động cho 1 khách — cùng engine & thứ tự ưu tiên như khi tính vận đơn. */
export async function quoteSellForCustomer(
  input: SellQuoteInput,
): Promise<{ customer: SellQuoteCustomerInfo; result: SellQuoteResult } | { error: string }> {
  const [c] = await db
    .select({
      customerCode: customers.customerCode,
      name: customers.name,
      saleUserId: customers.saleUserId,
      priceGroupCode: customers.priceGroupCode,
      groupName: priceGroups.name,
      groupAdjustPct: priceGroups.adjustPct,
      priceAdjustPct: customers.priceAdjustPct,
    })
    .from(customers)
    .leftJoin(priceGroups, eq(priceGroups.code, customers.priceGroupCode))
    .where(eq(customers.customerCode, input.customerCode))
    .limit(1);
  if (!c || (input.saleScope && c.saleUserId !== input.saleScope)) return { error: `Không tìm thấy khách hàng ${input.customerCode}.` };

  const routeRows = await db
    .select({ routeCode: routes.routeCode, supplierCode: routes.supplierCode })
    .from(routes)
    .where(
      and(
        eq(routes.isActive, true),
        input.supplierCode ? eq(routes.supplierCode, input.supplierCode) : undefined,
        input.serviceType ? eq(routes.serviceType, input.serviceType) : undefined,
      ),
    )
    .orderBy(asc(routes.routeCode));

  const catalog = await loadPricingCatalog(db, routeRows.map((r) => r.routeCode), input.date, input.date);
  const { saleUserId: _s, ...customer } = c;
  const result = quoteSellRoutes(
    catalog,
    { customerCode: c.customerCode, priceGroupCode: c.priceGroupCode, groupAdjustPct: c.groupAdjustPct, priceAdjustPct: c.priceAdjustPct },
    routeRows,
    { iso2: input.iso2, date: input.date, packages: input.packages },
  );
  return { customer, result };
}
