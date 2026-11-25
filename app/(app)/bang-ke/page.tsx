import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { listCustomerOptions } from "@/lib/catalog/queries";
import { listStatements } from "@/lib/statements/service";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { StatementsTable } from "./statements-table";

export const metadata = { title: "Bảng kê — SkyLane" };
const PAGE_SIZE = 50;

export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ q?: string; customer?: string; status?: string; page?: string }> }) {
  const user = await requirePage("statements.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = sp.status === "ACTIVE" || sp.status === "CANCELLED" ? sp.status : undefined;
  const [{ rows, total }, customers] = await Promise.all([
    listStatements({ q: sp.q, customerCode: sp.customer || undefined, status, saleUserId: user.saleScope, page, pageSize: PAGE_SIZE }),
    listCustomerOptions(user.saleScope),
  ]);
  return (
    <>
      <PageHeader
        title="Bảng kê thanh toán"
        description="Tạo bảng kê từ các vận đơn chưa lên bảng kê; đơn được khóa cứng giá. Xuất Excel đúng mẫu SkyLane."
        actions={
          can(user.role, "statements.manage") ? (
            <Link href="/bang-ke/tao" className={buttonVariants()}>
              <FilePlus2 /> Tạo bảng kê
            </Link>
          ) : undefined
        }
      />
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Mã hoặc tên bảng kê" className="w-64" aria-label="Tìm bảng kê" />
        <NativeSelect name="customer" defaultValue={sp.customer ?? ""} className="w-56" aria-label="Khách hàng">
          <option value="">Tất cả khách hàng</option>
          {customers.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={status ?? ""} className="w-40" aria-label="Trạng thái">
          <option value="">Mọi trạng thái</option>
          <option value="ACTIVE">Đang hiệu lực</option>
          <option value="CANCELLED">Đã hủy</option>
        </NativeSelect>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Lọc
        </button>
      </form>
      <StatementsTable rows={rows} total={total} page={page} pageSize={PAGE_SIZE} />
    </>
  );
}
