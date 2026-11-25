import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkyLane Logistics — Quản lý vận hành",
  description: "Hệ thống quản lý vận hành & tài chính SkyLane Logistics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
