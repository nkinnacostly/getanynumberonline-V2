"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminCard } from "@/components/admin/AdminTable";
import EmailPreview from "@/components/admin/EmailPreview";
import UserPicker from "@/components/admin/UserPicker";
import { useToast } from "@/components/dashboard/Toast";
import {
  type AdminUser,
  type CampaignDraft,
  type EmailTemplate,
  TEMPLATES,
  createCampaign,
  getAudienceSize,
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

  const [template, setTemplate] = useState<EmailTemplate>("promo");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [headline, setHeadline] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
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

  const meta = TEMPLATES.find((t) => t.id === template)!;
  const targetId = lockedUser?.id ?? picked?.id;
  const ready =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    (audience === "all" || !!targetId);

  const draft: CampaignDraft = useMemo(
    () => ({
      subject,
      body,
      template,
      preheader,
      // A hero heading only exists on the layouts that draw one.
      ...(meta.hero
        ? { headline, cta_label: ctaLabel, cta_url: ctaUrl }
        : {}),
    }),
    [subject, body, template, preheader, meta.hero, headline, ctaLabel, ctaUrl],
  );

  /** Creates the draft on first use, then reuses it until the text changes. */
  const ensureCampaign = async (): Promise<string> => {
    if (campaignId) return campaignId;
    const res = await createCampaign({
      ...draft,
      subject: subject.trim(),
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
      setHeadline("");
      setPreheader("");
      setCtaLabel("");
      setCtaUrl("");
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

  /** Every input invalidates the test, so they all share one change handler. */
  const edit =
    (set: (v: string) => void) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      set(e.target.value);
      invalidate();
    };

  return (
    <AdminCard>
      <div className="grid lg:grid-cols-2 gap-6 p-4">
        <div className="flex flex-col gap-4">
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

          {/* Template */}
          <div>
            <Label>Template</Label>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTemplate(t.id);
                    invalidate();
                  }}
                  className="px-3 h-[38px] rounded-[6px] text-[13px] font-medium"
                  style={{
                    backgroundColor:
                      template === t.id ? "var(--accent)" : "var(--field)",
                    color:
                      template === t.id ? "var(--accent-ink)" : "var(--muted)",
                    border: `1px solid ${
                      template === t.id ? "var(--accent)" : "var(--line-strong)"
                    }`,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Hint>{meta.hint}</Hint>
          </div>

          <div>
            <Label>Subject</Label>
            <input
              value={subject}
              onChange={edit(setSubject)}
              placeholder="What lands in the inbox list"
              aria-label="Subject"
              className="w-full h-[44px] px-3 text-[14px] rounded-[6px] outline-none"
              style={field}
            />
          </div>

          <div>
            <Label>Preview line</Label>
            <input
              value={preheader}
              onChange={edit(setPreheader)}
              placeholder="Shown after the subject in the inbox (optional)"
              aria-label="Preview line"
              className="w-full h-[44px] px-3 text-[14px] rounded-[6px] outline-none"
              style={field}
            />
            <Hint>
              Left blank, the first line of your message is used.
            </Hint>
          </div>

          {meta.hero && (
            <>
              <div>
                <Label>Headline</Label>
                <input
                  value={headline}
                  onChange={edit(setHeadline)}
                  placeholder="The big heading in the banner (optional)"
                  aria-label="Headline"
                  className="w-full h-[44px] px-3 text-[14px] rounded-[6px] outline-none"
                  style={field}
                />
                <Hint>Left blank, the subject is used.</Hint>
              </div>

              <div>
                <Label>Button</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={ctaLabel}
                    onChange={edit(setCtaLabel)}
                    placeholder="Button text"
                    aria-label="Button text"
                    className="sm:w-[40%] h-[44px] px-3 text-[14px] rounded-[6px] outline-none"
                    style={field}
                  />
                  <input
                    value={ctaUrl}
                    onChange={edit(setCtaUrl)}
                    placeholder="https://www.getanynumberonline.com/dashboard"
                    aria-label="Button link"
                    inputMode="url"
                    className="flex-1 h-[44px] px-3 text-[14px] rounded-[6px] outline-none font-mono"
                    style={field}
                  />
                </div>
                <Hint>
                  Optional. A button is only drawn when there is a link for it
                  to point at.
                </Hint>
              </div>
            </>
          )}

          <div>
            <Label>Message</Label>
            <textarea
              value={body}
              onChange={edit(setBody)}
              rows={12}
              placeholder={
                template === "weekly"
                  ? "## This week\n\n- One thing that shipped\n- Another thing\n\n---\n\n## Coming up\n\nA short paragraph."
                  : "Write your message.\n\nBlank lines start a new paragraph. **bold** and [links](https://example.com) work."
              }
              aria-label="Message"
              className="w-full p-3 text-[14px] rounded-[6px] outline-none resize-y"
              style={field}
            />
            <Hint>
              Plain text with <b>##</b> headings, <b>-</b> bullets, <b>---</b>{" "}
              dividers, **bold** and [links](url). The unsubscribe footer is
              added automatically — it is required, so it cannot be removed.
            </Hint>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleTest}
              disabled={!ready || busy !== null}
              className="h-[44px] px-5 rounded-[6px] text-[14px] font-medium disabled:opacity-30"
              style={{
                border: "1px solid var(--line-strong)",
                color: "var(--foreground)",
              }}
            >
              {busy === "test" ? "Sending…" : "Send test to me"}
            </button>

            <button
              onClick={handleSend}
              disabled={!ready || !tested || busy !== null}
              title={!tested ? "Send yourself a test first" : undefined}
              className="h-[44px] px-5 rounded-[6px] text-[14px] font-bold disabled:opacity-30"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-ink)",
              }}
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

        <EmailPreview draft={draft} />
      </div>
    </AdminCard>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] uppercase tracking-wider mb-1.5"
      style={{ color: "var(--muted)" }}
    >
      {children}
    </p>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
      {children}
    </p>
  );
}
