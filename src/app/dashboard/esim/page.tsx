"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useToast } from "@/components/dashboard/Toast";
import FundShortfall from "@/components/dashboard/FundShortfall";
import EsimCard, { type EsimRow } from "@/components/dashboard/EsimCard";
import DestinationPicker from "@/components/dashboard/esim/DestinationPicker";
import PackagePicker from "@/components/dashboard/esim/PackagePicker";
import {
  type CatalogScope,
  type EsimDestination,
  type EsimPackage,
  type EsimRegionGroup,
  fetchEsimDestinations,
  fetchEsimPackages,
  fetchGlobalPackages,
  fetchRegionalGroups,
  packagePrice,
  purchaseEsim,
} from "@/lib/esim-api";

const ESIM_COLUMNS =
  "id, provider, provider_order_no, provider_tran_no, iccid, country, country_name, data_gb, duration_days, cost, status, smdp_status, total_bytes, used_bytes, expires_at, created_at";

const refreshSidebar = () =>
  (window as unknown as { __refreshBalance?: () => void }).__refreshBalance?.();

export default function EsimPage() {
  const user = useUser();
  const { toast } = useToast();

  const [balance, setBalance] = useState(0);
  const [esims, setEsims] = useState<EsimRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [scope, setScope] = useState<CatalogScope>("country");
  const [countries, setCountries] = useState<EsimDestination[]>([]);
  const [country, setCountry] = useState<EsimDestination | null>(null);
  const [groups, setGroups] = useState<EsimRegionGroup[]>([]);
  const [group, setGroup] = useState<EsimRegionGroup | null>(null);
  const [loadingDest, setLoadingDest] = useState(true);

  const [packages, setPackages] = useState<EsimPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [pkg, setPkg] = useState<EsimPackage | null>(null);
  const [days, setDays] = useState(7);
  const [buying, setBuying] = useState(false);
  // Supplier-side availability. False stops the buy flow up front instead of
  // taking money for an order we already know we can't fill.
  const [available, setAvailable] = useState(true);

  const loadBalance = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();
    if (data) setBalance(Number(data.balance));
  }, [user]);

  const loadEsims = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("esims")
      .select(ESIM_COLUMNS)
      .eq("user_id", user.id)
      .in("status", ["active", "pending", "suspended"])
      .order("created_at", { ascending: false });
    if (data) setEsims(data as EsimRow[]);
  }, [user]);

  useEffect(() => {
    loadBalance();
    loadEsims().finally(() => setLoadingList(false));
  }, [loadBalance, loadEsims]);

  // Destinations for the active coverage type. Regional groups and global
  // plans are fetched lazily — most people never leave the country tab.
  useEffect(() => {
    let cancelled = false;
    setPkg(null);
    setPackages([]);

    const load = async () => {
      setLoadingDest(true);
      try {
        if (scope === "country") {
          if (countries.length === 0) {
            const res = await fetchEsimDestinations();
            if (!cancelled) {
              setCountries(res.countries);
              setAvailable(res.available);
            }
          }
        } else if (scope === "regional") {
          if (groups.length === 0) {
            const list = await fetchRegionalGroups();
            if (!cancelled) setGroups(list);
          }
        } else {
          setLoadingPackages(true);
          const list = await fetchGlobalPackages();
          if (!cancelled) setPackages(list);
        }
      } catch (e) {
        if (!cancelled) {
          toast(e instanceof Error ? e.message : "Could not load eSIM catalog", "error");
        }
      } finally {
        if (!cancelled) {
          setLoadingDest(false);
          setLoadingPackages(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // countries/groups are caches, not inputs — re-running on them would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, toast]);

  // Packages for the chosen country.
  useEffect(() => {
    if (scope !== "country" || !country) return;
    let cancelled = false;
    setLoadingPackages(true);
    setPkg(null);
    fetchEsimPackages(country.code)
      .then((list) => !cancelled && setPackages(list))
      .catch((e: Error) => !cancelled && toast(e.message, "error"))
      .finally(() => !cancelled && setLoadingPackages(false));
    return () => {
      cancelled = true;
    };
  }, [scope, country, toast]);

  // Regional packages travel with their group — no extra fetch.
  useEffect(() => {
    if (scope !== "regional") return;
    setPkg(null);
    setPackages(group?.packages ?? []);
  }, [scope, group]);

  const price = pkg ? packagePrice(pkg, days) : 0;
  const insufficient = !!pkg && price > balance;
  const showPackages =
    scope === "global" || (scope === "country" && !!country) ||
    (scope === "regional" && !!group);

  const handleBuy = async () => {
    if (!pkg) return;
    setBuying(true);
    try {
      const result = await purchaseEsim({
        package_code: pkg.code,
        catalog_scope: scope,
        location_code: scope === "country" ? (country?.code ?? "") : "",
        location_name: scope === "country"
          ? (country?.name ?? "")
          : scope === "regional"
            ? (group?.label ?? "Regional")
            : "Global",
        raw_price: pkg.raw_price,
        ...(pkg.is_day_pass ? { period_num: days } : {}),
      });
      toast(
        result.status === "active"
          ? "eSIM ready — open it to activate"
          : "Purchased — your eSIM is being provisioned",
        "success",
      );
      refreshSidebar();
      setPkg(null);
      setCountry(null);
      setGroup(null);
      await Promise.all([loadBalance(), loadEsims()]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Purchase failed", "error");
    } finally {
      setBuying(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--foreground)" }}>
        eSIM data
      </h1>

      {/* Active eSIMs */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--muted)" }}>
          Your eSIMs
        </h2>
        {loadingList ? (
          <div className="flex justify-center py-12">
            <span
              className="auth-spinner"
              style={{
                width: 24,
                height: 24,
                borderColor: "var(--accent)",
                borderTopColor: "transparent",
              }}
            />
          </div>
        ) : esims.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center min-h-[120px] flex items-center justify-center"
            style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}
          >
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No eSIMs yet — buy one below.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {esims.map((e) => (
              <EsimCard key={e.id} esim={e} onUpdated={loadEsims} />
            ))}
          </div>
        )}
      </section>

      {/* Buy */}
      <section>
        <div
          className="rounded-lg p-6"
          style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}
        >
          <h2 className="text-lg font-bold mb-1" style={{ color: "var(--foreground)" }}>
            Buy a data eSIM
          </h2>
          <p className="text-[13px] mb-6" style={{ color: "var(--muted)" }}>
            Data-only — no calls or SMS. Activates by QR / manual entry.
          </p>

          {!available && (
            <div
              className="rounded-[6px] p-3 mb-5"
              style={{
                backgroundColor: "var(--field)",
                border: "1px solid rgba(245,166,35,0.35)",
              }}
            >
              <p className="text-[13px]" style={{ color: "var(--warning)" }}>
                eSIMs are temporarily unavailable
              </p>
              <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>
                We&apos;re restocking with our supplier — browsing still works,
                and purchases will reopen shortly. Nothing has been charged.
              </p>
            </div>
          )}

          <div className="space-y-5">
            <DestinationPicker
              scope={scope}
              onScopeChange={setScope}
              countries={countries}
              country={country}
              onCountryChange={setCountry}
              groups={groups}
              group={group}
              onGroupChange={setGroup}
              loading={loadingDest}
            />

            {showPackages && (
              <div>
                <label
                  className="block text-[12px] mb-1.5"
                  style={{ color: "var(--muted)" }}
                >
                  Step 2 — Plan
                </label>
                <PackagePicker
                  packages={packages}
                  loading={loadingPackages}
                  selected={pkg}
                  onSelect={setPkg}
                  days={days}
                  onDaysChange={setDays}
                  emptyLabel={
                    scope === "country"
                      ? `No plans available for ${country?.name ?? "this country"}.`
                      : "No plans available right now."
                  }
                />
              </div>
            )}

            {pkg &&
              (insufficient ? (
                <FundShortfall
                  price={price}
                  balance={balance}
                  itemLabel="eSIM"
                  onFunded={() => {
                    refreshSidebar();
                    loadBalance();
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={buying || !available}
                  className="w-full h-[44px] rounded-[6px] text-[14px] font-bold transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
                >
                  {!available ? (
                    "Temporarily unavailable"
                  ) : buying ? (
                    <>
                      <span
                        className="auth-spinner"
                        style={{
                          borderColor: "var(--accent-ink)",
                          borderTopColor: "transparent",
                        }}
                      />
                      Purchasing…
                    </>
                  ) : (
                    `Buy eSIM — $${price.toFixed(2)}`
                  )}
                </button>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}
