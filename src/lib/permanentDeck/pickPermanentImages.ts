import { PERMANENT_IMAGE_POOL, canonicalPermanentImageUrl } from "@/lib/permanentDeck/imagePool";

function shuffleInPlace<T>(arr: T[], seed: number): void {
  let s = seed >>> 0;
  for (let i = arr.length - 1; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    const j = (s >>> 0) % (i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

/**
 * Pick `count` distinct image URLs not in `shown` or `reserved`.
 * When the pool is exhausted, `shown` is cleared and selection continues (new cycle).
 */
export function pickUnusedPermanentImageUrls(
  count: number,
  shown: Set<string>,
  reserved: Set<string> = new Set(),
): string[] {
  if (count <= 0) return [];

  const exclude = new Set<string>([...shown, ...reserved].map(canonicalPermanentImageUrl));

  function available(): string[] {
    return PERMANENT_IMAGE_POOL.filter((u) => !exclude.has(canonicalPermanentImageUrl(u)));
  }

  let pool = available();
  if (pool.length < count) {
    shown.clear();
    exclude.clear();
    for (const r of reserved) exclude.add(canonicalPermanentImageUrl(r));
    pool = available();
  }

  if (pool.length < count) {
    // More cards than unique pool slots in this batch (should not happen with 5 cards).
    const shuffled = [...PERMANENT_IMAGE_POOL];
    shuffleInPlace(shuffled, Date.now());
    return shuffled.slice(0, count);
  }

  const shuffled = [...pool];
  shuffleInPlace(shuffled, Date.now() ^ count);
  return shuffled.slice(0, count);
}
