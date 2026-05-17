import { upsertMany, type CardEntity } from "@/features/cards/cardsSlice";
import type { AppDispatch } from "@/lib/store";
import { idbPutCards } from "@/lib/db/cardsDb";
import { entityToStored } from "@/lib/db/storedCard";
import {
  loadPermanentShownImages,
  markPermanentImageShown,
  savePermanentShownImages,
} from "@/lib/permanentDeck/imageHistory";
import { pickUnusedPermanentImageUrls } from "@/lib/permanentDeck/pickPermanentImages";

/**
 * Assign a fresh, never-before-shown (in this history cycle) image to each due card in the session.
 * Persists to IndexedDB without marking cards dirty for server sync.
 */
export async function assignPermanentSessionImages(
  dispatch: AppDispatch,
  getCard: (id: string) => CardEntity | undefined,
  cardIds: string[],
): Promise<void> {
  if (cardIds.length === 0) return;

  const shown = await loadPermanentShownImages();
  const reserved = new Set<string>();
  const urls = pickUnusedPermanentImageUrls(cardIds.length, shown, reserved);

  const updates: CardEntity[] = [];
  for (let i = 0; i < cardIds.length; i++) {
    const id = cardIds[i]!;
    const url = urls[i];
    if (!url) continue;
    const card = getCard(id);
    if (!card) continue;
    markPermanentImageShown(shown, url);
    updates.push({ ...card, front: url, dirty: false });
  }

  if (updates.length === 0) return;

  await savePermanentShownImages(shown);
  await idbPutCards(updates.map((c) => entityToStored(c, false)));
  dispatch(upsertMany(updates));
}
