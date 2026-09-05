"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useNavigate } from "@/hooks/useNavigate";
import { createClient } from "@/lib/supabase/client";

/**
 * The one sign-out control, shared by the desktop sidebar and the mobile top
 * bar. A real bordered button (not a bare text link) so it reads as tappable,
 * with a busy state so a slow signOut() can't be double-fired.
 */
export default function SignOutButton({
  className = "",
}: {
  className?: string;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      navigate("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      aria-label="Sign out"
      className={`inline-flex items-center justify-center gap-2 h-[44px] px-3 rounded-[6px] text-[13px] font-semibold border border-line-strong text-muted hover:text-danger hover:border-danger transition-colors disabled:opacity-40 ${className}`}
    >
      {busy ? (
        <span
          className="auth-spinner"
          style={{
            width: 14,
            height: 14,
            borderColor: "currentColor",
            borderTopColor: "transparent",
          }}
        />
      ) : (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      )}
      Sign out
    </button>
  );
}
