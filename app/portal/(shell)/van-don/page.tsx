import { PageHeader } from "@/components/ui/misc";
import { requirePortal } from "@/lib/portal/session";
import { listPortalOrders, portalRoutes } from "@/lib/portal/queries";
import { PORTAL_TABS, type PortalTab } from "@/lib/portal/rules";
import { PortalOrdersView } from "./orders-view";

export const metadata = { title: "Vận đơn — Cổng khách hàng SkyLane" };
const PAGE_SIZE = 50;
type SP = { tab?: string; q?: string; from?: string; to?: string; page?: string };
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function PortalOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requirePortal();
  const sp = await searchParams;
  const tab = (PORTAL_TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as PortalTab) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const filter = { tab, q: (sp.q ?? "").slice(0, 100_000), from: isDate(sp.from) ? sp.from : undefined, to: isDate(sp.to) ? sp.to : undefined };
  const [data, routes] = await Promise.all([listPortalOrders(s.customerCode, { ...filter, page, pageSize: PAGE_SIZE }), portalRoutes(s.customerCode, s.priceGroupCode)]);
  return (
    <>
      <PageHeader title="Vận đơn" description="Theo dõi đơn đã gửi: chờ xác nhận, trạng thái vận chuyển, cân nặng và thành tiền. Sửa được đơn khi còn Chờ xác nhận hoặc Phát sinh." />
      <PortalOrdersView {...data} filter={filter} page={page} pageSize={PAGE_SIZE} routes={routes} viewAs={!!s.viewAs} />
    </>
  );
}
