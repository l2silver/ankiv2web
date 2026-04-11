import type { CardEntity } from "@/features/cards/cardsSlice";

import { isCardDueNow } from "@/lib/cards/due";
import {
  countsInDeckTreeAggregates,
  countsInFlashcardStudyQueue,
} from "@/lib/flashcards/moreQuestionEligible";

/** Same convention as Anki-style nested decks (`Parent::Child::Leaf`). */
export const NESTED_DECK_SEPARATOR = "::";

export type DeckTreeNode = {
  /** Full path, e.g. `Science::Space::Inner Solar System`. */
  path: string;
  /** Last segment for display. */
  label: string;
  due: number;
  total: number;
  children: DeckTreeNode[];
};

function pathParent(fullPath: string): string | null {
  const i = fullPath.lastIndexOf(NESTED_DECK_SEPARATOR);
  if (i === -1) return null;
  return fullPath.slice(0, i);
}

function deckKeyFromCard(card: CardEntity): string {
  const t = card.deck_id?.trim();
  return t ? t : "(no deck)";
}

/** All prefix paths for `Science::A::B` → `Science`, `Science::A`, `Science::A::B`. */
export function deckPathPrefixes(fullPath: string): string[] {
  if (fullPath === "(no deck)") return ["(no deck)"];
  const segments = fullPath
    .split(NESTED_DECK_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return ["(no deck)"];
  const out: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    out.push(segments.slice(0, i + 1).join(NESTED_DECK_SEPARATOR));
  }
  return out;
}

/**
 * For each card, roll up `total` and `due` to every ancestor path so parent rows show aggregate counts.
 */
export function aggregateDeckPaths(
  byId: Record<string, CardEntity>,
  allIds: string[],
  nowMs: number,
): Map<string, { due: number; total: number }> {
  const map = new Map<string, { due: number; total: number }>();

  for (const id of allIds) {
    const c = byId[id];
    if (!c) continue;
    if (!countsInDeckTreeAggregates(c)) continue;
    const leaf = deckKeyFromCard(c);
    const cardDue = isCardDueNow(c, nowMs);
    for (const prefix of deckPathPrefixes(leaf)) {
      if (!map.has(prefix)) map.set(prefix, { due: 0, total: 0 });
      const row = map.get(prefix)!;
      row.total++;
      if (cardDue) row.due++;
    }
  }
  return map;
}

export function countDueCards(byId: Record<string, CardEntity>, allIds: string[], nowMs: number): number {
  let n = 0;
  for (const id of allIds) {
    const c = byId[id];
    if (c && countsInDeckTreeAggregates(c) && isCardDueNow(c, nowMs)) n++;
  }
  return n;
}

function labelForPath(path: string): string {
  if (path === "(no deck)") return "(no deck)";
  const i = path.lastIndexOf(NESTED_DECK_SEPARATOR);
  return i === -1 ? path : path.slice(i + NESTED_DECK_SEPARATOR.length);
}

export function buildDeckTree(map: Map<string, { due: number; total: number }>): DeckTreeNode[] {
  const paths = [...map.keys()].sort((a, b) => a.localeCompare(b));

  function childPaths(parent: string | null): string[] {
    return paths.filter((p) => pathParent(p) === parent);
  }

  function toNode(path: string): DeckTreeNode {
    const agg = map.get(path)!;
    return {
      path,
      label: labelForPath(path),
      due: agg.due,
      total: agg.total,
      children: childPaths(path).map(toNode),
    };
  }

  return childPaths(null).map(toNode);
}

/** True if the card belongs to `deckPath` or a nested subdeck under it. */
export function cardMatchesDeckPath(card: CardEntity, deckPath: string): boolean {
  const leaf = card.deck_id?.trim();
  if (!leaf) {
    return deckPath === "(no deck)";
  }
  if (leaf === deckPath) return true;
  return leaf.startsWith(deckPath + NESTED_DECK_SEPARATOR);
}

export type DueCardIdsMode = "all" | "flashcard";

/** Due cards in this deck subtree, ordered by `due_at` then id (stable). */
export function dueCardIdsForDeck(
  byId: Record<string, CardEntity>,
  allIds: string[],
  deckPath: string,
  nowMs: number,
  mode: DueCardIdsMode = "all",
): string[] {
  const ids = allIds.filter((id) => {
    const c = byId[id];
    if (!c || !cardMatchesDeckPath(c, deckPath) || !isCardDueNow(c, nowMs)) return false;
    if (mode === "flashcard" && !countsInFlashcardStudyQueue(c)) return false;
    return true;
  });
  ids.sort((a, b) => {
    const ta = Date.parse(byId[a]?.due_at ?? "") || 0;
    const tb = Date.parse(byId[b]?.due_at ?? "") || 0;
    if (ta !== tb) return ta - tb;
    return a.localeCompare(b);
  });
  return ids;
}
