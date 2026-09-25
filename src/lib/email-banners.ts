import { createClient } from "@/lib/supabase/client";

/**
 * Banner images an admin uploaded, in Supabase Storage.
 *
 * This is the one place in the admin UI that talks to Supabase directly rather
 * than through admin-api, and the reason is the bytes: an Edge Function body is
 * capped at 6 MB and base64 inflates a file by a third, so a 5 MB photo could
 * not get through. Storage is also the one resource whose access rules can be
 * written down instead of checked in code — `20260925120000_email_banner_uploads`
 * restricts every write to `public.is_admin()`, so the browser holding a
 * non-admin session cannot upload here no matter what it sends.
 *
 * The URL these produce is permanent and unauthenticated on purpose. It is
 * read by a stranger's mail client, months after the send, with no session.
 */

export const BANNER_BUCKET = "email-banners";

/** Matches the bucket's own file_size_limit — see the migration. */
export const MAX_BANNER_BYTES = 5 * 1024 * 1024;

/** Matches the bucket's allowed_mime_types. */
export const BANNER_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface UploadedBanner {
  /** The object key inside the bucket — what removeBanner takes. */
  name: string;
  /** The absolute, permanent URL that goes into the email. */
  url: string;
}

export function bannerPublicUrl(name: string): string {
  return createClient().storage.from(BANNER_BUCKET).getPublicUrl(name).data
    .publicUrl;
}

/**
 * Why this file can't be a banner, in a sentence, or null if it can.
 *
 * Checked before the upload purely so the answer is readable — Storage
 * enforces the same two rules and answers a breach with a bare 413/400.
 */
export function bannerRejectReason(file: File): string | null {
  if (!(BANNER_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name} is a ${file.type || "unknown"} — banners must be JPEG, PNG, WebP or GIF.`;
  }
  if (file.size > MAX_BANNER_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_BANNER_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

/**
 * Every banner uploaded so far, newest first.
 *
 * A bucket that does not exist answers `200 []` here — verified against the
 * live project — so this cannot tell "nothing uploaded yet" from "the
 * migration was never applied", and does not try to. The distinction only
 * matters when someone actually uploads, and uploadBanner says it plainly then.
 */
export async function listBanners(): Promise<UploadedBanner[]> {
  const { data, error } = await createClient()
    .storage.from(BANNER_BUCKET)
    .list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });

  if (error) throw new Error(error.message);

  // Storage lists a placeholder row for an empty folder; it has no id.
  return (data ?? [])
    .filter((o) => o.id)
    .map((o) => ({ name: o.name, url: bannerPublicUrl(o.name) }));
}

export async function uploadBanner(file: File): Promise<UploadedBanner> {
  const reason = bannerRejectReason(file);
  if (reason) throw new Error(reason);

  // A random key, not the original filename. Two people uploading "banner.jpg"
  // must not overwrite each other, and the name is about to be public.
  const name = `${crypto.randomUUID()}.${EXTENSIONS[file.type] ?? "jpg"}`;

  const { error } = await createClient()
    .storage.from(BANNER_BUCKET)
    .upload(name, file, {
      contentType: file.type,
      // Immutable: the key is unique per upload, so nothing behind this URL
      // ever changes and a mail client may cache it forever.
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) throw new Error(uploadFailureMessage(error.message));
  return { name, url: bannerPublicUrl(name) };
}

export async function removeBanner(name: string): Promise<void> {
  const { error } = await createClient()
    .storage.from(BANNER_BUCKET)
    .remove([name]);
  if (error) throw new Error(error.message);
}

/**
 * Storage's refusals, said in words an admin can act on.
 *
 * The two worth naming are the ones that are about setup rather than the file:
 * a missing bucket (the migration has not been applied to this project) and an
 * RLS refusal (this account is not an admin). Both otherwise read as jargon.
 */
function uploadFailureMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("bucket not found")) {
    return (
      "The email-banners bucket does not exist in this Supabase project yet — " +
      "apply the 20260925120000_email_banner_uploads migration."
    );
  }
  if (text.includes("row-level security") || text.includes("unauthorized")) {
    return "Only an admin account can upload banners.";
  }
  return message;
}
