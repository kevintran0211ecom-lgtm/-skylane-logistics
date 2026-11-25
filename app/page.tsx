import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/permissions";

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? homeFor(user.role) : "/khong-co-quyen?reason=account");
}
