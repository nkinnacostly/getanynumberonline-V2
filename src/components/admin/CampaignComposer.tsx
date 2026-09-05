"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AdminCard } from "@/components/admin/AdminTable";
import AiWriter from "@/components/admin/AiWriter";
import EmailPreview from "@/components/admin/EmailPreview";
import HeroImagePicker from "@/components/admin/HeroImagePicker";
import UserPicker from "@/components/admin/UserPicker";
import { useToast } from "@/components/dashboard/Toast";
import {
  type AdminUser,
  type AiDraft,
  type AudienceSize,
  type CampaignContent,
  type CampaignDraft,
  type EmailTemplate,
  HERO_IMAGES,
  TEMPLATES,
  createCampaign,
  heroImageUrl,
  getAudienceSize,
  getUser,
  queueCampaign,
  sendCampaign,
  updateCampaign,
} from "@/lib/admin-api";

/**
 * A campaign handed to the composer to open.
 *
 * `nonce` exists so that clicking the same row twice reopens it: the effect
 * keys off the number, not the object, so an admin who has half-rewritten a
 * draft can abandon that and start again from what is saved.
 */
export interface OpenedCampaign {
  content: CampaignContent;
  nonce: number;
}

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
  onCampaignChange,
  opened,
}: {
  lockedUser?: { id: string; email: string | null };
  /** The send finished. Fires once, at the end — the user page closes on it. */
  onSent?: () => void;
  /**
   * A campaign row appeared or moved on the server: a test minted the draft,
   * a send queued it, a send finished or gave up part-way, the writer planned
   * a schedule. The list page reloads on this, so its table is never a
   * manual refresh behind what actually happened.
   */
  onCampaignChange?: () => void;
  /** A saved campaign to load in. See OpenedCampaign for the nonce. */
  opened?: OpenedCampaign | null;
}) {
  const { toast } = useToast();

  const [template, setTemplate] = useState<EmailTemplate>("promo");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [headline, setHeadline] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [heroImage, setHeroImage] = useState(
    heroImageUrl(HERO_IMAGES[0].file),
  );
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "user">(
    lockedUser ? "user" : "all",
  );
  const [picked, setPicked] = useState<AdminUser | null>(null);
  const [audienceSize, setAudienceSize] = useState<AudienceSize | null>(null);
  const eligible = audienceSize?.eligible ?? null;

  /**
   * The row this composer writes to.
   *
   * Set when the writer saves a draft, when a saved draft is opened, or on
   * first test — and from then on edits UPDATE it. Null means the next test
   * mints a new row, which is what a reused campaign wants: the sent original
   * keeps its own copy and its own numbers.
   */
  const [campaignId, setCampaignId] = useState<string | null>(null);
  /** Subject of the sent campaign this was copied from, for the banner. */
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  /** Status of the campaign that was opened, so the banner can warn about it. */
  const [openedStatus, setOpenedStatus] = useState<string | null>(null);
  /**
   * Have the fields been touched since the bound row was last written?
   *
   * Only a real edit may rewrite the row, because an update withdraws approval
   * and drops a scheduled campaign back to a draft. Opening an approved
   * campaign to send yourself a copy of it must not quietly unschedule it.
   */
  const [dirty, setDirty] = useState(false);
  const [tested, setTested] = useState(false);
  const [busy, setBusy] = useState<null | "test" | "send">(null);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    if (lockedUser) return;
    getAudienceSize()
      .then((r) => setAudienceSize(r.audience))
      .catch(() => setAudienceSize(null));
  }, [lockedUser]);

  /**
   * Any edit invalidates the test — otherwise you could test one message and
   * send a different one. The server enforces the same rule: admin_update_
   * campaign clears test_sent_at, so an edit cannot slip past the gate even if
   * this state were wrong.
   *
   * The bound row is deliberately KEPT. It used to be dropped here, which
   * meant every edit-then-test cycle left another near-identical draft behind.
   */
  const invalidate = () => {
    setTested(false);
    setProgress(null);
    setDirty(true);
  };

  /** Back to an empty composer, bound to nothing. Used after a send. */
  const reset = () => {
    setSubject("");
    setBody("");
    setHeadline("");
    setPreheader("");
    setCtaLabel("");
    setCtaUrl("");
    setCampaignId(null);
    setCopiedFrom(null);
    setOpenedStatus(null);
    setTested(false);
    setProgress(null);
    setDirty(false);
  };

  /**
   * An AI draft fills the fields in, as editable as anything typed. The writer
   * has already saved it, so `savedAs` binds this composer to that row rather
   * than creating a second copy of the same email on first test.
   */
  const loadDraft = (d: AiDraft, savedAs?: string) => {
    setTemplate(d.template);
    setSubject(d.subject);
    setBody(d.body);
    setPreheader(d.preheader ?? "");
    setHeadline(d.headline ?? "");
    setCtaLabel(d.cta_label ?? "");
    setCtaUrl(d.cta_url ?? "");
    // The writer saves without a banner, and the composer must show what is
    // saved — a preview with a banner the row does not have is a preview of
    // an email nobody will receive. Picking one marks it dirty and syncs it.
    setHeroImage("");
    setCampaignId(savedAs ?? null);
    setCopiedFrom(null);
    setOpenedStatus(null);
    setTested(false);
    setProgress(null);
    // Saved by the writer exactly as shown, so there is nothing to write back.
    setDirty(!savedAs);
  };

  /**
   * Open a saved campaign.
   *
   * Editable ones are bound and refined in place. A campaign that has already
   * gone out is a record with delivery rows counted against it, so it is
   * copied instead: the fields are filled, nothing is bound, and the next test
   * starts a fresh row.
   */
  const applied = useRef(-1);
  useEffect(() => {
    if (!opened || opened.nonce === applied.current) return;
    applied.current = opened.nonce;

    const c = opened.content;
    setTemplate(c.template);
    setSubject(c.subject);
    setBody(c.body);
    setPreheader(c.preheader ?? "");
    setHeadline(c.headline ?? "");
    setCtaLabel(c.cta_label ?? "");
    setCtaUrl(c.cta_url ?? "");
    setHeroImage(c.hero_image ?? "");
    setCampaignId(c.editable ? c.id : null);
    setCopiedFrom(c.editable ? null : c.subject);
    setOpenedStatus(c.status);
    // A draft that was already tested carries proof of it, and the fields
    // below are that exact row — so the gate is already satisfied and Send
    // stays live. Touching anything clears it again, as always. A reused
    // campaign gets a new row with no test against it, so it must be tested.
    setTested(c.editable && !!c.test_sent_at);
    setProgress(null);
    // Straight off the row, so a test that follows without an edit writes
    // nothing — which is what keeps an approved campaign approved.
    setDirty(!c.editable);

    if (lockedUser) return;
    setAudience(c.audience);
    if (c.audience === "user" && c.target_user_id) {
      // The row stores an id; the picker shows an email. Worth the extra read
      // rather than reopening a single-user campaign with no visible recipient.
      getUser(c.target_user_id)
        .then((r) =>
          setPicked({
            id: r.user.user_id,
            email: r.user.email,
            balance: r.user.balance,
            is_banned: r.user.is_banned,
            is_admin: r.user.is_admin,
            created_at: r.user.joined,
          }),
        )
        .catch(() => setPicked(null));
    } else {
      setPicked(null);
    }
  }, [opened, lockedUser]);

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
        ? {
            headline,
            cta_label: ctaLabel,
            cta_url: ctaUrl,
            hero_image: heroImage,
          }
        : {}),
    }),
    [
      subject,
      body,
      template,
      preheader,
      meta.hero,
      headline,
      ctaLabel,
      ctaUrl,
      heroImage,
    ],
  );

  /**
   * Make the saved row match what is on screen.
   *
   * Bound to a row, this overwrites it; otherwise it creates one. Either way
   * what gets tested and what gets sent are the same row, which is the only
   * property that matters here.
   */
  const ensureCampaign = async (): Promise<string> => {
    const content = {
      ...draft,
      subject: subject.trim(),
      audience,
      ...(audience === "user" && targetId ? { user_id: targetId } : {}),
    };
    if (campaignId) {
      if (dirty) {
        await updateCampaign({ ...content, campaign_id: campaignId });
        setDirty(false);
        setOpenedStatus("draft");
      }
      return campaignId;
    }
    const res = await createCampaign(content);
    setCampaignId(res.campaign_id);
    setDirty(false);
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
      // The draft row exists from here on, so the list has something new.
      onCampaignChange?.();
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
      // Queued, not sent — but the row is live from this moment, which is
      // what starts the list page ticking alongside the loop below.
      onCampaignChange?.();

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
      // The row is now a record of a send, so unbind from it too — another
      // edit must not rewrite something people have already received.
      reset();
      onSent?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Send failed", "error");
    } finally {
      setBusy(null);
      setProgress(null);
      // A send that threw half way still delivered everything up to that
      // point and the cron drains the rest, so the list is refreshed on the
      // failure path too — not only when the loop runs clean.
      onCampaignChange?.();
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
          {/* What is open, and what pressing Send will do to it. Without this
              "editing a saved draft" and "writing a new one" look identical. */}
          {(campaignId || copiedFrom) && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-[6px] px-3 py-2 text-[12px]"
              style={{
                backgroundColor: "color-mix(in srgb, var(--accent) 7%, transparent)",
                border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                color: "var(--foreground)",
              }}
            >
              <span>
                {copiedFrom
                  ? `New campaign, copied from “${copiedFrom}”. The original is untouched.`
                  : openedStatus === "scheduled"
                    ? "Editing a scheduled campaign. Saving a change returns it to a draft, so it needs testing and approving again."
                    : "Editing a saved draft — your changes overwrite it."}
              </span>
              <button
                onClick={reset}
                className="ml-auto px-2 py-1 rounded-[4px] text-[11px] font-medium"
                style={{
                  border: "1px solid var(--line-strong)",
                  color: "var(--muted)",
                }}
              >
                Start fresh
              </button>
            </div>
          )}

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

          {/* The order is not cosmetic: the sending plan has a daily cap, so a
              list that does not fit in one day gets cut somewhere. Better that
              the cut falls after the people who reliably open. */}
          {!lockedUser && audience === "all" && audienceSize && (
            <p
              className="text-[11px] leading-relaxed"
              style={{ color: "var(--muted)" }}
            >
              Sent in engagement order:{" "}
              <span style={{ color: "var(--accent)" }}>
                {audienceSize.engaged} who opened before
              </span>
              , then {audienceSize.unopened} delivered but unopened, then{" "}
              {audienceSize.fresh} who have never had one.
              {audienceSize.bounce_suppressed > 0 && (
                <>
                  {" "}
                  <span style={{ color: "var(--warning)" }}>
                    {audienceSize.bounce_suppressed} skipped
                  </span>{" "}
                  after bouncing last time.
                </>
              )}
            </p>
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

          <AiWriter
            onDraft={(d, savedAs) => {
              loadDraft(d, savedAs);
              // The writer saved it, so the list has a new row to show.
              onCampaignChange?.();
            }}
            onPlanned={onCampaignChange}
          />

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
                <Label>Banner</Label>
                <HeroImagePicker
                  value={heroImage}
                  onChange={(url) => {
                    setHeroImage(url);
                    invalidate();
                  }}
                />
                <Hint>
                  Sits above the heading. Choosing none falls back to the solid
                  brand banner, so the email never arrives looking unfinished.
                </Hint>
              </div>

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

            {/* Why Send is greyed out, stated rather than left to a tooltip.
                Loading an AI draft and editing after a test both clear
                `tested`, which is correct but invisible unless it is said. */}
            {busy === null && (
              <span
                className="text-[12px]"
                style={{ color: tested ? "var(--accent)" : "var(--muted)" }}
              >
                {!ready
                  ? "Add a subject and a message."
                  : tested
                    ? "Test delivered — check it before sending."
                    : "Send unlocks once you have sent yourself a test. Editing after a test resets it."}
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
