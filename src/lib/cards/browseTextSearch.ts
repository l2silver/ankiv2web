import type { CardEntity } from "@/features/cards/cardsSlice";

/** Lowercase haystack of plain-text fields searched in the note browser. */
export function cardBrowseSearchHaystack(card: CardEntity): string {
  const parts = [
    card.front,
    card.back,
    card.context,
    card.extended,
    card.deck_id,
    card.note_type,
    card.card_variant,
  ];
  return parts
    .map((s) => s?.trim())
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function cardMatchesBrowseTextQuery(card: CardEntity, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return cardBrowseSearchHaystack(card).includes(q);
}

/** Keep cards whose searchable text contains `query`; preserves input order. */
export function filterCardIdsByBrowseText(
  byId: Record<string, CardEntity>,
  ids: string[],
  query: string,
): string[] {
  const q = query.trim();
  if (!q) return ids;
  return ids.filter((id) => {
    const c = byId[id];
    return Boolean(c && cardMatchesBrowseTextQuery(c, q));
  });
}
