import { createClient } from "@/lib/supabase/client";

export async function callEdgeFunction(
  name: string,
  body: Record<string, unknown>,
) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify(body),
    },
  );

  const data = await res.json();
  if (!res.ok || data.error)
    throw new Error(data.error || `Request failed with status ${res.status}`);
  return data;
}

// fetchSMSPool used to live here and called api.smspool.net straight from the
// browser. It is gone deliberately, and must not come back: CLAUDE.md §9 keeps
// provider calls server-side so the API key stays there, and SMSPool now
// answers cross-origin requests without Access-Control-Allow-Origin, so a
// browser blocks them regardless. Number catalog and pricing go through the
// get-number-catalog Edge Function.
