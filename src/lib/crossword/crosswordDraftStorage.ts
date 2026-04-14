import type { BuiltPuzzle, CrosswordView, PlacedWord } from "./types";

const STORAGE_KEY = "ankiv2:crosswordDraft:v1";

export type CrosswordDraftV1 = {
  v: 1;
  fingerprint: string;
  slots: Record<string, string>;
  view: CrosswordView;
  blindMode: boolean;
  selectedKey: string | null;
  gradedKeys: string[];
  savedAt: number;
};

export type CrosswordDraftV2 = {
  v: 2;
  /** Deck card-id snapshot used to build the puzzle inputs (stabilizes refresh). */
  sourceCardIds: string[];
  fingerprint: string;
  slots: Record<string, string>;
  view: CrosswordView;
  blindMode: boolean;
  selectedKey: string | null;
  gradedKeys: string[];
  savedAt: number;
};

export type CrosswordDraft = CrosswordDraftV1 | CrosswordDraftV2;

type DraftStore = Record<string, CrosswordDraft>;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Stable across clue-id renumbering when card / clue order changes. */
export function wordRestoreKey(w: Pick<PlacedWord, "dir" | "startR" | "startC" | "answer" | "question">): string {
  return `${w.dir}\t${w.startR}\t${w.startC}\t${w.answer}\t${w.question}`;
}

export function puzzleFingerprint(words: readonly PlacedWord[]): string {
  return words.map((w) => wordRestoreKey(w)).sort().join("\n");
}

function readStore(): DraftStore {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as DraftStore;
  } catch {
    return {};
  }
}

function writeStore(store: DraftStore): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota, private mode, etc.
  }
}

export function loadCrosswordDraft(deckPath: string): CrosswordDraftV1 | null {
  const store = readStore();
  const d = store[deckPath];
  if (!d || d.v !== 1) return null;
  return d;
}

export function loadCrosswordDraftAny(deckPath: string): CrosswordDraft | null {
  const store = readStore();
  const d = store[deckPath];
  if (!d) return null;
  if (d.v !== 1 && d.v !== 2) return null;
  return d;
}

export function saveCrosswordDraft(deckPath: string, draft: CrosswordDraft): void {
  const store = readStore();
  store[deckPath] = draft;
  writeStore(store);
}

export function clearCrosswordDraft(deckPath: string): void {
  const store = readStore();
  if (!(deckPath in store)) return;
  delete store[deckPath];
  writeStore(store);
}

export function buildCrosswordDraft(params: {
  puzzle: BuiltPuzzle;
  sourceCardIds: readonly string[];
  inputByWord: Record<string, string>;
  view: CrosswordView;
  blindMode: boolean;
  selectedWordId: string | null;
  gradedWordIds: Set<string>;
}): CrosswordDraftV2 {
  const { puzzle, sourceCardIds, inputByWord, view, blindMode, selectedWordId, gradedWordIds } = params;
  const slots: Record<string, string> = {};
  for (const w of puzzle.words) {
    slots[wordRestoreKey(w)] = inputByWord[w.id] ?? ".".repeat(w.answer.length);
  }
  const gradedKeys = puzzle.words.filter((w) => gradedWordIds.has(w.id)).map(wordRestoreKey);
  const selectedW = selectedWordId ? puzzle.words.find((w) => w.id === selectedWordId) : undefined;
  return {
    v: 2,
    sourceCardIds: [...sourceCardIds],
    fingerprint: puzzleFingerprint(puzzle.words),
    slots,
    view,
    blindMode,
    selectedKey: selectedW ? wordRestoreKey(selectedW) : null,
    gradedKeys,
    savedAt: Date.now(),
  };
}
