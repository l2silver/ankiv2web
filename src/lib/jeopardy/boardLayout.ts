import type { CardEntity } from "@/features/cards/cardsSlice";
import { cardMatchesDeckPath, dueCardIdsForDeck } from "@/lib/cards/deckTree";
import { isCardDueNow } from "@/lib/cards/due";
import { countsInFlashcardStudyQueue } from "@/lib/flashcards/moreQuestionEligible";

export const JEOPARDY_COL_COUNT = 5;
export const JEOPARDY_ROW_COUNT = 6;
export const JEOPARDY_MAX_CARDS = JEOPARDY_COL_COUNT * JEOPARDY_ROW_COUNT;

/** Per-row stakes (classic Jeopardy-style: same dollar row across categories). */
const ROW_STAKES = [200, 400, 600, 800, 1000, 1200] as const;

export type JeopardyCellPlacement = {
  col: number;
  row: number;
  cardId: string;
  stake: number;
};

export function stakeForRow(rowIdx: number): number {
  if (rowIdx >= 0 && rowIdx < ROW_STAKES.length) return ROW_STAKES[rowIdx];
  return 200 * (rowIdx + 1);
}

/** Higher scores sort into harder tiers (column 5) and heavier rows within the bucket. */
function jeopardyHardness(card: CardEntity): number {
  const lapses = Number(card.lapses) || 0;
  const ease = Number(card.ease);
  const easeEff = Number.isFinite(ease) ? ease : 250;
  const interval = Number(card.interval_days);
  const intervalEff = Number.isFinite(interval) && interval > 0 ? interval : 0;
  const reps = Number(card.reps) || 0;
  const lapseTerm = lapses * 42;
  const easeTerm = Math.max(0, 280 - easeEff) / 8;
  const intervalTerm = intervalEff <= 0 ? 45 : Math.max(0, 180 - intervalEff) * 0.35;
  const masteryEase = Math.min(reps, 20) * -1.2;
  return lapseTerm + easeTerm + intervalTerm + masteryEase;
}

function sortDueIds(byId: Record<string, CardEntity>, ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const ta = Date.parse(byId[a]?.due_at ?? "") || 0;
    const tb = Date.parse(byId[b]?.due_at ?? "") || 0;
    if (ta !== tb) return ta - tb;
    return a.localeCompare(b);
  });
}

function flashcardEligibleInSubtree(
  byId: Record<string, CardEntity>,
  allIds: readonly string[],
  deckPath: string,
): string[] {
  return allIds.filter((id) => {
    const c = byId[id];
    if (!c || c.deleted_at?.trim() || c.suspended || c.buried || !cardMatchesDeckPath(c, deckPath))
      return false;
    return countsInFlashcardStudyQueue(c);
  });
}

/** Due flashcard-queue cards first (same filter as `/study` flashcards), pad to ≤30 from non-due subtree cards. */
export function jeopardySourceCardIdsForDeck(
  byId: Record<string, CardEntity>,
  allIds: readonly string[],
  deckPath: string,
  nowMs: number,
): { sourceCardIds: string[]; usingNotDueFallback: boolean } {
  const dueSorted = sortDueIds(byId, dueCardIdsForDeck(byId, [...allIds], deckPath, nowMs, "flashcard"));
  if (dueSorted.length === 0) {
    const fb = flashcardEligibleInSubtree(byId, allIds, deckPath);
    fb.sort((a, b) => {
      const ta = Date.parse(byId[a]?.due_at ?? "") || 0;
      const tb = Date.parse(byId[b]?.due_at ?? "") || 0;
      if (ta !== tb) return ta - tb;
      return a.localeCompare(b);
    });
    return { sourceCardIds: fb.slice(0, JEOPARDY_MAX_CARDS), usingNotDueFallback: fb.length > 0 };
  }

  const dueSet = new Set(dueSorted);
  const filler = flashcardEligibleInSubtree(byId, allIds, deckPath).filter(
    (id) => !dueSet.has(id) && !isCardDueNow(byId[id]!, nowMs),
  );
  filler.sort((a, b) => {
    const ta = Date.parse(byId[a]?.due_at ?? "") || 0;
    const tb = Date.parse(byId[b]?.due_at ?? "") || 0;
    if (ta !== tb) return ta - tb;
    return a.localeCompare(b);
  });

  const merged = [...dueSorted, ...filler].slice(0, JEOPARDY_MAX_CARDS);
  return { sourceCardIds: merged, usingNotDueFallback: false };
}

function splitIntoBuckets<T>(items: readonly T[], bucketCount: number): T[][] {
  const buckets: T[][] = Array.from({ length: bucketCount }, () => []);
  const n = items.length;
  if (n === 0) return buckets;
  const base = Math.floor(n / bucketCount);
  let rem = n % bucketCount;
  let idx = 0;
  for (let c = 0; c < bucketCount; c++) {
    const take = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
    buckets[c] = [...items.slice(idx, idx + take)];
    idx += take;
  }
  return buckets;
}

export function placementsFingerprint(placements: readonly JeopardyCellPlacement[]): string {
  const rows = placements
    .map((p) => `${p.col}\t${p.row}\t${p.cardId}\t${p.stake}`)
    .sort((a, b) => a.localeCompare(b));
  return rows.join("\n");
}

export function buildJeopardyPlacements(
  sourceCardIds: readonly string[],
  byId: Record<string, CardEntity>,
): JeopardyCellPlacement[] {
  const cap = JEOPARDY_MAX_CARDS;
  const ids = [...sourceCardIds].slice(0, cap).filter((id) => Boolean(byId[id]));
  type Row = { id: string; h: number };
  const scored: Row[] = ids.map((id) => ({ id, h: jeopardyHardness(byId[id]!) }));
  scored.sort((a, b) => {
    if (a.h !== b.h) return a.h - b.h;
    return a.id.localeCompare(b.id);
  });

  const buckets = splitIntoBuckets(scored, JEOPARDY_COL_COUNT);
  const placements: JeopardyCellPlacement[] = [];
  for (let col = 0; col < buckets.length; col++) {
    const bucket = buckets[col];
    bucket.sort((a, b) => {
      if (a.h !== b.h) return a.h - b.h;
      return a.id.localeCompare(b.id);
    });
    for (let row = 0; row < JEOPARDY_ROW_COUNT && row < bucket.length; row++) {
      placements.push({
        col,
        row,
        cardId: bucket[row].id,
        stake: stakeForRow(row),
      });
    }
  }
  return placements;
}

export function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}
