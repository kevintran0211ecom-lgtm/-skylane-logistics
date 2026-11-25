import { NativeSelect } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { listCustomerOptions } from "@/lib/catalog/queries";
import { getCustomerDebt, previewReceiptNo } from "@/lib/receipts/service";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { ReconcileView } from "./reconcile-view";

export const metadata = { title: "Đối soát thu tiền — SkyLane" };

export default async function ReconcilePage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const user = await requirePage("receipts.view");
  const sp = await searchParams;
  const customers = await listCustomerOptions(user.saleScope);
  const customer = customers.find((c) => c.code === sp.customer);
  const [debt, nextNo] = customer ? await Promise.all([getCustomerDebt(customer.code), previewReceiptNo()]) : [null, null];

  return (
    <>
      <PageHeader title="Đối soát thu tiền" description="Ghi nhận phiếu thu, phân bổ vào bảng kê và cập nhật công nợ khách hàng." />
      <Card className="mb-4 p-3">
        <form className="flex flex-wrap items-center gap-2">
          <label htmlFor="customer" className="text-sm font-medium">
            Khách hàng
          </label>
          <NativeSelect id="customer" name="customer" defaultValue={customer?.code ?? ""} className="w-72" required>
            <option value="" disabled>
              — Chọn khách hàng —
            </option>
            {customers.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </NativeSelect>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            Mở công nợ
          </button>
        </form>
      </Card>
      {customer && debt && nextNo ? (
        <ReconcileView key={`${customer.code}-${debt.history[0]?.id ?? 0}`} customer={customer} debt={debt} nextReceiptNo={nextNo} canManage={can(user.role, "receipts.manage")} />
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">Chọn khách hàng để xem công nợ và lập phiếu thu.</Card>
      )}
    </>
  );
}
