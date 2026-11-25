import type { Currency, PricingMode } from "./engine";
import type { VersionClose } from "./versioning";

export type ImportScope =
  | { type: "DEFAULT" }
  | { type: "GROUP"; code: string }
  | { type: "CUSTOMER"; code: string };

export interface ImportOptions {
  kind: "COST" | "SELL";
  scope: ImportScope;
  effectiveFrom: string; // YYYY-MM-DD
  note: string | null;
  skipUnknownRoutes: boolean;
}

export interface ImportBlockPreview {
  sheet: string;
  cellRef: string;
  routeCode: string;
  routeName: string;
  routeExists: boolean;
  willImport: boolean;
  currency: Currency;
  mode: PricingMode;
  countryCount: number;
  zones: { zoneCode: string; countries: string[]; matrixCount: number; perKgCount: number }[];
  fixedWeights: string[];
  ranges: { label: string; weightMin: string; weightMax: string | null }[];
  warnings: string[];
  plan: { ok: true; close: VersionClose[]; newEffectiveTo: string | null } | { ok: false; error: string } | null;
  affectedOrders: number;
}

export interface ImportPreview {
  fileName: string;
  options: ImportOptions;
  scopeLabel: string;
  errors: string[];
  blocks: ImportBlockPreview[];
  canCommit: boolean;
}

export interface ImportCommitResult {
  created: { id: number; routeCode: string; zones: number; tiers: number }[];
  closed: { id: number; routeCode: string; newEffectiveTo: string }[];
}
