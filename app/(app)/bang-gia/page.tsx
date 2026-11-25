import Link from "next/link";
import { Download, Upload } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { listRoutes } from "@/lib/catalog/queries";
import { listVersions } from "@/lib/pricing/queries";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { VersionsTable } from "./versions-table";

export const metadata = { title: "Kho bảng giá — SkyLane" };
const PAGE_SIZE = 50;

type SP = { route?: string; kind?: string; status?: string; page?: string };

export default async function PricingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePage("pricing.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const kind = sp.kind === "COST" || sp.kind === "SELL" ? sp.kind : undefined;
  const status = sp.status === "DRAFT" || sp.status === "ACTIVE" || sp.status === "ARCHIVED" ? sp.status : undefined;
  const [{ rows, total }, routes] = await Promise.all([
    listVersions({ routeCode: sp.route || undefined, kind, status, page, pageSize: PAGE_SIZE }),
    listRoutes(),
  ]);

  return (
    <>
      <PageHeader
        title="Kho bảng giá"
        description="Mỗi lần nhập bảng giá tạo một phiên bản theo ngày hiệu lực; phiên bản cũ được giữ nguyên để tính đúng đơn quá khứ."
        actions={
          <>
            <a href="/templates/mau-bang-gia.xlsx" download className={buttonVariants({ variant: "outline" })}>
              <Download /> File mẫu
            </a>
            {can(user.role, "pricing.manage") && (
              <Link href="/bang-gia/import" className={buttonVariants()}>
                <Upload /> Import Excel
              </Link>
            )}
          </>
        }
      />
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <NativeSelect name="route" defaultValue={sp.route ?? ""} className="w-48" aria-label="Tuyến">
          <option value="">Tất cả tuyến</option>
          {routes.map((r) => (
            <option key={r.routeCode} value={r.routeCode}>
              {r.routeCode}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="kind" defaultValue={kind ?? ""} className="w-36" aria-label="Loại giá">
          <option value="">Giá gốc & bán</option>
          <option value="COST">Giá gốc</option>
          <option value="SELL">Giá bán</option>
        </NativeSelect>
        <NativeSelect name="status" defaultValue={status ?? ""} className="w-40" aria-label="Trạng thái">
          <option value="">Mọi trạng thái</option>
          <option value="ACTIVE">Đang áp dụng</option>
          <option value="DRAFT">Nháp</option>
          <option value="ARCHIVED">Lưu trữ</option>
        </NativeSelect>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Lọc
        </button>
      </form>
      <VersionsTable rows={rows} total={total} page={page} pageSize={PAGE_SIZE} />
    </>
  );
}
