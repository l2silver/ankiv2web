import poolIds from "@/lib/permanentDeck/imagePoolIds.json";

/** Unsplash CDN query (people-doing-things theme). */
const IMG_PARAMS = "auto=format&fit=crop&w=900&q=80";

function unsplashPhoto(photoId: string): string {
  return `https://images.unsplash.com/photo-${photoId}?${IMG_PARAMS}`;
}

/**
 * Curated people-activity photos from Unsplash search pages.
 * Theme: https://unsplash.com/s/photos/people-doing-things
 *
 * Regenerate with: `UNSPLASH_ACCESS_KEY=... node scripts/buildPermanentImagePool.mjs`
 * (or expand `imagePoolIds.json` via that script / search-page harvest).
 */
export const PERMANENT_IMAGE_POOL: readonly string[] = (poolIds as string[]).map(unsplashPhoto);

export function canonicalPermanentImageUrl(url: string): string {
  const t = url.trim();
  if (!t) return "";
  try {
    const u = new URL(t);
    return `${u.origin}${u.pathname}`;
  } catch {
    return t.split("?")[0] ?? t;
  }
}

export const PERMANENT_IMAGE_POOL_SIZE = PERMANENT_IMAGE_POOL.length;
