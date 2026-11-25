import { asc, sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { appUsers, customers } from "@/drizzle/schema";
import { requirePage } from "@/lib/auth/session";
import { UsersView } from "./users-view";

export const metadata = { title: "Người dùng & phân quyền — SkyLane" };

export default async function UsersPage() {
  const me = await requirePage("users.manage");
  const rows = await db
    .select({
      id: appUsers.id,
      email: appUsers.email,
      fullName: appUsers.fullName,
      role: appUsers.role,
      isActive: appUsers.isActive,
      customerCount: sql<number>`(select count(*)::int from ${customers} c where c.sale_user_id = ${appUsers.id})`,
    })
    .from(appUsers)
    .orderBy(asc(appUsers.role), asc(appUsers.fullName));
  return (
    <>
      <PageHeader
        title="Người dùng & phân quyền"
        description="Admin: toàn quyền · Kế toán: bảng kê, đối soát, công nợ, mở khóa giá · Kho: kích thước, cân, trạng thái, tuyến chỉ định (không thấy tiền) · Sale: chỉ khách mình phụ trách."
      />
      <UsersView rows={rows} meId={me.id} />
    </>
  );
}
