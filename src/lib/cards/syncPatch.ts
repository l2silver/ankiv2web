import type { SyncPatchCard } from "@/lib/api/types";
import type { StoredCard } from "@/lib/db/cardsDb";

const PATCH_KEYS = [
  "due_at",
  "interval_days",
  "ease",
  "reps",
  "lapses",
  "last_reviewed_at",
  "suspended",
  "buried",
  "deck_id",
  "front",
  "back",
  "context",
  "note_type",
  "card_variant",
  "more_questions",
] as const;

export function storedCardToSyncPatch(card: StoredCard): SyncPatchCard | null {
  const patch: SyncPatchCard = { id: card.id };
  let n = 0;
  for (const k of PATCH_KEYS) {
    const v = card[k as keyof StoredCard];
    if (v !== undefined && v !== null) {
      (patch as Record<string, unknown>)[k] = v;
      n++;
    }
  }
  if (n === 0) return null;
  return patch;
}
