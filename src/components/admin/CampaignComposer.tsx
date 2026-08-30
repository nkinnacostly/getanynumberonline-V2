"use client";

import { useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminTable";
import { useToast } from "@/components/dashboard/Toast";
import {
  type AdminUser,
  createCampaign,
  getAudienceSize,
  listUsers,
  queueCampaign,
  sendCampaign,
} from "@/lib/admin-api";

/**
 * Write a campaign and send it.
 *
 * Used from /admin/email for a broadcast and from a user's detail page for a
 * one-off, so the compose, test and send logic exists once. `lockedUser` fixes
 * the recipient and hides the audience choice.
 *
 * The order of the controls is the safety model: you cannot reach "Send" until
 * a test has landed in your own inbox, and the button states that it is about
 * to mail a specific number of people. Both are also enforced server-side —
 * admin_queue_campaign refuses an untested broadcast.
 */
export default function CampaignComposer({
  lockedUser,
  onSent,
}: {
  lockedUser?: { id: string; email: string | null };
  onSent?: () => void;
}) {
  const { toast } = useToast();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "user">(
    lockedUser ? "user" : "all",
  );
  const [picked, setPicked] = useState<AdminUser | null>(null);
  const [eligible, setEligible] = useState<number | null>(null);

  // Campaign id, minted on first test so the draft is persisted server-side.
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [tested, setTested] = useState(false);
  const [busy, setBusy] = useState<null | "test" | "send">(null);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    if (lockedUser) return;
    getAudienceSize()
      .then((r) => setEligible(r.audience.eligible))
      .catch(() => setEligible(null));
  }, [lockedUser]);

  // Any edit invalidates the test — otherwise you could test one message and
  // send a different one.
  const invalidate = () => {
    setCampaignId(null);
    setTested(false);
    setProgress(null);
  };

  const targetId = lockedUser?.id ?? picked?.id;
  const ready =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    (audience === "all" || !!targetId);

  /** Creates the draft on first use, then reuses it until the text changes. */
  const ensureCampaign = async (): Promise<string> => {
    if (campaignId) return campaignId;
    const res = await createCampaign({
      subject: subject.trim(),
      body,
      audience,
      ...(audience === "user" && targetId ? { user_id: targetId } : {}),
    });
    setCampaignId(res.campaign_id);
    return res.campaign_id;
  };

  const handleTest = async () => {
    if (!ready) return;
    setBusy("test");
    try {
      const id = await ensureCampaign();
      const res = await sendCampaign(id, true);
      setTested(true);
      toast(`Test sent to ${res.sent_to ?? "your inbox"}`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Test send failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const handleSend = async () => {
    if (!ready || !campaignId) return;
    const who =
      audience === "all"
        ? `all ${eligible ?? "?"} subscribers`
        : (lockedUser?.email ?? picked?.email ?? "this user");
    if (!confirm(`Send "${subject.trim()}" to ${who}? This cannot be undone.`)) {
      return;
    }

    setBusy("send");
    try {
      const count = await queueCampaign(campaignId);
      setProgress(`Queued ${count.recipient_count}…`);

      // The function sends a bounded number of batches per call and reports
      // what is left, so the client keeps calling until the queue is empty.
      let sent = 0;
      let guard = 0;
      for (;;) {
        const res = await sendCampaign(campaignId);
        sent += res.sent;
        setProgress(`Sent ${sent} of ${count.recipient_count}…`);
        if (res.done || ++guard > 200) break;
      }

      toast(`Sent to ${sent} recipient${sent === 1 ? "" : "s"}`, "success");
      setSubject("");
      setBody("");
      invalidate();
      onSent?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Send failed", "error");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const field = {
    backgroundColor: "var(--field)",
    border: "1px solid var(--line-strong)",
    color: "var(--foreground)",
  };

  return (
    <AdminCard>
      <div className="p-4 flex flex-col gap-4">
        {!lockedUser && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex gap-2">
              {(["all", "user"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    setAudience(a);
                    invalidate();
                  }}
                  className="px-4 h-[38px] rounded-[6px] text-[13px] font-medium"
                  style={{
                    backgroundColor:
                      audience === a ? "var(--accent)" : "var(--field)",
                    color:
                      audience === a ? "var(--accent-ink)" : "var(--muted)",
                    border: `1px solid ${
                      audience === a ? "var(--accent)" : "var(--line-strong)"
                    }`,
                  }}
                >
                  {a === "all" ? "All subscribers" : "One user"}
                </button>
              ))}
            </div>
            {audience === "all" && (
              <span
                className="font-mono text-[12px]"
                style={{ color: "var(--muted)" }}
              >
                {eligible === null ? "…" : `${eligible} eligible`}
              </span>
            )}
          </div>
        )}

        {!lockedUser && audience === "user" && (
          <UserPicker
            picked={picked}
            onPick={(u) => {
              setPicked(u);
              invalidate();
            }}
          />
        )}

        {lockedUser && (
          <p className="font-mono text-[12px]" style={{ color: "var(--muted)" }}>
            To: {lockedUser.email ?? lockedUser.id}
          </p>
        )}

        <input
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            invalidate();
          }}
          placeholder="Subject"
          aria-label="Subject"
          className="h-[44px] px-3 text-[14px] rounded-[6px] outline-none"
          style={field}
        />

        <div>
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              invalidate();
            }}
            rows={10}
            placeholder={"Write your message.\n\nBlank lines start a new paragraph. **bold** and [links](https://example.com) work."}
            aria-label="Message"
            className="w-full p-3 text-[14px] rounded-[6px] outline-none resize-y"
            style={field}
          />
          <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
            Plain text with **bold** and [links](url). An unsubscribe footer is
            added automatically — it is required, so it cannot be removed.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleTest}
            disabled={!ready || busy !== null}
            className="h-[44px] px-5 rounded-[6px] text-[14px] font-medium disabled:opacity-30"
            style={{ border: "1px solid var(--line-strong)", color: "var(--foreground)" }}
          >
            {busy === "test" ? "Sending…" : "Send test to me"}
          </button>

          <button
            onClick={handleSend}
            disabled={!ready || !tested || busy !== null}
            title={!tested ? "Send yourself a test first" : undefined}
            className="h-[44px] px-5 rounded-[6px] text-[14px] font-bold disabled:opacity-30"
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {busy === "send"
              ? (progress ?? "Sending…")
              : audience === "all"
                ? `Send to ${eligible ?? "…"} people`
                : "Send"}
          </button>

          {tested && busy === null && (
            <span className="text-[12px]" style={{ color: "var(--accent)" }}>
              Test delivered — check it before sending.
            </span>
          )}
        </div>
      </div>
    </AdminCard>
  );
}

/** Email search that resolves to a real profile — never a free-typed address. */
function UserPicker({
  picked,
  onPick,
}: {
  picked: AdminUser | null;
  onPick: (u: AdminUser | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    if (!term.trim()) return;
    setSearching(true);
    try {
      const res = await listUsers({ search: term.trim(), limit: 5 });
      setHits(res.rows ?? []);
    } finally {
      setSearching(false);
    }
  };

  if (picked) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px]" style={{ color: "var(--foreground)" }}>
          {picked.email}
        </span>
        <button
          onClick={() => onPick(null)}
          className="text-[12px] underline"
          style={{ color: "var(--muted)" }}
        >
          change
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Search by email…"
          aria-label="Search for a user"
          className="flex-1 h-[44px] px-3 text-[14px] rounded-[6px] outline-none"
          style={{
            backgroundColor: "var(--field)",
            border: "1px solid var(--line-strong)",
            color: "var(--foreground)",
          }}
        />
        <button
          onClick={search}
          disabled={searching}
          className="h-[44px] px-4 rounded-[6px] text-[13px] font-medium"
          style={{ border: "1px solid var(--line-strong)", color: "var(--foreground)" }}
        >
          {searching ? "…" : "Find"}
        </button>
      </div>
      {hits.map((u) => (
        <button
          key={u.id}
          onClick={() => onPick(u)}
          className="text-left px-3 py-2 rounded-[6px] font-mono text-[13px]"
          style={{ backgroundColor: "var(--field)", color: "var(--foreground)" }}
        >
          {u.email}
        </button>
      ))}
    </div>
  );
}
