// ============================================================
// Shared: SMSPool ID → human-readable name resolution
//
// SMSPool's price / purchase / order responses carry only numeric service and
// country IDs — never the names. The names live in the catalog lists
// (service/retrieve_all, country/retrieve_all, each item { ID, name }). This
// helper resolves an ID to its label and caches the catalog in the
// smspool_services / smspool_countries lookup tables so the hot path is a single
// indexed read, not a full catalog fetch.
//
// Used by order-number and rent-number so neither ever writes a numeric ID into
// a *_name column again.
// ============================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type SmsPoolKind = "service" | "country";

export const CATALOG: Record<
  SmsPoolKind,
  { table: string; endpoint: string; listKeys: string[] }
> = {
  service: {
    table: "smspool_services",
    endpoint: "https://api.smspool.net/service/retrieve_all",
    listKeys: ["services", "data"],
  },
  country: {
    table: "smspool_countries",
    endpoint: "https://api.smspool.net/country/retrieve_all",
    listKeys: ["countries", "data"],
  },
};

export interface CatalogRow {
  id: string;
  name: string;
}

/** True for values that must never be shown as a label: blank or a bare ID. */
export function isBlankOrNumeric(v: string | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === "" || /^[0-9]+$/.test(s);
}

function extractList(
  json: unknown,
  listKeys: string[],
): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === "object") {
    for (const k of listKeys) {
      const v = (json as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

/** Fetch the full catalog for a kind, normalized to { id, name } rows. */
export async function fetchCatalogByKind(
  smsPoolKey: string,
  kind: SmsPoolKind,
): Promise<CatalogRow[]> {
  const cfg = CATALOG[kind];
  const fd = new FormData();
  fd.append("key", smsPoolKey);
  const res = await fetch(cfg.endpoint, { method: "POST", body: fd });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return extractList(json, cfg.listKeys)
    .map((row) => ({
      id: String(row.ID ?? row.id ?? "").trim(),
      name: String(
        row.name ?? row.Name ?? row.service_name ?? row.country_name ?? "",
      ).trim(),
    }))
    .filter((r) => r.id !== "" && r.name !== "");
}

async function upsertCatalog(
  supabase: SupabaseClient,
  kind: SmsPoolKind,
  rows: CatalogRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const stamp = new Date().toISOString();
  const { error } = await supabase
    .from(CATALOG[kind].table)
    .upsert(
      rows.map((r) => ({ id: r.id, name: r.name, updated_at: stamp })),
      { onConflict: "id" },
    );
  if (error) {
    console.error(`upsert ${CATALOG[kind].table} failed:`, error.message);
    return 0;
  }
  return rows.length;
}

/**
 * Resolve one SMSPool id to its name. Never throws — resolution is best-effort,
 * so the caller decides the fallback (keep the id, use a placeholder, …).
 * Order: lookup table → live catalog (which also refreshes the table) → null.
 */
export async function resolveName(
  supabase: SupabaseClient,
  smsPoolKey: string,
  kind: SmsPoolKind,
  id: string | null | undefined,
): Promise<string | null> {
  const wanted = String(id ?? "").trim();
  if (wanted === "") return null;

  // 1. Cached lookup (table may not exist yet on a fresh DB — tolerate that).
  try {
    const { data } = await supabase
      .from(CATALOG[kind].table)
      .select("name")
      .eq("id", wanted)
      .maybeSingle();
    const cached = (data as { name?: string } | null)?.name;
    if (cached && cached.trim() !== "") return cached;
  } catch (err) {
    console.error(`lookup ${CATALOG[kind].table} failed:`, err);
  }

  // 2. Live catalog; refresh the whole table so the next lookup is a cache hit.
  let rows: CatalogRow[] = [];
  try {
    rows = await fetchCatalogByKind(smsPoolKey, kind);
  } catch (err) {
    console.error(`fetch ${kind} catalog failed:`, err);
  }
  if (rows.length > 0) {
    await upsertCatalog(supabase, kind, rows).catch(() => 0);
    const hit = rows.find((r) => r.id === wanted);
    if (hit) return hit.name;
  }

  return null;
}
