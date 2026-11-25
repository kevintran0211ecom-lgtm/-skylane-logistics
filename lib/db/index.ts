import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/drizzle/schema";
import * as relations from "@/drizzle/relations";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu biến môi trường DATABASE_URL");

// Giữ 1 pool duy nhất khi dev hot-reload
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

const client =
  globalForDb.pg ??
  postgres(url, {
    max: 10,
    prepare: false, // bắt buộc khi dùng Supabase transaction pooler (cổng 6543)
    connection: { TimeZone: "Asia/Saigon" },
  });

if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema: { ...schema, ...relations } });
export type DB = typeof db;
/** Kiểu transaction để truyền vào service (tạo/hủy bảng kê, ghi phiếu thu...) */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
