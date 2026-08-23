"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminTable";
import { useToast } from "@/components/dashboard/Toast";
import {
  type AdminSetting,
  dateTime,
  getSettings,
  SETTING_META,
  settingToDisplay,
  settingToStored,
  updateSetting,
} from "@/lib/admin-api";

/**
 * The fraud levers, editable.
 *
 * Each row saves independently — these values gate ordering and money, and a
 * single "Save all" invites changing four things while meaning to change one.
 * Bounds are enforced by admin_update_setting in the database; the inputs here
 * only mirror them, so a rejection still arrives as a clear message.
 */
export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminSetting[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSettings();
      setRows(res.rows ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load settings", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--foreground)" }}>
        Fraud settings
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--muted)" }}>
        Live values. A change applies to the next order or top-up — nothing is
        re-evaluated retroactively.
      </p>

      {loading ? (
        <AdminCard>
          <div className="flex justify-center py-16">
            <span
              className="auth-spinner"
              style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
            />
          </div>
        </AdminCard>
      ) : rows.length === 0 ? (
        <AdminCard>
          <p className="py-16 text-center text-sm" style={{ color: "var(--muted)" }}>
            No settings found.
          </p>
        </AdminCard>
      ) : (
        <div className="flex flex-col gap-4 max-w-2xl">
          {rows.map((row) => (
            <SettingRow
              key={row.key}
              setting={row}
              onSaved={(value) =>
                setRows((prev) =>
                  prev.map((r) => (r.key === row.key ? { ...r, value } : r)),
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SettingRow({
  setting,
  onSaved,
}: {
  setting: AdminSetting;
  onSaved: (value: number) => void;
}) {
  const { toast } = useToast();
  const meta = SETTING_META[setting.key];
  const initial = String(settingToDisplay(setting.key, setting.value));

  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);

  // A value changed in another tab (or by another admin) should win over a
  // stale untouched input.
  useEffect(() => {
    setDraft(String(settingToDisplay(setting.key, setting.value)));
  }, [setting.key, setting.value]);

  const parsed = parseFloat(draft);
  const valid = !isNaN(parsed);
  const dirty = valid && draft !== initial;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await updateSetting(
        setting.key,
        settingToStored(setting.key, parsed),
      );
      toast(`${meta?.label ?? setting.key} updated`, "success");
      onSaved(res.value);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const unit = meta?.unit;

  return (
    <AdminCard>
      <form onSubmit={save} className="p-4">
        <label
          htmlFor={`setting-${setting.key}`}
          className="block text-[14px] font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          {meta?.label ?? setting.key}
        </label>
        <p className="text-[12px] mt-1 mb-3" style={{ color: "var(--muted)" }}>
          {setting.description ?? meta?.hint ?? ""}
          {setting.description && meta?.hint ? ` ${meta.hint}` : ""}
        </p>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative sm:w-44">
            {unit === "usd" && (
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[14px] pointer-events-none"
                style={{ color: "var(--muted)" }}
              >
                $
              </span>
            )}
            <input
              id={`setting-${setting.key}`}
              type="number"
              step={meta?.step ?? 1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className={`w-full h-[44px] ${unit === "usd" ? "pl-7" : "pl-3"} ${
                unit === "percent" ? "pr-9" : "pr-3"
              } font-mono text-[14px] rounded-[6px] outline-none`}
              style={{
                backgroundColor: "var(--field)",
                border: "1px solid var(--line-strong)",
                color: "var(--foreground)",
              }}
            />
            {unit === "percent" && (
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[14px] pointer-events-none"
                style={{ color: "var(--muted)" }}
              >
                %
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={!dirty || saving}
            className="h-[44px] px-5 rounded-[6px] text-[14px] font-bold disabled:opacity-30 shrink-0"
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>

          <span
            className="font-mono text-[11px] sm:ml-auto"
            style={{ color: "var(--muted)" }}
          >
            updated {dateTime(setting.updated_at)}
          </span>
        </div>

        {!valid && draft.trim() !== "" && (
          <p className="text-[11px] mt-2" style={{ color: "var(--danger)" }}>
            Must be a number
          </p>
        )}
      </form>
    </AdminCard>
  );
}
