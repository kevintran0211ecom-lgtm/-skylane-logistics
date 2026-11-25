import Link from "next/link";
import { ArrowLeft, Filter } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/misc";
import { listCustomerOptions } from "@/lib/catalog/queries";
import { listUnbilledOrders } from "@/lib/statements/service";
import { isIsoDate } from "@/lib/pricing/versioning";
import { CreateStatementForm } from "./create-statement-form";
import { requirePage } from "@/lib/auth/session";

export const metadata = { title: "Tạo bảng kê — SkyLane" };

export default async function CreateStatementPage({ searchParams }: { searchParams: Promise<{ customer?: string; from?: string; to?: string }> }) {
  await requirePage("statements.manage");
  const sp = await searchParams;
  const from = sp.from && isIsoDate(sp.from) ? sp.from : undefined;
  const to = sp.to && isIsoDate(sp.to) ? sp.to : undefined;
  const customers = await listCustomerOptions();
  const customer = customers.find((c) => c.code === sp.customer);
  const orders = customer ? await listUnbilledOrders({ customerCode: customer.code, from, to }) : [];

  return (
    <>
      <Link href="/bang-ke" className={buttonVariants({ variant: "link", className: "mb-2 h-auto px-0" })}>
        <ArrowLeft /> Bảng kê
      </Link>
      <PageHeader title="Tạo bảng kê" description="Lọc vận đơn chưa lên bảng kê theo khách hàng và Ngày gửi hàng, tick chọn rồi bấm “Tạo bảng kê”." />
      <Card className="mb-4 p-4">
        <form className="grid items-end gap-3 sm:grid-cols-[1fr_170px_170px_auto]">
          <Field label="Khách hàng" htmlFor="customer">
            <NativeSelect id="customer" name="customer" defaultValue={customer?.code ?? ""} required>
              <option value="" disabled>
                — Chọn khách hàng —
              </option>
              {customers.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Từ ngày gửi" htmlFor="from">
            <Input id="from" name="from" type="date" defaultValue={from} />
          </Field>
          <Field label="Đến ngày gửi" htmlFor="to">
            <Input id="to" name="to" type="date" defaultValue={to} />
          </Field>
          <Button type="submit" variant="outline">
            <Filter /> Lọc đơn
          </Button>
        </form>
      </Card>
      {customer && <CreateStatementForm key={`${customer.code}|${from}|${to}`} customer={customer} orders={orders} from={from} to={to} />}
    </>
  );
}
