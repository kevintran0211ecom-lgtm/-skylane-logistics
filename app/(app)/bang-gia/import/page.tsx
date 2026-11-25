import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { listCustomerOptions, listPriceGroups } from "@/lib/catalog/queries";
import { ImportForm } from "./import-form";
import { requirePage } from "@/lib/auth/session";

export const metadata = { title: "Import bảng giá — SkyLane" };

export default async function ImportPage() {
  await requirePage("pricing.manage");
  const [groups, customers] = await Promise.all([listPriceGroups(), listCustomerOptions()]);
  return (
    <>
      <Link href="/bang-gia" className={buttonVariants({ variant: "link", className: "mb-2 h-auto px-0" })}>
        <ArrowLeft /> Kho bảng giá
      </Link>
      <PageHeader
        title="Import bảng giá Excel"
        description="Ma trận ngang: dòng 1 tên tuyến (gộp ô theo cụm), dòng 2 “Khối lượng (KG)” + các cột nước “US – Mỹ (VND)”."
      />
      <ImportForm groups={groups} customers={customers} />
    </>
  );
}
