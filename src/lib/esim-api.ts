import { callEdgeFunction } from "@/lib/api";

// Prices returned by the catalog edge function are ALREADY marked up (the edge
// is the single source of truth), so the client just displays them — no
// client-side markup to drift out of sync.

export interface NetworkCoverage {
  country: string;
  operators: { operatorName: string; networkType: string }[];
}

export interface EsimCountry {
  id: string;
  name: string;
  country_code: string;
  from_price: number;
  raw_price: number;
  data_gb: number;
  speed: string;
  coverage: NetworkCoverage[];
}

export interface EsimPlan {
  id: string;
  price: number;
  raw_price: number;
  data_gb: number;
  duration_days: number | null;
  speed: string;
  ip: string | null;
  extendable: boolean;
  coverage: NetworkCoverage[];
}

export interface EsimProfile {
  activated: number;
  activation_string: string | null;
  activation_code: string | null;
  smdp: string | null;
  pin: string | null;
  puk: string | null;
  apn: string | null;
  country_code: string | null;
  remaining_data: string | null;
  total_data: string | null;
}

export async function fetchEsimCountries(search?: string): Promise<EsimCountry[]> {
  const data = await callEdgeFunction("get-esim-catalog", {
    length: 500,
    ...(search ? { search } : {}),
  });
  return (data.countries ?? []) as EsimCountry[];
}

export async function fetchEsimPlans(country: string): Promise<EsimPlan[]> {
  const data = await callEdgeFunction("get-esim-catalog", { country });
  return (data.plans ?? []) as EsimPlan[];
}

export async function purchaseEsim(input: {
  plan_id: string;
  country: string;
  country_name: string;
  raw_price: number;
}): Promise<{ esim_id: string; transaction_id: string; cost: number }> {
  return callEdgeFunction("order-esim", input);
}

export async function fetchEsimProfile(
  transaction_id: string,
): Promise<EsimProfile> {
  return callEdgeFunction("get-esim-profile", { transaction_id });
}
