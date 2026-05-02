const STORAGE_KEY = "ankiv2:jeopardyDraft:v1";

/** Good/Easy vs Again/Hard for Jeopardy display and redo scoring. */
export type JeopardyClearOutcome = "win" | "loss";

export type JeopardyDraft = {
  v: 1;
  sourceCardIds: string[];
  placementsFingerprint: string;
  clearedKeys: string[];
  /** Per-cell `col:row`; omitted keys mean unknown (legacy drafts). */
  clearedOutcomes?: Record<string, JeopardyClearOutcome>;
  scoreEarned: number;
  usingNotDueFallback: boolean;
  savedAt: number;
};

type DraftStore = Record<string, JeopardyDraft>;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
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
    // ignore
  }
}

export function loadJeopardyDraft(deckPath: string): JeopardyDraft | null {
  const store = readStore();
  const d = store[deckPath];
  if (!d || d.v !== 1) return null;
  return d;
}

export function saveJeopardyDraft(deckPath: string, draft: JeopardyDraft): void {
  const store = readStore();
  store[deckPath] = draft;
  writeStore(store);
}

export function clearJeopardyDraft(deckPath: string): void {
  const store = readStore();
  if (!(deckPath in store)) return;
  delete store[deckPath];
  writeStore(store);
}

export function buildJeopardyDraftBlob(params: {
  sourceCardIds: readonly string[];
  clearedKeys: Set<string>;
  clearedOutcomes: Readonly<Record<string, JeopardyClearOutcome>>;
  scoreEarned: number;
  usingNotDueFallback: boolean;
  placementsFingerprint: string;
}): JeopardyDraft {
  const { sourceCardIds, clearedKeys, clearedOutcomes, scoreEarned, usingNotDueFallback, placementsFingerprint } =
    params;
  const outcomeEntries = [...clearedKeys]
    .map((k) => [k, clearedOutcomes[k]] as const)
    .filter((e): e is readonly [string, JeopardyClearOutcome] => e[1] === "win" || e[1] === "loss");
  return {
    v: 1,
    sourceCardIds: [...sourceCardIds],
    placementsFingerprint,
    clearedKeys: [...clearedKeys].sort(),
    clearedOutcomes: Object.fromEntries(outcomeEntries) as Record<string, JeopardyClearOutcome>,
    scoreEarned,
    usingNotDueFallback,
    savedAt: Date.now(),
  };
}
