import type { CardEntity } from "@/features/cards/cardsSlice";

import type { StoredCard } from "@/lib/db/cardsDb";

/** Drop IndexedDB-only fields for API / Redux. */
export function storedToEntity(row: StoredCard): CardEntity {
  const { _dirty, ...rest } = row;
  return { ...rest, dirty: Boolean(_dirty) };
}

/** Prepare a row for IndexedDB (no Redux `dirty` flag; use `_dirty` instead). */
export function entityToStored(entity: CardEntity, dirty: boolean): StoredCard {
  const row: StoredCard = { ...entity };
  delete row.dirty;
  if (dirty) {
    row._dirty = true;
  } else {
    delete row._dirty;
  }
  return row;
}
