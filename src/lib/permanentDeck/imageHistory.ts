import { idbGetMeta, idbSetMeta } from "@/lib/db/cardsDb";

import { canonicalPermanentImageUrl } from "@/lib/permanentDeck/imagePool";

const META_KEY = "permanentDeck.shownImages.v1";

export async function loadPermanentShownImages(): Promise<Set<string>> {
  const raw = await idbGetMeta(META_KEY);
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const out = new Set<string>();
    for (const v of parsed) {
      if (typeof v === "string" && v.trim()) {
        out.add(canonicalPermanentImageUrl(v));
      }
    }
    return out;
  } catch {
    return new Set();
  }
}

export async function savePermanentShownImages(shown: Set<string>): Promise<void> {
  await idbSetMeta(META_KEY, JSON.stringify([...shown]));
}

export function markPermanentImageShown(shown: Set<string>, url: string): void {
  const c = canonicalPermanentImageUrl(url);
  if (c) shown.add(c);
}

/** Clears local "already shown" history (e.g. after rebuilding a more diverse image pool). */
export async function clearPermanentShownImages(): Promise<void> {
  await idbSetMeta(META_KEY, JSON.stringify([]));
}
