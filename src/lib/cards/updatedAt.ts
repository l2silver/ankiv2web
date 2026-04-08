/** Epoch ms from `updated_at` for last-write-wins merges; missing/invalid → 0. */
export function cardUpdatedAtEpochMs(card: { updated_at?: string }): number {
  const t = card.updated_at?.trim();
  if (!t) return 0;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? 0 : ms;
}
