"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@/hooks/useNavigate";
import { createClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/api";
import {
  fetchRentalCatalog,
  getRawRentalPrice,
  getRentalPrice,
  type RentalOption,
} from "@/lib/rental-api";
import { useToast } from "@/components/dashboard/Toast";
import RentalCard, { type RentalRow } from "@/components/dashboard/RentalCard";
import { useUser } from "@/hooks/useUser";

/** Catalog row + stable string id for React keys */
type SelectedRental = RentalOption & { id: string };

const DURATIONS = [7, 14, 30, 60] as const;

export default function RentalsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = useUser();
  const [balance, setBalance] = useState(0);
  const [rentals, setRentals] = useState<RentalRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [catalog, setCatalog] = useState<SelectedRental[]>([]);
  const [search, setSearch] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const [selected, setSelected] = useState<SelectedRental | null>(null);
  const [days, setDays] = useState<(typeof DURATIONS)[number]>(7);
  const [price, setPrice] = useState<number | null>(null);
  const [rentLoading, setRentLoading] = useState(false);

  const [cancellingId, setCancellingId] = useState<string | null>(null);

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

  const loadRentals = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("rentals")
      .select(
        "id, service_name, country_name, phone_number, expires_at, status, cost, days",
      )
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    if (data) setRentals(data as RentalRow[]);
  }, [user]);

  useEffect(() => {
    loadBalance();
    loadRentals().finally(() => setLoadingList(false));
  }, [loadBalance, loadRentals]);

  useEffect(() => {
    fetchRentalCatalog()
      .then((result) => {
        const list = result.data ?? [];
        const normalized: SelectedRental[] = list.map((item) => {
          const idStr = String(
            item.ID ?? (item as { id?: string | number }).id ?? "",
          );
          const rawP = (item as { pricing?: Record<string, unknown> }).pricing;
          const pricing: Record<string, number> = {};
          if (rawP && typeof rawP === "object") {
            for (const [k, v] of Object.entries(rawP)) {
              const n =
                typeof v === "number" ? v : parseFloat(String(v));
              if (!isNaN(n)) pricing[k] = n;
            }
          }
          return {
            ID: Number(item.ID),
            name: String(item.name ?? ""),
            tag: String(item.tag ?? ""),
            region: String(item.region ?? ""),
            pricing,
            pool: Number((item as { pool?: number }).pool ?? 0),
            single_service:
              (item as { single_service?: string | null }).single_service ??
              null,
            id: idStr,
          };
        });
        setCatalog(normalized);
      })
      .catch((e: Error) => toast(e.message, "error"));
  }, [toast]);

  /** When rental changes, pick first duration (7→60) that exists in pricing. */
  useEffect(() => {
    if (!selected?.pricing) return;
    const pick = DURATIONS.find(
      (d) => selected.pricing[String(d)] !== undefined,
    );
    if (pick === undefined) return;
    setDays((prev) =>
      selected.pricing[String(prev)] !== undefined ? prev : pick,
    );
  }, [selected]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (!selected) {
      setPrice(null);
      return;
    }
    setPrice(getRentalPrice(selected, days));
  }, [selected, days]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return catalog.filter((c) => {
      const tag = (c.tag ?? "").toLowerCase();
      const name = (c.name ?? "").toLowerCase();
      const region = (c.region ?? "").toLowerCase();
      return tag.includes(q) || name.includes(q) || region.includes(q);
    });
  }, [catalog, search]);

  const insufficient = price !== null && price > balance;
  const expiresPreview = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [days]);

  const handleCancel = async (rentalId: string) => {
    setCancellingId(rentalId);
    try {
      const data = await callEdgeFunction("cancel-rental", {
        rental_id: rentalId,
      });
      if (data.refunded) {
        toast("Rental cancelled — refund credited.", "success");
      } else {
        toast("Rental cancelled.", "success");
      }
      (window as unknown as { __refreshBalance?: () => void }).__refreshBalance?.();
      await loadRentals();
      await loadBalance();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Cancel failed", "error");
      throw e;
    } finally {
      setCancellingId(null);
    }
  };

  const handleRent = async () => {
    if (!selected || price === null) return;
    if (insufficient) {
      navigate("/dashboard/wallet");
      return;
    }
    setRentLoading(true);
    try {
      const raw = getRawRentalPrice(selected, days);
      if (raw === null) return;
      await callEdgeFunction("rent-number", {
        rental_id: String(selected.ID ?? selected.id),
        days,
        raw_price: raw,
      });
      toast("Number rented successfully", "success");
      (window as unknown as { __refreshBalance?: () => void }).__refreshBalance?.();
      setSelected(null);
      setSearch("");
      setPrice(null);
      await loadRentals();
      await loadBalance();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Rental failed", "error");
    } finally {
      setRentLoading(false);
    }
  };

  const INPUT_STYLE = {
    backgroundColor: "var(--field)",
    border: "1px solid var(--line-strong)",
  };
  const DROP_STYLE = {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--line)",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--foreground)" }}>
        Rentals
      </h1>

      <section className="mb-10">
        <h2
          className="font-sans text-sm font-semibold mb-4"
          style={{ color: "var(--muted)" }}
        >
          Active rentals
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
        ) : rentals.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center min-h-[120px] flex items-center justify-center"
            style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}
          >
            <p className="text-muted text-sm">No active rentals</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {rentals.map((r) => (
              <RentalCard
                key={r.id}
                rental={r}
                onCancelRental={() => handleCancel(r.id)}
                cancelling={cancellingId === r.id}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div
          className="rounded-lg p-6"
          style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}
        >
          <h2 className="font-sans text-lg font-bold text-foreground mb-6">
            Rent a number
          </h2>

          <p
            style={{
              fontSize: "13px",
              color: "var(--muted)",
              marginBottom: "16px",
            }}
          >
            Rental numbers support SMS only — voice calls are not supported.
          </p>

          <div className="space-y-5">
            <div ref={dropRef}>
              <label className="block text-[12px] text-muted mb-1.5">
                Step 1 — Rental type
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setShowDrop(true);
                    setSelected(null);
                    setPrice(null);
                  }}
                  onFocus={() => setShowDrop(true)}
                  placeholder="Search rental types..."
                  className="w-full h-[44px] px-3 text-[14px] text-foreground placeholder-muted rounded-[6px] outline-none"
                  style={INPUT_STYLE}
                />
                {showDrop && (
                  <div
                    className="absolute z-20 w-full mt-1 rounded-[6px] max-h-[240px] overflow-y-auto"
                    style={DROP_STYLE}
                  >
                    {filtered.slice(0, 50).map((c) => (
                      <button
                        key={String(c.id)}
                        type="button"
                        onClick={() => {
                          setSelected(c);
                          setSearch(c.tag || c.name);
                          setShowDrop(false);
                        }}
                        className="w-full px-3 py-2 text-left text-[13px] text-foreground hover:bg-line transition-colors flex justify-between gap-2"
                      >
                        <span className="min-w-0">{c.tag || c.name}</span>
                        {c.region ? (
                          <span className="text-[10px] text-muted shrink-0 font-mono">
                            {c.region}
                          </span>
                        ) : null}
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <div className="px-3 py-3 text-[13px] text-muted">
                        No options found
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[12px] text-muted mb-1.5">
                Step 2 — Duration
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DURATIONS.map((d) => {
                  const available =
                    !!selected &&
                    selected.pricing[String(d)] !== undefined;
                  const active = days === d && available;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={!selected || !available}
                      onClick={() => {
                        if (available) setDays(d);
                      }}
                      className="h-[44px] rounded-[6px] text-[13px] font-medium transition-colors disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: "var(--field)",
                        color: available ? "var(--foreground)" : "var(--muted)",
                        border: active
                          ? "1px solid var(--accent)"
                          : "1px solid var(--line-strong)",
                        opacity: !selected || available ? 1 : 0.45,
                      }}
                    >
                      {d} days
                    </button>
                  );
                })}
              </div>
            </div>

            {selected && (
              <div className="space-y-2">
                <div
                  className="flex items-center justify-between py-3 px-3 rounded-[6px]"
                  style={{ backgroundColor: "var(--field)" }}
                >
                  <span className="text-[13px] text-muted">
                    Estimated cost
                  </span>
                  {price !== null ? (
                    <span className="font-mono text-accent font-medium">
                      ${price.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-[13px] text-muted">
                      Not available for this duration
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-muted px-1">
                  Expires on{" "}
                  <span className="font-mono text-foreground">
                    {expiresPreview}
                  </span>
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleRent}
              disabled={rentLoading || !selected || price === null}
              className="w-full h-[44px] rounded-[6px] text-[14px] font-bold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                backgroundColor: insufficient ? "transparent" : "var(--accent)",
                color: insufficient ? "var(--danger)" : "var(--background)",
                border: insufficient ? "1px solid var(--danger)" : "none",
              }}
            >
              {rentLoading ? (
                <>
                  <span className="auth-spinner" />
                  Renting…
                </>
              ) : insufficient ? (
                "Insufficient balance — Top up"
              ) : (
                "Rent number"
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
