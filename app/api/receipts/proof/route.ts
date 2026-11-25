import { and, eq } from "drizzle-orm";
import { signedProofUrl } from "@/lib/storage";
import { authorize } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { customers } from "@/drizzle/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Xem ảnh minh chứng: chuyển hướng tới signed URL ngắn hạn của bucket riêng tư */
export async function GET(req: Request) {
  let user;
  try {
    user = await authorize("receipts.view");
  } catch {
    return new Response("Không có quyền", { status: 403 });
  }
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!/^[^/.][^/]*\/\d{4}-\d{2}\/[0-9a-f-]{36}\.(png|jpg|webp|gif)$/i.test(path)) {
    return new Response("Đường dẫn ảnh không hợp lệ", { status: 400 });
  }
  if (user.saleScope) {
    const code = path.split("/")[0];
    const own = await db.select({ c: customers.customerCode }).from(customers).where(and(eq(customers.customerCode, code), eq(customers.saleUserId, user.saleScope)));
    if (!own.length) return new Response("Không có quyền", { status: 403 });
  }
  try {
    return Response.redirect(await signedProofUrl(path), 302);
  } catch {
    return new Response("Không mở được ảnh minh chứng", { status: 404 });
  }
}
