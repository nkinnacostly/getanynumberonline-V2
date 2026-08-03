"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import { useToast } from "@/components/dashboard/Toast";
import TopupButton from "@/components/dashboard/TopupButton";
import EsimCard, { type EsimRow } from "@/components/dashboard/EsimCard";
import {
  fetchEsimCountries,
  fetchEsimPlans,
  purchaseEsim,
  type EsimCountry,
  type EsimPlan,
} from "@/lib/esim-api";

const refreshSidebar = () =>
  (window as unknown as { __refreshBalance?: () => void }).__refreshBalance?.();

export default function EsimPage() {
  const user = useUser();
  const { toast } = useToast();

  const [balance, setBalance] = useState(0);
  const [esims, setEsims] = useState<EsimRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [countries, setCountries] = useState<EsimCountry[]>([]);
  const [search, setSearch] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const [country, setCountry] = useState<EsimCountry | null>(null);

  const [plans, setPlans] = useState<EsimPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plan, setPlan] = useState<EsimPlan | null>(null);
  const [buying, setBuying] = useState(false);

  const dropRef = useRef<HTMLDivElement>(null);

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
      .select(
        "id, smspool_transaction_id, country, country_name, data_gb, duration_days, cost, status, created_at",
      )
      .eq("user_id", user.id)
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: false });
    if (data) setEsims(data as EsimRow[]);
  }, [user]);

  useEffect(() => {
    loadBalance();
    loadEsims().finally(() => setLoadingList(false));
  }, [loadBalance, loadEsims]);

  useEffect(() => {
    fetchEsimCountries()
      .then(setCountries)
      .catch((e: Error) => toast(e.message, "error"));
  }, [toast]);

  // Load plans when a country is picked.
  useEffect(() => {
    if (!country) {
      setPlans([]);
      setPlan(null);
      return;
    }
    setLoadingPlans(true);
    setPlan(null);
    fetchEsimPlans(country.country_code)
      .then(setPlans)
      .catch((e: Error) => toast(e.message, "error"))
      .finally(() => setLoadingPlans(false));
  }, [country, toast]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node))
        setShowDrop(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = search
    ? countries.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
      )
    : countries;

  const insufficient = !!plan && plan.price > balance;
  const fundAmount = plan
    ? Math.min(500, Math.max(5, Math.ceil(plan.price - balance)))
    : 5;

  const handleBuy = async () => {
    if (!country || !plan) return;
    setBuying(true);
    try {
      await purchaseEsim({
        plan_id: plan.id,
        country: country.country_code,
        country_name: country.name,
        raw_price: plan.raw_price,
      });
      toast("eSIM purchased — open it to activate", "success");
      refreshSidebar();
      setPlan(null);
      setCountry(null);
      setSearch("");
      await Promise.all([loadBalance(), loadEsims()]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Purchase failed", "error");
    } finally {
      setBuying(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "#F5F5F5" }}>
        eSIM data
      </h1>

      {/* Active eSIMs */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold mb-4" style={{ color: "#555555" }}>
          Your eSIMs
        </h2>
        {loadingList ? (
          <div className="flex justify-center py-12">
            <span
              className="auth-spinner"
              style={{ width: 24, height: 24, borderColor: "#00FF94", borderTopColor: "transparent" }}
            />
          </div>
        ) : esims.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center min-h-[120px] flex items-center justify-center"
            style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
          >
            <p className="text-sm" style={{ color: "#555555" }}>
              No eSIMs yet — buy one below.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {esims.map((e) => (
              <EsimCard key={e.id} esim={e} />
            ))}
          </div>
        )}
      </section>

      {/* Buy */}
      <section>
        <div
          className="rounded-lg p-6"
          style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
        >
          <h2 className="text-lg font-bold mb-1" style={{ color: "#F5F5F5" }}>
            Buy a data eSIM
          </h2>
          <p className="text-[13px] mb-6" style={{ color: "#555555" }}>
            Data-only — no calls or SMS. Activates by QR / manual entry.
          </p>

          <div className="space-y-5">
            {/* Country */}
            <div ref={dropRef}>
              <label className="block text-[12px] mb-1.5" style={{ color: "#888888" }}>
                Step 1 — Destination
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={country ? country.name : search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setShowDrop(true);
                    setCountry(null);
                  }}
                  onFocus={() => setShowDrop(true)}
                  placeholder="Search a country…"
                  className="w-full h-[44px] px-3 text-[14px] rounded-[6px] outline-none"
                  style={{ backgroundColor: "#141414", border: "1px solid #222222", color: "#F5F5F5" }}
                />
                {showDrop && (
                  <div
                    className="absolute z-20 w-full mt-1 rounded-[6px] max-h-[240px] overflow-y-auto"
                    style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
                  >
                    {filtered.slice(0, 60).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCountry(c);
                          setSearch("");
                          setShowDrop(false);
                        }}
                        className="w-full px-3 py-2 text-left text-[13px] hover:bg-[#1A1A1A] transition-colors flex justify-between gap-2"
                        style={{ color: "#F5F5F5" }}
                      >
                        <span className="min-w-0 truncate">{c.name}</span>
                        <span className="font-mono text-[11px] shrink-0" style={{ color: "#00FF94" }}>
                          from ${c.from_price.toFixed(2)}
                        </span>
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <div className="px-3 py-3 text-[13px]" style={{ color: "#555555" }}>
                        No countries found
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Plans */}
            {country && (
              <div>
                <label className="block text-[12px] mb-1.5" style={{ color: "#888888" }}>
                  Step 2 — Plan
                </label>
                {loadingPlans ? (
                  <div className="flex justify-center py-6">
                    <span className="auth-spinner" style={{ borderColor: "#00FF94", borderTopColor: "transparent" }} />
                  </div>
                ) : plans.length === 0 ? (
                  <p className="text-[13px] py-2" style={{ color: "#555555" }}>
                    No plans available for {country.name}.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {plans.map((p) => {
                      const active = plan?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPlan(p)}
                          className="text-left rounded-[6px] p-3 transition-colors"
                          style={{
                            backgroundColor: "#141414",
                            border: `1px solid ${active ? "#00FF94" : "#222222"}`,
                          }}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-mono text-[15px] font-bold" style={{ color: "#F5F5F5" }}>
                              {p.data_gb} GB
                            </span>
                            <span className="font-mono text-[14px] font-bold" style={{ color: "#00FF94" }}>
                              ${p.price.toFixed(2)}
                            </span>
                          </div>
                          <div className="font-mono text-[11px] mt-1" style={{ color: "#555555" }}>
                            {p.duration_days ? `${p.duration_days} days` : "—"}
                            {p.speed ? ` · ${p.speed}` : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Buy / fund */}
            {plan &&
              (insufficient ? (
                <div
                  className="rounded-[6px] p-3"
                  style={{ backgroundColor: "#141414", border: "1px solid rgba(245,166,35,0.35)" }}
                >
                  <p className="text-[13px] mb-3" style={{ color: "#cdd2cf" }}>
                    This eSIM costs{" "}
                    <span className="font-mono" style={{ color: "#F5F5F5" }}>
                      ${plan.price.toFixed(2)}
                    </span>
                    . You have{" "}
                    <span className="font-mono" style={{ color: "#F5A623" }}>
                      ${balance.toFixed(2)}
                    </span>
                    .
                  </p>
                  <div className="flex gap-2">
                    <TopupButton
                      amount={fundAmount}
                      label={`Add $${fundAmount} & continue`}
                      onFunded={() => {
                        refreshSidebar();
                        loadBalance();
                      }}
                      className="flex-1 h-[44px] rounded-[6px] text-[14px] font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                      style={{ backgroundColor: "#00FF94", color: "#080808" }}
                    />
                    <Link
                      href="/dashboard/wallet"
                      className="h-[44px] px-4 rounded-[6px] text-[14px] font-medium flex items-center"
                      style={{ backgroundColor: "transparent", border: "1px solid #333333", color: "#F5F5F5" }}
                    >
                      Wallet
                    </Link>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={buying}
                  className="w-full h-[44px] rounded-[6px] text-[14px] font-bold transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ backgroundColor: "#00FF94", color: "#080808" }}
                >
                  {buying ? (
                    <>
                      <span className="auth-spinner" style={{ borderColor: "#080808", borderTopColor: "transparent" }} />
                      Purchasing…
                    </>
                  ) : (
                    `Buy eSIM — $${plan.price.toFixed(2)}`
                  )}
                </button>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}
