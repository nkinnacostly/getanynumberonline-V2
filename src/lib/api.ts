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

export async function fetchSMSPool(
  endpoint: string,
  params: Record<string, string> = {},
) {
  const formData = new FormData();
  Object.entries(params).forEach(([key, value]) => formData.append(key, value));
  const res = await fetch(`https://api.smspool.net/${endpoint}`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`SMSPool request failed: ${res.status}`);
  return res.json();
}
