import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/form";
import { Alert, PageHeader } from "@/components/ui/misc";
import { listCustomerOptions } from "@/lib/catalog/queries";
import { foundStatementCodes, listStatements, STATEMENT_SORT_KEYS, type StatementSortKey } from "@/lib/statements/service";
import { missingCodes, searchMode } from "@/lib/search";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { StatementsTable } from "./statements-table";

export const metadata = { title: "Bảng kê — SkyLane" };
const PAGE_SIZE = 50;

export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; customer?: string; status?: string; page?: string; sort?: string; dir?: string }>;
}) {
  const user = await requirePage("statements.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = sp.status === "ACTIVE" || sp.status === "CANCELLED" ? sp.status : undefined;
  const sort = (STATEMENT_SORT_KEYS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as StatementSortKey) : undefined;
  const mode = searchMode(sp.q);
  const [{ rows, total }, customers, found] = await Promise.all([
    listStatements({ q: sp.q, customerCode: sp.customer || undefined, status, saleUserId: user.saleScope, sort, dir: sp.dir === "asc" ? "asc" : "desc", page, pageSize: PAGE_SIZE }),
    listCustomerOptions(user.saleScope),
    mode.kind === "codes" ? foundStatementCodes(mode.codes, user.saleScope) : [],
  ]);
  const notFound = mode.kind === "codes" ? missingCodes(mode.codes, found) : [];
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
      <form className="mb-4 flex flex-wrap items-end gap-2">
        {sort && <input type="hidden" name="sort" value={sort} />}
        {sort && <input type="hidden" name="dir" value={sp.dir === "asc" ? "asc" : "desc"} />}
        <div className="grid gap-1">
          <label htmlFor="q" className="text-xs text-muted-foreground">
            Mã bảng kê / mã vận đơn — dán nhiều mã, mỗi dòng 1 mã
          </label>
          <Textarea
            id="q"
            name="q"
            defaultValue={sp.q}
            rows={sp.q?.includes("\n") ? Math.min(6, sp.q.split("\n").length) : 1}
            placeholder={"SKL2611260001\n#AP3004"}
            className="min-h-9 w-72 resize-y py-1.5 font-mono text-xs focus:min-h-28"
            aria-label="Tìm bảng kê"
          />
        </div>
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
      {notFound.length > 0 && (
        <Alert tone="warning" className="mb-3">
          Không tìm thấy {notFound.length} mã: <span className="font-mono text-xs">{notFound.slice(0, 50).join(", ")}{notFound.length > 50 ? "…" : ""}</span>
        </Alert>
      )}
      <StatementsTable rows={rows} total={total} page={page} pageSize={PAGE_SIZE} />
    </>
  );
}
