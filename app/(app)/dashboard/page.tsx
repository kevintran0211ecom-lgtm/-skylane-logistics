import { asc, eq } from "drizzle-orm";
import { buttonVariants } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/form";
import { Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { appUsers } from "@/drizzle/schema";
import { requirePage } from "@/lib/auth/session";
import { listCustomerOptions } from "@/lib/catalog/queries";
import { getDashboard } from "@/lib/dashboard/queries";
import { isIsoDate } from "@/lib/pricing/versioning";
import { formatMoney } from "@/lib/utils";
import { RevenueChart } from "./revenue-chart";

export const metadata = { title: "Tổng quan — SkyLane" };

type SP = { from?: string; to?: string; g?: string; customer?: string; sale?: string };

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Saigon" }).format(new Date());

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("dashboard.view");
  const sp = await searchParams;
  const to = sp.to && isIsoDate(sp.to) ? sp.to : today();
  const from = sp.from && isIsoDate(sp.from) ? sp.from : `${to.slice(0, 8)}01`;
  const granularity = sp.g === "month" ? "month" : "day";
  // SALE luôn bị giới hạn ở khách hàng của mình
  const saleUserId = user.saleScope ?? (sp.sale || undefined);

  const [customers, sales] = await Promise.all([
    listCustomerOptions(user.saleScope),
    user.saleScope
      ? Promise.resolve([])
      : db.select({ id: appUsers.id, name: appUsers.fullName }).from(appUsers).where(eq(appUsers.role, "SALE")).orderBy(asc(appUsers.fullName)),
  ]);
  const customerCode = customers.some((c) => c.code === sp.customer) ? sp.customer : undefined;
  const d = await getDashboard({ from, to, granularity, customerCode, saleUserId });
  const margin = d.totals.revenue ? (d.totals.profit / d.totals.revenue) * 100 : 0;

  return (
    <>
      <PageHeader title="Tổng quan" description={user.saleScope ? "Số liệu các khách hàng bạn phụ trách." : "Doanh thu, giá vốn, lợi nhuận theo Ngày gửi hàng; công nợ phải thu tại thời điểm hiện tại."} />

      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Từ ngày
          <Input type="date" name="from" defaultValue={from} className="w-40" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Đến ngày
          <Input type="date" name="to" defaultValue={to} className="w-40" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Xem theo
          <NativeSelect name="g" defaultValue={granularity} className="w-28">
            <option value="day">Ngày</option>
            <option value="month">Tháng</option>
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Khách hàng
          <NativeSelect name="customer" defaultValue={customerCode ?? ""} className="w-52">
            <option value="">Tất cả</option>
            {customers.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        {!user.saleScope && (
          <label className="grid gap-1 text-xs text-muted-foreground">
            Nhân viên Sale
            <NativeSelect name="sale" defaultValue={sp.sale ?? ""} className="w-44">
              <option value="">Tất cả</option>
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <button type="submit" className={buttonVariants()}>
          Xem
        </button>
      </form>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Doanh thu" value={d.totals.revenue} sub={`${d.totals.orders.toLocaleString("vi-VN")} đơn · ${d.totals.weight.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} kg tính phí`} dot="var(--series-1)" />
        <Kpi label="Giá vốn" value={d.totals.cost} dot="var(--series-2)" />
        <Kpi label="Lợi nhuận" value={d.totals.profit} sub={`Biên lợi nhuận ${margin.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`} dot="var(--series-3)" />
        <Kpi
          label="Tổng công nợ phải thu"
          value={d.receivable.total}
          sub={`Đã lên bảng kê ${formatMoney(d.receivable.billed)} (${d.receivable.billedStatements} BK) · Chưa lên bảng kê ${formatMoney(d.receivable.unbilled)} (${d.receivable.unbilledOrders} đơn)`}
          strong
        />
      </div>

      <Card className="mb-4 p-4">
        <RevenueChart points={d.points} granularity={granularity} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Breakdown title="Theo khách hàng (top 10)" rows={d.byCustomer.map((c) => ({ key: c.code, label: `${c.code} — ${c.name}`, ...c }))} />
        {!user.saleScope && <Breakdown title="Theo nhân viên Sale" rows={d.bySale.map((s) => ({ key: s.saleId ?? "none", label: s.sale, ...s }))} />}
      </div>
    </>
  );
}

function Kpi({ label, value, sub, dot, strong }: { label: string; value: number; sub?: string; dot?: string; strong?: boolean }) {
  return (
    <Card className={strong ? "border-primary/40 p-4" : "p-4"}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {dot && <span className="inline-block size-2 rounded-full" style={{ background: dot }} />}
        {label}
      </p>
      <p className={`mt-1 font-semibold tabular-nums ${strong ? "text-2xl text-primary" : "text-2xl"}`}>
        {formatMoney(value)} <span className="text-sm font-normal text-muted-foreground">đ</span>
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { key: string; label: string; orders: number; revenue: number; cost: number; profit: number }[] }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Tên</TH>
            <TH className="text-right">Đơn</TH>
            <TH className="text-right">Doanh thu</TH>
            <TH className="text-right">Giá vốn</TH>
            <TH className="text-right">Lợi nhuận</TH>
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 && (
            <TR>
              <TD colSpan={5} className="h-16 text-center text-muted-foreground">
                Không có dữ liệu trong khoảng đã chọn.
              </TD>
            </TR>
          )}
          {rows.map((r) => (
            <TR key={r.key}>
              <TD className="max-w-56 truncate font-medium">{r.label}</TD>
              <TD className="text-right tabular-nums">{r.orders.toLocaleString("vi-VN")}</TD>
              <TD className="text-right tabular-nums">{formatMoney(r.revenue)}</TD>
              <TD className="text-right tabular-nums text-muted-foreground">{formatMoney(r.cost)}</TD>
              <TD className={`text-right font-medium tabular-nums ${r.profit < 0 ? "text-destructive" : ""}`}>{formatMoney(r.profit)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
