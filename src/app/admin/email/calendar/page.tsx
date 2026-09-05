"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/dashboard/Toast";
import {
  type CalendarBacklogEntry,
  type CalendarEntry,
  approveCampaign,
  getCampaignCalendar,
  scheduleCampaign,
} from "@/lib/admin-api";

/**
 * The sending calendar.
 *
 * A month grid of what is going out and when, plus the drafts with no date
 * yet. The whole point is the review gate: a campaign only leaves on its date
 * if someone has approved it, and the dispatcher re-checks that at the moment
 * of sending rather than trusting whatever was true when the date was picked.
 */

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday-first grid start for the month containing `d`. */
function gridStart(d: Date): Date {
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const weekday = (first.getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(first.getTime() - weekday * DAY_MS);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default function CampaignCalendarPage() {
  const { toast } = useToast();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [backlog, setBacklog] = useState<CalendarBacklogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = gridStart(month);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY_MS));
  }, [month]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = days[0].toISOString();
      const to = new Date(days[41].getTime() + DAY_MS).toISOString();
      const res = await getCampaignCalendar(from, to);
      setEntries(res.entries ?? []);
      setBacklog(res.unscheduled ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load the calendar", "error");
    } finally {
      setLoading(false);
    }
  }, [days, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      const k = ymd(new Date(e.at));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [entries]);

  const act = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try {
      await fn();
      toast(done, "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't work", "error");
    } finally {
      setBusy(null);
    }
  };

  const place = (entry: CalendarBacklogEntry, day: Date) => {
    // 09:00 UTC: a defensible default hour rather than whatever time of day
    // the admin happened to click.
    const when = new Date(day);
    when.setUTCHours(9, 0, 0, 0);
    return act(
      entry.id,
      () => scheduleCampaign(entry.id, when.toISOString()),
      `Scheduled for ${when.toLocaleDateString()}`,
    );
  };

  const monthLabel = month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const shift = (n: number) =>
    setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + n, 1)));

  const [picked, setPicked] = useState<CalendarBacklogEntry | null>(null);
  const todayKey = ymd(new Date());

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
          Calendar
        </h1>
        <Link
          href="/admin/email"
          className="text-[12px] underline underline-offset-2"
          style={{ color: "var(--muted)" }}
        >
          back to campaigns
        </Link>
      </div>
      <p className="text-[13px] mb-6" style={{ color: "var(--muted)" }}>
        A campaign leaves on its date only if it is approved. Approval is
        re-checked at the moment of sending, so withdrawing it stops a send that
        is already scheduled.
      </p>

      {/* Backlog — drafts waiting for a date */}
      {backlog.length > 0 && (
        <div
          className="rounded-lg p-3 mb-4"
          style={{ border: "1px solid var(--line)", backgroundColor: "var(--surface)" }}
        >
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
            Undated drafts {picked ? "— now pick a day" : "— tap one, then tap a day"}
          </p>
          <div className="flex flex-wrap gap-2">
            {backlog.map((b) => (
              <button
                key={b.id}
                onClick={() => setPicked(picked?.id === b.id ? null : b)}
                className="px-2.5 py-1.5 rounded-[6px] text-[12px] text-left max-w-[240px] truncate"
                style={{
                  backgroundColor:
                    picked?.id === b.id ? "var(--accent)" : "var(--field)",
                  color: picked?.id === b.id ? "var(--accent-ink)" : "var(--foreground)",
                  border: `1px solid ${picked?.id === b.id ? "var(--accent)" : "var(--line-strong)"}`,
                }}
              >
                {b.source === "ai" && "✦ "}
                {b.subject}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Month header */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className="w-[36px] h-[36px] rounded-[6px]"
          style={{ border: "1px solid var(--line-strong)", color: "var(--foreground)" }}
        >
          ‹
        </button>
        <span className="font-mono text-[13px]" style={{ color: "var(--foreground)" }}>
          {monthLabel}
        </span>
        <button
          onClick={() => shift(1)}
          aria-label="Next month"
          className="w-[36px] h-[36px] rounded-[6px]"
          style={{ border: "1px solid var(--line-strong)", color: "var(--foreground)" }}
        >
          ›
        </button>
        {loading && (
          <span className="text-[11px]" style={{ color: "var(--muted)" }}>
            loading…
          </span>
        )}
      </div>

      {/* Grid. Scrolls horizontally on a phone rather than crushing the cells. */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 680 }}>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-[10px] uppercase tracking-wider px-1"
                style={{ color: "var(--muted)" }}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = ymd(day);
              const inMonth = day.getUTCMonth() === month.getUTCMonth();
              const items = byDay.get(key) ?? [];
              const isToday = key === todayKey;
              const past = key < todayKey;
              return (
                <div
                  key={key}
                  onClick={() => picked && !past && place(picked, day).then(() => setPicked(null))}
                  className={`rounded-[6px] p-1.5 flex flex-col gap-1 ${
                    picked && !past ? "cursor-pointer" : ""
                  }`}
                  style={{
                    minHeight: 92,
                    backgroundColor: inMonth ? "var(--surface)" : "transparent",
                    border: `1px solid ${isToday ? "var(--accent)" : "var(--line)"}`,
                    opacity: inMonth ? 1 : 0.4,
                  }}
                >
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: isToday ? "var(--accent)" : "var(--muted)" }}
                  >
                    {day.getUTCDate()}
                  </span>
                  {items.map((e) => (
                    <DayEntry
                      key={e.id}
                      entry={e}
                      busy={busy === e.id}
                      onApprove={() =>
                        act(e.id, () => approveCampaign(e.id, true), "Approved")
                      }
                      onUnapprove={() =>
                        act(e.id, () => approveCampaign(e.id, false), "Approval withdrawn")
                      }
                      onUnschedule={() =>
                        act(e.id, () => scheduleCampaign(e.id, null), "Back to drafts")
                      }
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  scheduled: "var(--accent)",
  queued: "var(--warning)",
  sending: "var(--warning)",
  sent: "var(--muted)",
  failed: "var(--danger)",
  draft: "var(--muted)",
};

function DayEntry({
  entry,
  busy,
  onApprove,
  onUnapprove,
  onUnschedule,
}: {
  entry: CalendarEntry;
  busy: boolean;
  onApprove: () => void;
  onUnapprove: () => void;
  onUnschedule: () => void;
}) {
  const tone = TONE[entry.status] ?? "var(--muted)";
  const editable = entry.status === "draft" || entry.status === "scheduled";

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="rounded-[4px] px-1.5 py-1 text-[10px] leading-tight"
      style={{
        backgroundColor: `color-mix(in srgb, ${tone} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${tone} 40%, transparent)`,
        opacity: busy ? 0.5 : 1,
      }}
    >
      <Link
        href={`/admin/email/${entry.id}`}
        className="block truncate"
        style={{ color: "var(--foreground)" }}
        title={entry.subject}
      >
        {entry.source === "ai" && "✦ "}
        {entry.subject}
      </Link>
      <span className="font-mono" style={{ color: tone }}>
        {entry.status}
      </span>

      {editable && (
        <div className="flex flex-wrap gap-1 mt-1">
          {!entry.approved ? (
            <button
              onClick={onApprove}
              disabled={busy}
              className="px-1.5 py-0.5 rounded-[3px] font-medium"
              style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
            >
              approve
            </button>
          ) : (
            <button
              onClick={onUnapprove}
              disabled={busy}
              className="px-1.5 py-0.5 rounded-[3px]"
              style={{ border: "1px solid var(--line-strong)", color: "var(--muted)" }}
            >
              unapprove
            </button>
          )}
          <button
            onClick={onUnschedule}
            disabled={busy}
            className="px-1.5 py-0.5 rounded-[3px]"
            style={{ border: "1px solid var(--line-strong)", color: "var(--muted)" }}
          >
            undate
          </button>
        </div>
      )}

      {!entry.tested && entry.audience === "all" && (
        <span className="block mt-0.5" style={{ color: "var(--warning)" }}>
          needs a test
        </span>
      )}
    </div>
  );
}
