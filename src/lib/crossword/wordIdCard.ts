/** Placed word id format: `${cardId}::${clueIndex}` */
export function cardIdFromPlacedWordId(wordId: string): string | null {
  const i = wordId.lastIndexOf("::");
  if (i <= 0) return null;
  const tail = wordId.slice(i + 2);
  if (!/^\d+$/.test(tail)) return null;
  return wordId.slice(0, i);
}
