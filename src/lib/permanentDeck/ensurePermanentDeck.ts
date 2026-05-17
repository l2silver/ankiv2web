import type { AppDispatch } from "@/lib/store";
import { upsertMany, type CardEntity } from "@/features/cards/cardsSlice";
import { buildPermanentCardTemplates } from "@/lib/permanentDeck/buildPermanentCards";
import { PERMANENT_CARD_IDS } from "@/lib/permanentDeck/constants";
import { idbGetAllCards, idbPutCards, type StoredCard } from "@/lib/db/cardsDb";
import { entityToStored, storedToEntity } from "@/lib/db/storedCard";

/**
 * Ensures the five built-in permanent deck cards exist in IndexedDB (and Redux via caller).
 * Preserves scheduling for existing rows; only seeds missing cards or refreshes image/deck metadata.
 */
export async function ensurePermanentDeckInIdb(): Promise<CardEntity[]> {
  const nowMs = Date.now();
  const templates = buildPermanentCardTemplates(nowMs);
  const templateById = new Map(templates.map((c) => [c.id, c]));

  const existing = await idbGetAllCards();
  const existingById = new Map(existing.map((r) => [r.id, r]));

  const toStore: StoredCard[] = [];
  const upserted: CardEntity[] = [];

  for (const id of PERMANENT_CARD_IDS) {
    const template = templateById.get(id);
    if (!template) continue;

    const prev = existingById.get(id);
    if (!prev) {
      toStore.push(entityToStored(template, false));
      upserted.push(template);
      continue;
    }

    const entity = storedToEntity(prev);
    if (entity.deleted_at?.trim()) {
      const revived: CardEntity = {
        ...template,
        ...entity,
        deleted_at: undefined,
        back: "",
        deck_id: template.deck_id,
        note_type: template.note_type,
        card_variant: template.card_variant,
        dirty: false,
      };
      toStore.push(entityToStored(revived, false));
      upserted.push(revived);
      continue;
    }

    const metadataChanged =
      entity.deck_id !== template.deck_id ||
      entity.note_type !== template.note_type ||
      entity.card_variant !== template.card_variant ||
      (entity.back?.trim() ?? "") !== "";

    if (metadataChanged) {
      const merged: CardEntity = {
        ...entity,
        back: "",
        deck_id: template.deck_id,
        note_type: template.note_type,
        card_variant: template.card_variant,
        dirty: false,
      };
      toStore.push(entityToStored(merged, false));
      upserted.push(merged);
    }
  }

  if (toStore.length > 0) {
    await idbPutCards(toStore);
  }

  return upserted;
}

export async function ensurePermanentDeck(dispatch: AppDispatch): Promise<number> {
  const upserted = await ensurePermanentDeckInIdb();
  if (upserted.length > 0) {
    dispatch(upsertMany(upserted));
  }
  return upserted.length;
}
