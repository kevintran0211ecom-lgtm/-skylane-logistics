import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// sql/schema.sql là nguồn sự thật. `npm run db:pull` sinh drizzle/schema.ts + relations.ts từ DB.
export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
});
