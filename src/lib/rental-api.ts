import { callEdgeFunction } from "@/lib/api";

/** Rental row from get-rental-catalog `data` array (SMSPool). */
export interface RentalOption {
  ID: number;
  name: string;
  tag: string;
  region: string;
  /** Days as string keys → raw SMSPool price for that period (before our markup). */
  pricing: Record<string, number>;
  pool: number;
  single_service: string | null;
}

export interface GetRentalCatalogResponse {
  success: number;
  data: RentalOption[];
}

export async function fetchRentalCatalog(): Promise<GetRentalCatalogResponse> {
  return callEdgeFunction("get-rental-catalog", {}) as Promise<
    GetRentalCatalogResponse
  >;
}

/** Marked-up price for display / wallet charge; null if duration not sold for this rental. */
export function getRentalPrice(
  rental: RentalOption,
  days: number,
): number | null {
  if (rental.pricing[String(days)] !== undefined) {
    const raw = rental.pricing[String(days)];
    return Math.ceil(raw * 1.35 * 100) / 100;
  }
  return null;
}

/** Raw SMSPool price before markup — must match server + rent-number `raw_price`. */
export function getRawRentalPrice(
  rental: RentalOption,
  days: number,
): number | null {
  if (rental.pricing[String(days)] === undefined) return null;
  const raw = rental.pricing[String(days)];
  return typeof raw === "number" ? raw : parseFloat(String(raw));
}

/** 35% platform markup on raw SMSPool amount. */
export function applyRentalMarkup(raw: number): number {
  return Math.ceil(raw * 1.35 * 100) / 100;
}
