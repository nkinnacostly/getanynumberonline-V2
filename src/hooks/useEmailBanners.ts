"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type UploadedBanner,
  bannerRejectReason,
  listBanners,
  removeBanner,
  uploadBanner,
} from "@/lib/email-banners";

/**
 * The uploaded-banner library, loaded once and kept in step with the bucket.
 *
 * The state lives in a hook rather than in the picker because uploading has
 * three outcomes a component has to draw — in flight, refused, landed — and
 * the picker already has a grid, a drop target and a URL field to worry about.
 */
export function useEmailBanners() {
  const [banners, setBanners] = useState<UploadedBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBanners(await listBanners());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load banners");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Upload one or more files, newest first, and hand back the last one that
   * landed so the caller can select it.
   *
   * Files are checked up front and as a batch: dropping five photos where one
   * is a 12 MB TIFF should upload the four and name the one it skipped, not
   * abandon the lot.
   */
  const upload = useCallback(
    async (files: File[]): Promise<UploadedBanner | null> => {
      if (files.length === 0) return null;
      setBusy(true);
      setError(null);

      const refused: string[] = [];
      let last: UploadedBanner | null = null;

      for (const file of files) {
        const reason = bannerRejectReason(file);
        if (reason) {
          refused.push(reason);
          continue;
        }
        try {
          const added = await uploadBanner(file);
          last = added;
          setBanners((prev) => [added, ...prev]);
        } catch (e) {
          refused.push(e instanceof Error ? e.message : `${file.name} failed`);
        }
      }

      if (refused.length > 0) setError(refused.join(" "));
      setBusy(false);
      return last;
    },
    [],
  );

  const remove = useCallback(async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await removeBanner(name);
      setBanners((prev) => prev.filter((b) => b.name !== name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that banner");
    } finally {
      setBusy(false);
    }
  }, []);

  return { banners, loading, busy, error, upload, remove, refresh };
}
