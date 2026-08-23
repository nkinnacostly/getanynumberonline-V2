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
            <span className="font-mono text-[12px]" style={{ color: "var(--foreground)" }}>
              {formatBytes(remaining)} left
            </span>
            <span className="font-mono text-[11px]" style={{ color: "var(--muted)" }}>
              {formatBytes(profile.used_bytes)} / {formatBytes(profile.total_bytes)}
            </span>
          </div>
          <div
            className="h-[6px] rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--line)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${usedPct}%`,
                backgroundColor: usedPct > 90 ? "var(--danger)" : "var(--accent)",
              }}
            />
          </div>
          {/* Upstream refreshes usage every few hours — say so rather than look broken. */}
          <p className="text-[10px] mt-1" style={{ color: "var(--muted)" }}>
            Usage updates every few hours.
          </p>
        </div>
      )}

      {/* Step-by-step activation */}
      <div
        className="rounded-[6px] p-3"
        style={{ border: "1px solid var(--line-strong)", backgroundColor: "var(--surface)" }}
      >
        <p
          className="text-[11px] uppercase mb-2"
          style={{ color: "var(--muted)", letterSpacing: "0.08em" }}
        >
          How to activate
        </p>
        <ol className="space-y-1.5">
          {(profile.activation_string
            ? [
                <>Tap <b>Install on iPhone</b> below — or scan the QR with another device.</>,
                <>No iPhone? On Android go to <b>Settings → Network → SIMs → Add eSIM</b> and paste the activation string.</>,
                <>
                  When asked, allow the line to activate and set it as your{" "}
                  <b>default data line</b>.
                </>,
                <>
                  Turn <b>Data Roaming ON</b> for this line — data won&apos;t flow without it.
                  Calls/SMS stay on your primary SIM.
                </>,
                <>
                  Wait for a signal, then load a page. The clock starts on first
                  connection{profile.expires_at ? " — see expiry below" : ""}.
                </>,
              ]
            : [
                <>Scan the QR below with another device&apos;s camera.</>,
                <>Follow the prompts to add the plan, then set it as your default data line.</>,
                <>Turn Data Roaming ON for this line and wait for a signal.</>,
              ]
          ).map((step, i) => (
            <li key={i} className="flex gap-2 text-[12px] leading-relaxed">
              <span
                className="font-mono font-bold shrink-0"
                style={{ color: "var(--accent)" }}
              >
                {i + 1}.
              </span>
              <span style={{ color: "var(--foreground)" }}>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {profile.expires_at && (
        <p className="font-mono text-[11px]" style={{ color: "var(--muted)" }}>
          Expires {new Date(profile.expires_at).toLocaleDateString()}
          {profile.unused_valid_days
            ? ` · installable unused for ${Math.round(profile.unused_valid_days)} days`
            : ""}
        </p>
      )}

      {iosLink && (
        <a
          href={iosLink}
          className="block w-full text-center h-[44px] leading-[44px] rounded-[6px] text-[14px] font-bold"
          style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
        >
          Install on iPhone (iOS 17.4+)
        </a>
      )}

      {profile.qr_code_url && (
        <div className="flex flex-col items-center gap-2">
          {/* Deliberately white in both themes — QR codes need a light
              background for camera scanners to read them reliably. */}
          <div className="rounded-[6px] p-2" style={{ backgroundColor: "#FFFFFF" }}>
            <Image
              src={profile.qr_code_url}
              alt="eSIM activation QR code"
              width={160}
              height={160}
              unoptimized
            />
          </div>
          <p className="text-[11px] text-center" style={{ color: "var(--muted)" }}>
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

      {profile.iccid && <MiniField label="ICCID" value={profile.iccid} />}

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
        Data-only eSIM — no phone number, calls or SMS. Your WhatsApp/Telegram
        stay tied to your physical SIM.
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
        style={{ color: "var(--muted)", letterSpacing: "0.08em" }}
      >
        {label}
      </p>
      <button
        onClick={() => doCopy(value, k)}
        className="w-full text-left rounded-[6px] px-3 py-2 font-mono text-[12px] break-all transition-colors"
        style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--line)",
          color: "var(--foreground)",
        }}
      >
        {value}
        <span className="ml-2 text-[10px]" style={{ color: "var(--accent)" }}>
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
      style={{ backgroundColor: "var(--surface)", border: "1px solid var(--line)" }}
    >
      <p className="text-[10px] uppercase" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p
        className="font-mono text-[13px] break-all"
        style={{ color: "var(--foreground)" }}
      >
        {value}
      </p>
    </div>
  );
}
