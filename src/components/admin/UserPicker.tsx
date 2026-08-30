"use client";

import { useState } from "react";
import { type AdminUser, listUsers } from "@/lib/admin-api";

/** Email search that resolves to a real profile — never a free-typed address. */
export default function UserPicker({
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
