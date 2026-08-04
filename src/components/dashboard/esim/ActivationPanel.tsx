"use client";

import Image from "next/image";
import { useCopy } from "@/hooks/useCopy";
import { useToast } from "@/components/dashboard/Toast";
import { type EsimProfile, formatBytes } from "@/lib/esim-api";

/**
 * The expanded half of an EsimCard: everything needed to actually install the
 * profile, plus live usage.
 *
 * Three install paths are offered because device support differs:
 *   • iOS 17.4+ — a universal link that opens the system installer directly
 *   • QR scan — the provider-hosted QR image, for a second device
 *   • Manual — SM-DP+ address + activation code, the Android fallback
 */
export default function ActivationPanel({ profile }: { profile: EsimProfile }) {
  const { copy, isCopied } = useCopy();
  const { toast } = useToast();

  const doCopy = async (text: string, key: string) => {
    const ok = await copy(text, key);
    toast(
      ok ? "Copied" : "Couldn't copy — select it manually",
      ok ? "success" : "error",
    );
  };

  const iosLink = profile.activation_string
    ? `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(
        profile.activation_string,
      )}`
    : null;

  const remaining = Math.max(0, profile.total_bytes - profile.used_bytes);
  const usedPct = profile.total_bytes > 0
    ? Math.min(100, (profile.used_bytes / profile.total_bytes) * 100)
    : 0;

  return (
    <div className="space-y-4 pt-3">
      {/* Usage */}
      {profile.total_bytes > 0 && (
        <div>
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="font-mono text-[12px]" style={{ color: "#F5F5F5" }}>
              {formatBytes(remaining)} left
            </span>
            <span className="font-mono text-[11px]" style={{ color: "#555555" }}>
              {formatBytes(profile.used_bytes)} / {formatBytes(profile.total_bytes)}
            </span>
          </div>
          <div
            className="h-[6px] rounded-full overflow-hidden"
            style={{ backgroundColor: "#1A1A1A" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${usedPct}%`,
                backgroundColor: usedPct > 90 ? "#FF4444" : "#00FF94",
              }}
            />
          </div>
          {/* Upstream refreshes usage every 2-3h — say so rather than look broken. */}
          <p className="text-[10px] mt-1" style={{ color: "#555555" }}>
            Usage updates every few hours.
          </p>
        </div>
      )}

      {profile.expires_at && (
        <p className="font-mono text-[11px]" style={{ color: "#888888" }}>
          Expires {new Date(profile.expires_at).toLocaleDateString()}
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

      {profile.qr_code_url && (
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-[6px] p-2" style={{ backgroundColor: "#FFFFFF" }}>
            <Image
              src={profile.qr_code_url}
              alt="eSIM activation QR code"
              width={160}
              height={160}
              unoptimized
            />
          </div>
          <p className="text-[11px] text-center" style={{ color: "#555555" }}>
            Scan from another device: Settings → Cellular → Add eSIM
          </p>
        </div>
      )}

      <Field
        label="Activation string (LPA)"
        value={profile.activation_string}
        k="ac"
        doCopy={doCopy}
        isCopied={isCopied}
      />
      <Field
        label="SM-DP+ address"
        value={profile.smdp_address}
        k="smdp"
        doCopy={doCopy}
        isCopied={isCopied}
      />
      <Field
        label="Activation code"
        value={profile.activation_code}
        k="code"
        doCopy={doCopy}
        isCopied={isCopied}
      />

      <div className="grid grid-cols-2 gap-2">
        {profile.iccid && <MiniField label="ICCID" value={profile.iccid} />}
        {profile.apn && <MiniField label="APN" value={profile.apn} />}
        {profile.pin && <MiniField label="PIN" value={profile.pin} />}
        {profile.puk && <MiniField label="PUK" value={profile.puk} />}
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: "#555555" }}>
        On Android or older iPhones, add a data-only eSIM manually using the
        SM-DP+ address and activation code above.
        {profile.active_type === 2
          ? " This plan starts counting from your first network connection."
          : " This plan starts counting once the profile is installed."}
      </p>
    </div>
  );
}

function Field({
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
      <p
        className="text-[11px] uppercase mb-1"
        style={{ color: "#555555", letterSpacing: "0.08em" }}
      >
        {label}
      </p>
      <button
        onClick={() => doCopy(value, k)}
        className="w-full text-left rounded-[6px] px-3 py-2 font-mono text-[12px] break-all transition-colors"
        style={{
          backgroundColor: "#0F0F0F",
          border: "1px solid #1A1A1A",
          color: "#F5F5F5",
        }}
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
    <div
      className="rounded-[6px] px-3 py-2 min-w-0"
      style={{ backgroundColor: "#0F0F0F", border: "1px solid #1A1A1A" }}
    >
      <p className="text-[10px] uppercase" style={{ color: "#555555" }}>
        {label}
      </p>
      <p
        className="font-mono text-[13px] break-all"
        style={{ color: "#F5F5F5" }}
      >
        {value}
      </p>
    </div>
  );
}
