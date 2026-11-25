import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs & postgres chỉ chạy phía server
  serverExternalPackages: ["exceljs", "postgres", "qrcode"],
  experimental: {
    // file Excel bảng giá gửi qua server action (mặc định chỉ 1 MB)
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
