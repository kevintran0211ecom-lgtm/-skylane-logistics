/**
 * Drizzle schema — phản chiếu sql/schema.sql (đặt tên giống output của `drizzle-kit pull`).
 * Hiện khai báo các bảng Danh mục + Kho bảng giá. Khi cần đủ 17 bảng, chạy `npm run db:pull`
 * để sinh lại toàn bộ file này từ DB (sql/schema.sql vẫn là nguồn sự thật).
 * NUMERIC được Drizzle trả về dạng string — giữ nguyên, không ép sang number.
 */
import {
  bigint,
  boolean,
  char,
  date,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

// --- Enums -------------------------------------------------------------------
export const orderStatus = pgEnum("order_status", ["Phát sinh", "Đã nhận kho", "Đã xuất hàng", "Đã giao hàng", "Hoàn"]);
export const debtStatus = pgEnum("debt_status", ["Chưa thanh toán", "xuất bảng kê", "Thanh toán 1 phần", "Đã thanh toán"]);
export const serviceType = pgEnum("service_type", ["EPK", "CPN", "CT"]);
export const weightCalcMode = pgEnum("weight_calc_mode", ["ACTUAL_ONLY", "MAX_ACTUAL_VOL"]);
export const priceKind = pgEnum("price_kind", ["COST", "SELL"]);
export const pricingStatus = pgEnum("pricing_status", ["DRAFT", "ACTIVE", "ARCHIVED"]);
export const pricingMode = pgEnum("pricing_mode", ["MA_TRAN", "THEO_KG", "MA_TRAN+THEO_KG"]);
export const userRole = pgEnum("user_role", ["ADMIN", "KE_TOAN", "SALE", "KHO"]);
export const syncSourceType = pgEnum("sync_source_type", ["NONE", "GOOGLE_SHEET", "API"]);

// --- Danh mục ----------------------------------------------------------------
export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: userRole("role").notNull().default("SALE"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const priceGroups = pgTable("price_groups", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  note: text("note"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const customers = pgTable("customers", {
  customerCode: text("customer_code").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  saleUserId: uuid("sale_user_id").references(() => appUsers.id, { onDelete: "set null" }),
  priceGroupCode: text("price_group_code").references(() => priceGroups.code, { onUpdate: "cascade" }),
  priceAdjustPct: numeric("price_adjust_pct", { precision: 6, scale: 2 }).notNull().default("0"),
  currency: char("currency", { length: 3 }).notNull().default("VND"),
  syncSourceType: syncSourceType("sync_source_type").notNull().default("NONE"),
  syncEnabled: boolean("sync_enabled").notNull().default(false),
  syncConfig: jsonb("sync_config").$type<{ url?: string; sheet?: string }>().notNull().default({}),
  lastSyncedAt: ts("last_synced_at"),
  isActive: boolean("is_active").notNull().default(true),
  note: text("note"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  supplierCode: text("supplier_code").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact"),
  note: text("note"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const routes = pgTable("routes", {
  routeCode: text("route_code").primaryKey(),
  name: text("name").notNull(),
  supplierCode: text("supplier_code").references(() => suppliers.supplierCode, { onUpdate: "cascade" }),
  serviceType: serviceType("service_type").notNull(),
  weightCalcMode: weightCalcMode("weight_calc_mode").notNull().default("MAX_ACTUAL_VOL"),
  dimDivisor: numeric("dim_divisor", { precision: 10, scale: 2 }).notNull().default("5000"),
  isActive: boolean("is_active").notNull().default(true),
  note: text("note"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// --- Kho bảng giá ------------------------------------------------------------
export const pricingVersions = pgTable("pricing_versions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  routeCode: text("route_code").notNull().references(() => routes.routeCode, { onUpdate: "cascade" }),
  priceKind: priceKind("price_kind").notNull(),
  customerCode: text("customer_code").references(() => customers.customerCode, { onUpdate: "cascade" }),
  priceGroupCode: text("price_group_code").references(() => priceGroups.code, { onUpdate: "cascade" }),
  name: text("name").notNull(),
  pricingMode: pricingMode("pricing_mode").notNull().default("MA_TRAN+THEO_KG"),
  currency: char("currency", { length: 3 }).notNull().default("VND"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  status: pricingStatus("status").notNull().default("DRAFT"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const pricingZones = pgTable("pricing_zones", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  versionId: bigint("version_id", { mode: "number" })
    .notNull()
    .references(() => pricingVersions.id, { onDelete: "cascade" }),
  zoneCode: text("zone_code").notNull(),
  zoneName: text("zone_name"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const pricingZoneCountries = pgTable(
  "pricing_zone_countries",
  {
    versionId: bigint("version_id", { mode: "number" }).notNull(),
    iso2: char("iso2", { length: 2 }).notNull(),
    zoneId: bigint("zone_id", { mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.versionId, t.iso2] }),
    foreignKey({ columns: [t.zoneId, t.versionId], foreignColumns: [pricingZones.id, pricingZones.versionId] }).onDelete("cascade"),
  ],
);

export const pricingMatrixTiers = pgTable("pricing_matrix_tiers", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  zoneId: bigint("zone_id", { mode: "number" })
    .notNull()
    .references(() => pricingZones.id, { onDelete: "cascade" }),
  weightMax: numeric("weight_max", { precision: 12, scale: 3 }).notNull(),
  price: numeric("price", { precision: 18, scale: 2 }).notNull(),
});

export const pricingPerKgTiers = pgTable("pricing_per_kg_tiers", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  zoneId: bigint("zone_id", { mode: "number" })
    .notNull()
    .references(() => pricingZones.id, { onDelete: "cascade" }),
  weightMin: numeric("weight_min", { precision: 12, scale: 3 }).notNull(),
  weightMax: numeric("weight_max", { precision: 12, scale: 3 }),
  unitPrice: numeric("unit_price", { precision: 18, scale: 2 }).notNull(),
});

// --- Vận đơn -----------------------------------------------------------------
export const orderSource = pgEnum("order_source", ["MANUAL", "IMPORT", "SYNC"]);

export const orders = pgTable("orders", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  customerCode: text("customer_code").notNull().references(() => customers.customerCode, { onUpdate: "cascade" }),
  billCode: text("bill_code").notNull(),
  orderKey: text("order_key").generatedAlwaysAs(sql`customer_code || '|' || bill_code`),
  trackingNumber: text("tracking_number"),
  source: orderSource("source").notNull().default("MANUAL"),
  routeCode: text("route_code").notNull().references(() => routes.routeCode, { onUpdate: "cascade" }),
  assignedRouteCode: text("assigned_route_code").notNull().references(() => routes.routeCode, { onUpdate: "cascade" }),
  destinationIso2: char("destination_iso2", { length: 2 }).notNull(),
  status: orderStatus("status").notNull().default("Phát sinh"),
  debtStatus: debtStatus("debt_status").notNull().default("Chưa thanh toán"),
  createdAt: ts("created_at").notNull().defaultNow(),
  receivedAt: ts("received_at"),
  shippedAt: ts("shipped_at"),
  deliveredAt: ts("delivered_at"),
  pricingDate: date("pricing_date").generatedAlwaysAs(sql`(timezone('Asia/Saigon', COALESCE(shipped_at, created_at)))::date`),
  packageCount: integer("package_count").notNull().default(0),
  actualWeight: numeric("actual_weight", { precision: 12, scale: 3 }).notNull().default("0"),
  volumetricWeight: numeric("volumetric_weight", { precision: 12, scale: 3 }).notNull().default("0"),
  billedWeight: numeric("billed_weight", { precision: 12, scale: 3 }).notNull().default("0"),
  shippedWeight: numeric("shipped_weight", { precision: 12, scale: 3 }).notNull().default("0"),
  sellAmount: numeric("sell_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  surchargeAmount: numeric("surcharge_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  costAmount: numeric("cost_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).generatedAlwaysAs(sql`sell_amount + surcharge_amount`),
  profit: numeric("profit", { precision: 18, scale: 2 }).generatedAlwaysAs(sql`sell_amount + surcharge_amount - cost_amount`),
  sellVersionId: bigint("sell_version_id", { mode: "number" }).references(() => pricingVersions.id, { onDelete: "set null" }),
  costVersionId: bigint("cost_version_id", { mode: "number" }).references(() => pricingVersions.id, { onDelete: "set null" }),
  manualOverrides: text("manual_overrides").array().notNull().default(sql`'{}'::text[]`),
  priceLocked: boolean("price_locked").notNull().default(false),
  priceLockedAt: ts("price_locked_at"),
  priceLockedBy: uuid("price_locked_by").references(() => appUsers.id, { onDelete: "set null" }),
  senderName: text("sender_name"),
  receiverName: text("receiver_name"),
  receiverPhone: text("receiver_phone"),
  receiverEmail: text("receiver_email"),
  receiverAddress: text("receiver_address"),
  receiverCity: text("receiver_city"),
  receiverState: text("receiver_state"),
  receiverPostalCode: text("receiver_postal_code"),
  goodsDescription: text("goods_description"),
  hsCode: text("hs_code"),
  declaredValueUsd: numeric("declared_value_usd", { precision: 14, scale: 2 }),
  customsItems: jsonb("customs_items").notNull().default([]),
  note: text("note"),
  internalNote: text("internal_note"),
  rowVersion: integer("row_version").notNull().default(1),
  createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
  updatedBy: uuid("updated_by").references(() => appUsers.id, { onDelete: "set null" }),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const orderPackages = pgTable("order_packages", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  orderId: bigint("order_id", { mode: "number" })
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  lengthCm: numeric("length_cm", { precision: 10, scale: 2 }).notNull().default("0"),
  widthCm: numeric("width_cm", { precision: 10, scale: 2 }).notNull().default("0"),
  heightCm: numeric("height_cm", { precision: 10, scale: 2 }).notNull().default("0"),
  actualWeight: numeric("actual_weight", { precision: 12, scale: 3 }).notNull().default("0"),
  volumetricWeight: numeric("volumetric_weight", { precision: 12, scale: 3 }).notNull().default("0"),
  chargeableWeight: numeric("chargeable_weight", { precision: 12, scale: 3 }).notNull().default("0"),
  shippedVolumetricWeight: numeric("shipped_volumetric_weight", { precision: 12, scale: 3 }).notNull().default("0"),
  shippedChargeableWeight: numeric("shipped_chargeable_weight", { precision: 12, scale: 3 }).notNull().default("0"),
  note: text("note"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// --- Bảng kê -----------------------------------------------------------------
export const docStatus = pgEnum("doc_status", ["ACTIVE", "CANCELLED"]);

export const statements = pgTable("statements", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  statementNo: text("statement_no").notNull().unique(),
  name: text("name").notNull().default(""),
  customerCode: text("customer_code").notNull().references(() => customers.customerCode, { onUpdate: "cascade" }),
  periodFrom: date("period_from"),
  periodTo: date("period_to"),
  issuedAt: ts("issued_at").notNull().defaultNow(),
  currency: char("currency", { length: 3 }).notNull().default("VND"),
  orderCount: integer("order_count").notNull().default(0),
  totalWeight: numeric("total_weight", { precision: 12, scale: 3 }).notNull().default("0"),
  subtotalAmount: numeric("subtotal_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  adjustmentAmount: numeric("adjustment_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).generatedAlwaysAs(sql`subtotal_amount + adjustment_amount`),
  paidAmount: numeric("paid_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  balanceAmount: numeric("balance_amount", { precision: 18, scale: 2 }).generatedAlwaysAs(sql`subtotal_amount + adjustment_amount - paid_amount`),
  debtStatus: debtStatus("debt_status").notNull().default("xuất bảng kê"),
  status: docStatus("status").notNull().default("ACTIVE"),
  filePath: text("file_path"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  cancelledAt: ts("cancelled_at"),
  cancelledBy: uuid("cancelled_by").references(() => appUsers.id, { onDelete: "set null" }),
  cancelReason: text("cancel_reason"),
});

export const statementItems = pgTable("statement_items", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  statementId: bigint("statement_id", { mode: "number" })
    .notNull()
    .references(() => statements.id, { onDelete: "cascade" }),
  orderId: bigint("order_id", { mode: "number" })
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  isActive: boolean("is_active").notNull().default(true),
  lineNo: integer("line_no").notNull(),
  orderKey: text("order_key").notNull(),
  billCode: text("bill_code").notNull(),
  shippedDate: date("shipped_date"),
  routeCode: text("route_code").notNull(),
  destinationIso2: char("destination_iso2", { length: 2 }).notNull(),
  receiverName: text("receiver_name"),
  packageCount: integer("package_count").notNull().default(0),
  billedWeight: numeric("billed_weight", { precision: 12, scale: 3 }).notNull(),
  sellAmount: numeric("sell_amount", { precision: 18, scale: 2 }).notNull(),
  surchargeAmount: numeric("surcharge_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull(),
  snapshot: jsonb("snapshot").$type<{ trackingNumber?: string | null; note?: string | null; createdAt?: string }>().notNull().default({}),
});

// --- Phiếu thu ---------------------------------------------------------------
export const paymentMethod = pgEnum("payment_method", ["CHUYEN_KHOAN", "TIEN_MAT", "KHAC"]);

export const receipts = pgTable("receipts", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  receiptNo: text("receipt_no").notNull().unique(),
  customerCode: text("customer_code").notNull().references(() => customers.customerCode, { onUpdate: "cascade" }),
  receivedAt: ts("received_at").notNull().defaultNow(),
  currency: char("currency", { length: 3 }).notNull().default("VND"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  allocatedAmount: numeric("allocated_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  overpaidAmount: numeric("overpaid_amount", { precision: 18, scale: 2 }).generatedAlwaysAs(sql`amount - allocated_amount`),
  method: paymentMethod("method").notNull().default("CHUYEN_KHOAN"),
  receivedAccount: text("received_account").notNull().default("MSB - 3812042003 (HOANG THU THAO)"),
  bankRef: text("bank_ref"),
  payerName: text("payer_name"),
  proofImages: text("proof_images").array().notNull().default(sql`'{}'::text[]`),
  status: docStatus("status").notNull().default("ACTIVE"),
  note: text("note"),
  createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  cancelledAt: ts("cancelled_at"),
  cancelledBy: uuid("cancelled_by").references(() => appUsers.id, { onDelete: "set null" }),
});

export const receiptAllocations = pgTable("receipt_allocations", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  receiptId: bigint("receipt_id", { mode: "number" })
    .notNull()
    .references(() => receipts.id, { onDelete: "cascade" }),
  statementId: bigint("statement_id", { mode: "number" })
    .notNull()
    .references(() => statements.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
});
