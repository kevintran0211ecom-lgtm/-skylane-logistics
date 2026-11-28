import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/auth", "/portal/dang-nhap"];
/** Tên miền riêng cho cổng khách hàng (VD oms.skylane.vn) — vào "/" là tới cổng khách */
const PORTAL_HOST = process.env.PORTAL_HOST?.toLowerCase();

/** Làm mới phiên Supabase & chặn mọi trang khi chưa đăng nhập */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (PORTAL_HOST && host === PORTAL_HOST && (path === "/" || path === "/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (!user && !PUBLIC.some((p) => path === p || path.startsWith(`${p}/`))) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    const url = request.nextUrl.clone();
    if (path === "/portal" || path.startsWith("/portal/")) {
      url.pathname = "/portal/dang-nhap";
      url.search = "";
      return NextResponse.redirect(url);
    }
    url.pathname = "/login";
    url.search = path !== "/" ? `?next=${encodeURIComponent(path + request.nextUrl.search)}` : "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|templates/).*)"],
};
