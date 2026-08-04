"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/dashboard/Toast";
import ActivationPanel from "@/components/dashboard/esim/ActivationPanel";
import {
  type EsimProfile,
  fetchEsimProfile,
  formatBytes,
} from "@/lib/esim-api";

export interface EsimRow {
  id: string;
  provider: string;
  provider_order_no: string | null;
  provider_tran_no: string | null;
  iccid: string | null;
  country: string | null;
  country_name: string | null;
  data_gb: number | null;
  duration_days: number | null;
  cost: number;
  status: string;
  smdp_status: string | null;
  total_bytes: number | null;
  used_bytes: number | null;
  expires_at: string | null;
  created_at: string;
}

// eSIM Access allocates profiles asynchronously — usually seconds, up to ~30s.
// order-esim already waited a few seconds, so a row that is still 'pending'
// here needs a little longer. Give up after ~2 minutes and stop hammering.
const POLL_MS = 5000;
const POLL_LIMIT = 24;

function statusTone(status: string) {
  if (status === "active")
    return { bg: "#0A1F0A", color: "#00FF94", border: "rgba(0,255,148,0.32)" };
  if (status === "pending" || status === "suspended")
    return { bg: "#1A1500", color: "#F5A623", border: "rgba(245,166,35,0.32)" };
  if (status === "failed" || status === "cancelled")
    return { bg: "#1A0000", color: "#FF4444", border: "rgba(255,68,68,0.32)" };
  return { bg: "#141414", color: "#555555", border: "#242424" };
}

/** Human label for the SM-DP+ state, which is what tells you if it's installed. */
function smdpLabel(smdp: string | null): string | null {
  switch (smdp) {
    case "RELEASED":
      return "Ready to install";
    case "DOWNLOAD":
    case "INSTALLATION":
      return "Installing…";
    case "ENABLED":
      return "Installed & active";
    case "DISABLED":
      return "Installed, turned off";
    case "DELETED":
      return "Removed from device";
    default:
      return null;
  }
}

export default function EsimCard({
  esim,
  onUpdated,
}: {
  esim: EsimRow;
  onUpdated?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<EsimProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const tone = statusTone(esim.status);
  const isLegacy = esim.provider === "smspool";
  const canActivate = esim.status === "active" && !isLegacy;

  // Poll a still-provisioning eSIM until the profile lands.
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  useEffect(() => {
    if (esim.status !== "pending" || isLegacy) return;

    let tries = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      tries += 1;
      try {
        const { status } = await fetchEsimProfile(esim.id);
        if (!cancelled && status !== "pending") {
          onUpdatedRef.current?.();
          return;
        }
      } catch {
        // Transient upstream failure — the next tick retries. A visible error
        // here would be noise during normal provisioning.
      }
      if (!cancelled && tries < POLL_LIMIT) {
        timer = setTimeout(tick, POLL_MS);
      }
    };

    timer = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [esim.id, esim.status, isLegacy]);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (profile) return;

    setLoading(true);
    try {
      const { profile: loaded } = await fetchEsimProfile(esim.id);
      if (!loaded) {
        toast("Activation details aren't ready yet — try again shortly", "error");
        setOpen(false);
      } else {
        setProfile(loaded);
      }
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Could not load activation",
        "error",
      );
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const smdp = smdpLabel(esim.smdp_status);
  const volume = esim.total_bytes
    ? formatBytes(esim.total_bytes)
    : esim.data_gb
      ? `${esim.data_gb} GB`
      : "?";

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p
              className="text-[15px] font-semibold"
              style={{ color: "#F5F5F5" }}
            >
              {esim.country_name || esim.country || "eSIM"}
            </p>
            <p
              className="font-mono text-[11px] mt-1"
              style={{ color: "#555555" }}
            >
              {volume}
              {esim.duration_days ? ` · ${esim.duration_days} days` : ""}
              {smdp ? ` · ${smdp}` : ""}
            </p>
          </div>
          <span
            className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase shrink-0"
            style={{
              backgroundColor: tone.bg,
              color: tone.color,
              border: `1px solid ${tone.border}`,
            }}
          >
            {esim.status}
          </span>
        </div>

        {canActivate ? (
          <button
            onClick={toggle}
            className="w-full h-[44px] rounded-[6px] text-[14px] font-bold transition-colors"
            style={{
              backgroundColor: open ? "transparent" : "#00FF94",
              color: open ? "#F5F5F5" : "#080808",
              border: open ? "1px solid #333333" : "none",
            }}
          >
            {open ? "Hide activation" : "View activation"}
          </button>
        ) : isLegacy ? (
          <p className="text-[12px] leading-relaxed" style={{ color: "#555555" }}>
            Issued by our previous eSIM provider, which has shut down its API.
            Contact support if you still need its activation details.
          </p>
        ) : esim.status === "pending" ? (
          <div className="flex items-center gap-2">
            <span
              className="auth-spinner"
              style={{ borderColor: "#F5A623", borderTopColor: "transparent" }}
            />
            <p className="text-[12px]" style={{ color: "#555555" }}>
              Provisioning your eSIM — this usually takes under a minute.
            </p>
          </div>
        ) : (
          <p className="text-[12px]" style={{ color: "#555555" }}>
            Activation unavailable
          </p>
        )}
      </div>

      {open && (
        <div className="px-5 pb-5" style={{ backgroundColor: "#0A0A0A" }}>
          {loading ? (
            <div className="flex items-center gap-2 py-3">
              <span
                className="auth-spinner"
                style={{ borderColor: "#00FF94", borderTopColor: "transparent" }}
              />
              <span className="text-xs" style={{ color: "#555555" }}>
                Loading activation…
              </span>
            </div>
          ) : profile ? (
            <ActivationPanel profile={profile} />
          ) : null}
        </div>
      )}
    </div>
  );
}
