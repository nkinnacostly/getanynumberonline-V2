"use client";

import { useState } from "react";
import { useCopy } from "@/hooks/useCopy";
import { useToast } from "@/components/dashboard/Toast";
import { fetchEsimProfile, type EsimProfile } from "@/lib/esim-api";

export interface EsimRow {
  id: string;
  smspool_transaction_id: string | null;
  country_name: string | null;
  country: string | null;
  data_gb: number | null;
  duration_days: number | null;
  cost: number;
  status: string;
  created_at: string;
}

function statusTone(status: string) {
  if (status === "active")
    return { bg: "#0A1F0A", color: "#00FF94", border: "rgba(0,255,148,0.32)" };
  if (status === "pending")
    return { bg: "#1A1500", color: "#F5A623", border: "rgba(245,166,35,0.32)" };
  if (status === "failed")
    return { bg: "#1A0000", color: "#FF4444", border: "rgba(255,68,68,0.32)" };
  return { bg: "#141414", color: "#555555", border: "#242424" };
}

export default function EsimCard({ esim }: { esim: EsimRow }) {
  const { copy, isCopied } = useCopy();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<EsimProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const tone = statusTone(esim.status);
  const canActivate = esim.status === "active" && !!esim.smspool_transaction_id;

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!profile && esim.smspool_transaction_id) {
      setLoading(true);
      try {
        setProfile(await fetchEsimProfile(esim.smspool_transaction_id));
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not load activation", "error");
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }
  };

  const doCopy = async (text: string, key: string) => {
    const ok = await copy(text, key);
    toast(ok ? "Copied" : "Couldn't copy — select it manually", ok ? "success" : "error");
  };

  const iosLink = profile?.activation_string
    ? `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(
        profile.activation_string,
      )}`
    : null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold" style={{ color: "#F5F5F5" }}>
              {esim.country_name || esim.country || "eSIM"}
            </p>
            <p className="font-mono text-[11px] mt-1" style={{ color: "#555555" }}>
              {esim.data_gb ?? "?"} GB
              {esim.duration_days ? ` · ${esim.duration_days} days` : ""}
            </p>
          </div>
          <span
            className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase shrink-0"
            style={{ backgroundColor: tone.bg, color: tone.color, border: `1px solid ${tone.border}` }}
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
        ) : (
          <p className="text-[12px]" style={{ color: "#555555" }}>
            {esim.status === "pending"
              ? "Finalizing purchase…"
              : "Activation unavailable"}
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
            <div className="space-y-3 pt-3">
              {(profile.remaining_data || profile.total_data) && (
                <p className="font-mono text-[12px]" style={{ color: "#888888" }}>
                  Data: {profile.remaining_data ?? "?"} / {profile.total_data ?? "?"}
                </p>
              )}

              {iosLink && (
                <a
                  href={iosLink}
                  className="block w-full text-center h-[44px] leading-[44px] rounded-[6px] text-[14px] font-bold"
                  style={{ backgroundColor: "#00FF94", color: "#080808" }}
                >
                  Install on iPhone (iOS 17.4+)
                </a>
              )}

              <ActivationField label="Activation string (SM-DP+)" value={profile.activation_string} k="ac" doCopy={doCopy} isCopied={isCopied} />
              <ActivationField label="SM-DP+ address" value={profile.smdp} k="smdp" doCopy={doCopy} isCopied={isCopied} />
              <ActivationField label="Activation code" value={profile.activation_code} k="code" doCopy={doCopy} isCopied={isCopied} />

              <div className="grid grid-cols-2 gap-2">
                {profile.pin && <MiniField label="PIN" value={profile.pin} />}
                {profile.puk && <MiniField label="PUK" value={profile.puk} />}
                {profile.apn && <MiniField label="APN" value={profile.apn} />}
              </div>

              <p className="text-[11px] leading-relaxed" style={{ color: "#555555" }}>
                On Android or older iPhones, add a data-only eSIM manually using
                the SM-DP+ address and activation code above.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ActivationField({
  label,
  value,
  k,
  doCopy,
  isCopied,
}: {
  label: string;
  value: string | null;
  k: string;
  doCopy: (t: string, key: string) => void;
  isCopied: (key: string) => boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] uppercase mb-1" style={{ color: "#555555", letterSpacing: "0.08em" }}>
        {label}
      </p>
      <button
        onClick={() => doCopy(value, k)}
        className="w-full text-left rounded-[6px] px-3 py-2 font-mono text-[12px] break-all transition-colors"
        style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A", color: "#F5F5F5" }}
      >
        {value}
        <span className="ml-2 text-[10px]" style={{ color: "#00FF94" }}>
          {isCopied(k) ? "✓ copied" : "tap to copy"}
        </span>
      </button>
    </div>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] px-3 py-2" style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}>
      <p className="text-[10px] uppercase" style={{ color: "#555555" }}>
        {label}
      </p>
      <p className="font-mono text-[13px]" style={{ color: "#F5F5F5" }}>
        {value}
      </p>
    </div>
  );
}
