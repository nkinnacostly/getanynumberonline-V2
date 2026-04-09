"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { callEdgeFunction, fetchSMSPool } from "@/lib/api";
import { useToast } from "@/components/dashboard/Toast";

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

function applyMarkup(raw: number): number {
  let m: number;
  if (raw < 0.1) m = 0.4;
  else if (raw <= 0.3) m = 0.3;
  else m = 0.2;
  return Math.ceil(raw * (1 + m) * 100) / 100;
}

export default function OrderForm({ onOrder, balance }: OrderFormProps) {
  const router = useRouter();
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
    if (insufficientBalance) {
      router.push("/dashboard/wallet");
      return;
    }

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
    backgroundColor: "#141414",
    border: "1px solid #222222",
  };
  const DROP_STYLE = {
    backgroundColor: "#0F0F0F",
    border: "1px solid #1A1A1A",
  };

  return (
    <div
      className="rounded-lg p-6"
      style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
    >
      <h2 className="font-sans text-lg font-bold text-[#F5F5F5] mb-6">
        Get a number
      </h2>

      <div className="space-y-5">
        {/* Step 1 — Service */}
        <div ref={svcRef}>
          <label className="block text-[12px] text-[#888888] mb-1.5">
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
              className="w-full h-[44px] px-3 text-[14px] text-[#F5F5F5] placeholder-[#444444] rounded-[6px] outline-none"
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
                    className="w-full px-3 py-2 text-left text-[13px] text-[#F5F5F5] hover:bg-[#1A1A1A] transition-colors"
                  >
                    {s.name}
                  </button>
                ))}
                {filteredSvc.length === 0 && (
                  <div className="px-3 py-3 text-[13px] text-[#555555]">
                    No services found
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Step 2 — Country */}
        <div ref={ctyRef}>
          <label className="block text-[12px] text-[#888888] mb-1.5">
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
              className="w-full h-[44px] px-3 text-[14px] text-[#F5F5F5] placeholder-[#444444] rounded-[6px] outline-none"
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
                    className="w-full px-3 py-2 text-left text-[13px] text-[#F5F5F5] hover:bg-[#1A1A1A] transition-colors"
                  >
                    {c.name}
                  </button>
                ))}
                {filteredCty.length === 0 && (
                  <div className="px-3 py-3 text-[13px] text-[#555555]">
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
            style={{ backgroundColor: "#141414" }}
          >
            <span className="text-[13px] text-[#555555]">Estimated cost</span>
            {priceLoading ? (
              <span
                className="auth-spinner"
                style={{
                  borderColor: "#00FF94",
                  borderTopColor: "transparent",
                  width: 14,
                  height: 14,
                }}
              />
            ) : price !== null ? (
              <span className="font-mono text-[#00FF94] font-medium">
                ${price.toFixed(2)}
              </span>
            ) : (
              <span className="text-[13px] text-[#555555]">—</span>
            )}
          </div>
        )}
        {selectedService &&
          selectedCountry &&
          price !== null &&
          successRate !== null && (
            <div
              className="flex items-center justify-between py-3 px-3 rounded-[6px] -mt-2"
              style={{ backgroundColor: "#141414" }}
            >
              <span className="text-[13px] text-[#555555]">Success rate</span>
              <span
                className="font-mono font-medium"
                style={{
                  color:
                    successRate >= 75
                      ? "#00FF94"
                      : successRate >= 50
                        ? "#F5A623"
                        : "#FF4444",
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
            <p className="text-[11px] -mt-2" style={{ color: "#F5A623" }}>
              Low success rate. Consider a different country.
            </p>
          )}
        {selectedService && selectedCountry && price !== null && (
          <p className="text-[11px] text-[#555555] -mt-2">
            You are only charged if an SMS is received
          </p>
        )}

        {/* Error */}
        {error && (
          <div
            className="px-3 py-3 rounded-[6px] text-[13px]"
            style={{
              backgroundColor: "#1A0000",
              border: "1px solid #FF4444",
              color: "#FF4444",
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: error }} />
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleOrder}
          disabled={
            loading || !selectedService || !selectedCountry || price === null
          }
          className="w-full h-[44px] rounded-[6px] text-[14px] font-bold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{
            backgroundColor: insufficientBalance ? "transparent" : "#00FF94",
            color: insufficientBalance ? "#FF4444" : "#080808",
            border: insufficientBalance ? "1px solid #FF4444" : "none",
          }}
        >
          {loading ? (
            <>
              <span className="auth-spinner" />
              Requesting number...
            </>
          ) : insufficientBalance ? (
            "Insufficient balance — Top up"
          ) : (
            "Get Number"
          )}
        </button>
      </div>
    </div>
  );
}
