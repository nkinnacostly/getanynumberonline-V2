"use client";

import { useState } from "react";
import { useToast } from "@/components/dashboard/Toast";
import {
  type AiDraft,
  type AiPlanEntry,
  draftCampaign,
  planCampaigns,
} from "@/lib/admin-api";

/**
 * The writer.
 *
 * Two modes, and neither one sends anything. "Write one" fills the composer
 * below, where every field stays editable and the test-before-send gate still
 * applies. "Plan several" saves drafts carrying proposed dates that show up on
 * the calendar as proposals — the scheduler ignores anything unapproved, so a
 * plan cannot turn into mail on its own.
 */
export default function AiWriter({
  onDraft,
  onPlanned,
}: {
  onDraft: (d: AiDraft) => void;
  onPlanned?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState<null | "one" | "plan">(null);
  const [plan, setPlan] = useState<AiPlanEntry[] | null>(null);

  const run = async (mode: "one" | "plan") => {
    if (brief.trim().length < 8) {
      toast("Say a bit more about what the email is for", "error");
      return;
    }
    setBusy(mode);
    setPlan(null);
    try {
      if (mode === "one") {
        const res = await draftCampaign(brief.trim());
        onDraft(res.draft);
        toast("Draft written — review it below", "success");
      } else {
        const res = await planCampaigns(brief.trim(), count);
        setPlan(res.created);
        toast(`${res.created.length} drafts saved for review`, "success");
        onPlanned?.();
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "The writer failed", "error");
    } finally {
      setBusy(null);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start px-3 h-[34px] rounded-[6px] text-[12px] font-medium"
        style={{
          border: "1px dashed var(--line-strong)",
          color: "var(--muted)",
        }}
      >
        ✦ Write it with AI
      </button>
    );
  }

  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-3"
      style={{
        border: "1px solid var(--line-strong)",
        backgroundColor: "color-mix(in srgb, var(--accent) 4%, transparent)",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--accent)" }}>
          ✦ Writer
        </span>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto text-[11px]"
          style={{ color: "var(--muted)" }}
        >
          close
        </button>
      </div>

      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={3}
        placeholder="What is this email for? e.g. 'Tell people eSIMs work at home in Nigeria, not just abroad' or 'Monthly update: new countries, faster OTPs'"
        aria-label="Brief for the writer"
        className="w-full p-2.5 text-[13px] rounded-[6px] outline-none resize-y"
        style={{
          backgroundColor: "var(--field)",
          border: "1px solid var(--line-strong)",
          color: "var(--foreground)",
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => run("one")}
          disabled={busy !== null}
          className="h-[36px] px-4 rounded-[6px] text-[13px] font-medium disabled:opacity-40"
          style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
        >
          {busy === "one" ? "Writing…" : "Write one"}
        </button>

        <span className="text-[11px]" style={{ color: "var(--muted)" }}>
          or
        </span>

        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="How many campaigns to plan"
          className="h-[36px] px-2 rounded-[6px] text-[13px] outline-none"
          style={{
            backgroundColor: "var(--field)",
            border: "1px solid var(--line-strong)",
            color: "var(--foreground)",
          }}
        >
          {[2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          onClick={() => run("plan")}
          disabled={busy !== null}
          className="h-[36px] px-4 rounded-[6px] text-[13px] font-medium disabled:opacity-40"
          style={{ border: "1px solid var(--line-strong)", color: "var(--foreground)" }}
        >
          {busy === "plan" ? "Planning…" : "Plan a calendar"}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
        The writer knows the product and the house voice, and is barred from
        inventing prices or statistics. It never sends: a plan becomes dated
        drafts on the calendar that still need your approval.
      </p>

      {plan && (
        <ul className="flex flex-col gap-1.5 pt-1">
          {plan.map((p) => (
            <li
              key={p.campaign_id}
              className="text-[12px] rounded-[6px] px-2.5 py-2"
              style={{ backgroundColor: "var(--field)" }}
            >
              <span className="font-mono text-[11px]" style={{ color: "var(--accent)" }}>
                {new Date(p.proposed_for).toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "short",
                })}
              </span>{" "}
              <span style={{ color: "var(--foreground)" }}>{p.subject}</span>
              {p.rationale && (
                <span className="block text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
                  {p.rationale}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
