"use client";

import { useState, useEffect, useRef } from "react";
import { callEdgeFunction, fetchSMSPool } from "@/lib/api";
import { useToast } from "@/components/dashboard/Toast";
import FundShortfall from "@/components/dashboard/FundShortfall";
import { applyMarkup } from "@/lib/pricing";

interface Service {
  ID: string;
  name: string;
}
interface Country {
  ID: string;
  name: string;
}

interface OrderFormProps {
  onOrder: (order: {
    order_id: string;
    phone_number: string;
    service_name: string;
    country_name: string;
    cost: number;
    expires_at: string;
  }) => void;
  balance: number;
  /** Called after an inline top-up so the parent can refresh the balance. */
  onFunded?: () => void;
}

const POPULAR_SERVICES = [
  "Google",
  "WhatsApp",
  "Telegram",
  "Discord",
  "Twitter",
  "Instagram",
  "TikTok",
  "Facebook",
];
const POPULAR_COUNTRIES = [
  "United States",
  "United Kingdom",
  "India",
  "Brazil",
  "Germany",
  "France",
  "Canada",
  "Australia",
];

export default function OrderForm({
  onOrder,
  balance,
  onFunded,
}: OrderFormProps) {
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [svcSearch, setSvcSearch] = useState("");
  const [ctySearch, setCtySearch] = useState("");
  const [showSvcDrop, setShowSvcDrop] = useState(false);
  const [showCtyDrop, setShowCtyDrop] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [successRate, setSuccessRate] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const svcRef = useRef<HTMLDivElement>(null);
  const ctyRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (svcRef.current && !svcRef.current.contains(e.target as Node))
        setShowSvcDrop(false);
      if (ctyRef.current && !ctyRef.current.contains(e.target as Node))
        setShowCtyDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch services + countries
  useEffect(() => {
    fetchSMSPool("service/retrieve_all", {}).then((d) => {
      if (Array.isArray(d)) setServices(d);
      else if (d?.services) setServices(d.services);
    });
    fetchSMSPool("country/retrieve_all", {}).then((d) => {
      if (Array.isArray(d)) setCountries(d);
      else if (d?.countries) setCountries(d.countries);
    });
  }, []);

  // Fetch price
  useEffect(() => {
    if (!selectedService || !selectedCountry) {
      setPrice(null);
      setSuccessRate(null);
      return;
    }
    setPriceLoading(true);
    fetchSMSPool("request/price", {
      country: selectedCountry.ID,
      service: selectedService.ID,
    })
      .then((d) => {
        if (d?.price) setPrice(applyMarkup(parseFloat(d.price)));
        else setPrice(null);
        setSuccessRate(
          d?.success_rate != null ? parseFloat(d.success_rate) : null,
        );
      })
      .finally(() => setPriceLoading(false));
  }, [selectedService, selectedCountry]);

  const sortWithPopular = (
    items: { ID: string; name: string }[],
    popular: string[],
  ) => {
    const lower = popular.map((p) => p.toLowerCase());
    const pinned = items.filter((i) => lower.includes(i.name.toLowerCase()));
    const rest = items.filter((i) => !lower.includes(i.name.toLowerCase()));
    return [...pinned, ...rest];
  };

  const filteredSvc = sortWithPopular(services, POPULAR_SERVICES).filter((s) =>
    s.name.toLowerCase().includes(svcSearch.toLowerCase()),
  );
  const filteredCty = sortWithPopular(countries, POPULAR_COUNTRIES).filter(
    (c) => c.name.toLowerCase().includes(ctySearch.toLowerCase()),
  );

  const insufficientBalance = price !== null && price > balance;

  const handleOrder = async () => {
    if (!selectedService || !selectedCountry || price === null) return;

    setLoading(true);
    setError(null);
    try {
      const data = await callEdgeFunction("order-number", {
        country: selectedCountry.ID,
        service: selectedService.ID,
      });
      onOrder({
        order_id: data.order_id,
        phone_number: data.phone_number,
        service_name: selectedService.name,
        country_name: selectedCountry.name,
        cost: data.cost,
        expires_at: data.expires_at,
      });
      // Reset form
      setSelectedService(null);
      setSelectedCountry(null);
      setSvcSearch("");
      setCtySearch("");
      setPrice(null);
      setSuccessRate(null);
      // Refresh sidebar balance
      (window as any).__refreshBalance?.();
      toast("Number ordered successfully");
    } catch (err: any) {
      setError(err.message || "Failed to order number");
      toast(err.message || "Failed to order number", "error");
    } finally {
      setLoading(false);
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
    <div
      className="rounded-lg p-6"
      style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}
    >
      <h2 className="font-sans text-lg font-bold text-foreground mb-6">
        Get a number
      </h2>

      <div className="space-y-5">
        {/* Step 1 — Service */}
        <div ref={svcRef}>
          <label className="block text-[12px] text-muted mb-1.5">
            Step 1 — Service
          </label>
          <div className="relative">
            <input
              type="text"
              value={svcSearch}
              onChange={(e) => {
                setSvcSearch(e.target.value);
                setShowSvcDrop(true);
                setSelectedService(null);
                setPrice(null);
                setSuccessRate(null);
              }}
              onFocus={() => setShowSvcDrop(true)}
              placeholder="Search services..."
              className="w-full h-[44px] px-3 text-[14px] text-foreground placeholder-muted rounded-[6px] outline-none"
              style={INPUT_STYLE}
            />
            {showSvcDrop && (
              <div
                className="absolute z-20 w-full mt-1 rounded-[6px] max-h-[240px] overflow-y-auto"
                style={DROP_STYLE}
              >
                {filteredSvc.slice(0, 50).map((s) => (
                  <button
                    key={s.ID}
                    onClick={() => {
                      setSelectedService(s);
                      setSvcSearch(s.name);
                      setShowSvcDrop(false);
                    }}
                    className="w-full px-3 py-2 text-left text-[13px] text-foreground hover:bg-line transition-colors"
                  >
                    {s.name}
                  </button>
                ))}
                {filteredSvc.length === 0 && (
                  <div className="px-3 py-3 text-[13px] text-muted">
                    No services found
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Step 2 — Country */}
        <div ref={ctyRef}>
          <label className="block text-[12px] text-muted mb-1.5">
            Step 2 — Country
          </label>
          <div className="relative">
            <input
              type="text"
              value={ctySearch}
              onChange={(e) => {
                setCtySearch(e.target.value);
                setShowCtyDrop(true);
                setSelectedCountry(null);
                setPrice(null);
                setSuccessRate(null);
              }}
              onFocus={() => setShowCtyDrop(true)}
              placeholder="Search countries..."
              className="w-full h-[44px] px-3 text-[14px] text-foreground placeholder-muted rounded-[6px] outline-none"
              style={INPUT_STYLE}
            />
            {showCtyDrop && (
              <div
                className="absolute z-20 w-full mt-1 rounded-[6px] max-h-[240px] overflow-y-auto"
                style={DROP_STYLE}
              >
                {filteredCty.slice(0, 50).map((c) => (
                  <button
                    key={c.ID}
                    onClick={() => {
                      setSelectedCountry(c);
                      setCtySearch(c.name);
                      setShowCtyDrop(false);
                    }}
                    className="w-full px-3 py-2 text-left text-[13px] text-foreground hover:bg-line transition-colors"
                  >
                    {c.name}
                  </button>
                ))}
                {filteredCty.length === 0 && (
                  <div className="px-3 py-3 text-[13px] text-muted">
                    No countries found
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Step 3 — Price */}
        {selectedService && selectedCountry && (
          <div
            className="flex items-center justify-between py-3 px-3 rounded-[6px]"
            style={{ backgroundColor: "var(--field)" }}
          >
            <span className="text-[13px] text-muted">Estimated cost</span>
            {priceLoading ? (
              <span
                className="auth-spinner"
                style={{
                  borderColor: "var(--accent)",
                  borderTopColor: "transparent",
                  width: 14,
                  height: 14,
                }}
              />
            ) : price !== null ? (
              <span className="font-mono text-accent font-medium">
                ${price.toFixed(2)}
              </span>
            ) : (
              <span className="text-[13px] text-muted">—</span>
            )}
          </div>
        )}
        {selectedService &&
          selectedCountry &&
          price !== null &&
          successRate !== null && (
            <div
              className="flex items-center justify-between py-3 px-3 rounded-[6px] -mt-2"
              style={{ backgroundColor: "var(--field)" }}
            >
              <span className="text-[13px] text-muted">Success rate</span>
              <span
                className="font-mono font-medium"
                style={{
                  color:
                    successRate >= 75
                      ? "var(--accent)"
                      : successRate >= 50
                        ? "var(--warning)"
                        : "var(--danger)",
                }}
              >
                {successRate}%
              </span>
            </div>
          )}
        {selectedService &&
          selectedCountry &&
          price !== null &&
          successRate !== null &&
          successRate < 60 && (
            <p className="text-[11px] -mt-2" style={{ color: "var(--warning)" }}>
              Low success rate. Consider a different country.
            </p>
          )}
        {selectedService && selectedCountry && price !== null && (
          <p className="text-[11px] text-muted -mt-2">
            You are only charged if an SMS is received
          </p>
        )}

        {/* Error */}
        {error && (
          <div
            className="px-3 py-3 rounded-[6px] text-[13px]"
            style={{
              backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)",
              border: "1px solid var(--danger)",
              color: "var(--danger)",
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: error }} />
          </div>
        )}

        {/* Submit — or fund inline when the balance is short */}
        {insufficientBalance ? (
          <FundShortfall
            price={price ?? 0}
            balance={balance}
            itemLabel="number"
            onFunded={() => onFunded?.()}
          />
        ) : (
          <button
            onClick={handleOrder}
            disabled={
              loading || !selectedService || !selectedCountry || price === null
            }
            className="w-full h-[44px] rounded-[6px] text-[14px] font-bold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {loading ? (
              <>
                <span className="auth-spinner" />
                Requesting number...
              </>
            ) : (
              "Get Number"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
