import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customerAccounts, customers } from "@/drizzle/schema";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

/** Cookie nhân viên dùng để "Xem như khách" (chỉ xem) */
export const VIEW_AS_COOKIE = "skl_view_as";

export interface PortalSession {
  customerCode: string;
  customerName: string;
  priceGroupCode: string | null;
  email: string;
  /** null khi nhân viên đang xem như khách */
  accountId: string | null;
  mustChangePassword: boolean;
  /** Nhân viên SkyLane đang xem cổng dưới tên khách — mọi thao tác ghi bị chặn */
  viewAs: { staffName: string } | null;
}

/**
 * Phiên cổng khách hàng:
 *  1. Tài khoản khách (customer_accounts, đang hoạt động, khách còn hoạt động).
 *  2. Nhân viên có quyền portal.viewAs + cookie skl_view_as = mã khách (Sale: chỉ khách mình).
 */
export const getPortalSession = cache(async (): Promise<PortalSession | null> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [acc] = await db
    .select({
      id: customerAccounts.id,
      email: customerAccounts.email,
      isActive: customerAccounts.isActive,
      mustChangePassword: customerAccounts.mustChangePassword,
      customerCode: customers.customerCode,
      customerName: customers.name,
      priceGroupCode: customers.priceGroupCode,
      customerActive: customers.isActive,
    })
    .from(customerAccounts)
    .innerJoin(customers, eq(customers.customerCode, customerAccounts.customerCode))
    .where(eq(customerAccounts.id, user.id));
  if (acc) {
    if (!acc.isActive || !acc.customerActive) return null;
    return {
      customerCode: acc.customerCode,
      customerName: acc.customerName,
      priceGroupCode: acc.priceGroupCode,
      email: acc.email,
      accountId: acc.id,
      mustChangePassword: acc.mustChangePassword,
      viewAs: null,
    };
  }

  const staff = await getSessionUser();
  if (!staff || !can(staff.role, "portal.viewAs")) return null;
  const code = (await cookies()).get(VIEW_AS_COOKIE)?.value?.trim().toUpperCase();
  if (!code) return null;
  const [c] = await db
    .select({ code: customers.customerCode, name: customers.name, priceGroupCode: customers.priceGroupCode })
    .from(customers)
    .where(and(eq(customers.customerCode, code), staff.saleScope ? eq(customers.saleUserId, staff.saleScope) : undefined));
  if (!c) return null;
  return {
    customerCode: c.code,
    customerName: c.name,
    priceGroupCode: c.priceGroupCode,
    email: staff.email,
    accountId: null,
    mustChangePassword: false,
    viewAs: { staffName: staff.fullName },
  };
});

/** Trang cổng khách: bắt buộc đăng nhập; bắt đổi mật khẩu mặc định trước khi dùng */
export async function requirePortal(opts: { allowMustChange?: boolean } = {}): Promise<PortalSession> {
  const s = await getPortalSession();
  if (!s) redirect("/portal/dang-nhap");
  if (s.mustChangePassword && !opts.allowMustChange) redirect("/portal/doi-mat-khau");
  return s;
}

/** Server action / API của cổng khách. write = thao tác ghi (bị chặn khi nhân viên đang xem như khách). */
export async function portalGuard(write: boolean): Promise<{ ok: true; s: PortalSession } | { ok: false; error: string }> {
  const s = await getPortalSession();
  if (!s) return { ok: false, error: "Phiên đăng nhập hết hạn — vui lòng đăng nhập lại." };
  if (s.mustChangePassword) return { ok: false, error: "Vui lòng đổi mật khẩu trước khi tiếp tục." };
  if (write && s.viewAs) return { ok: false, error: "Bạn đang xem cổng với tư cách khách hàng — chế độ chỉ xem." };
  return { ok: true, s };
}
