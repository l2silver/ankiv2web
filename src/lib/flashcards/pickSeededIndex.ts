/** Stable index in `[0, n)` from `key` (e.g. card id) so the same card keeps the same pick across flips. */
export function pickSeededIndex(key: string, n: number): number {
  if (n <= 0) return 0;
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h % n;
}
