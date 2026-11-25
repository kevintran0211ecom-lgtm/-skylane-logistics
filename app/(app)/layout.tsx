import { AppSidebar } from "@/components/app-sidebar";
import { requirePage } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage();
  return (
    <div className="flex min-h-screen bg-muted/30">
      <AppSidebar user={{ fullName: user.fullName, email: user.email, role: user.role }} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
