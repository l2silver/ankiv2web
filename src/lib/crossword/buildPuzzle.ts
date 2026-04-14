import { CROSSWORD_MAX, type GridCell, type PlacedWord, type WordDir, type BuiltPuzzle } from "./types";

type MutableCell = GridCell;

type ClueIn = {
  id: string;
  question: string;
  answer: string;
  variantType?: string;
};

function emptyGrid(size: number): MutableCell[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({
      isBlock: true,
      letterAcross: null,
      letterDown: null,
      acrossWordId: null,
      acrossOffset: null,
      downWordId: null,
      downOffset: null,
    })),
  );
}

function cloneGrid(g: MutableCell[][]): MutableCell[][] {
  return g.map((row) => row.map((c) => ({ ...c })));
}

function placeAcrossWrapped(
  grid: MutableCell[][],
  wordId: string,
  answer: string,
  r: number,
  c0: number,
  requireAttachment: boolean,
): MutableCell[][] | null {
  const len = answer.length;
  if (len < 1) return null;
  if (r < 0 || r >= CROSSWORD_MAX) return null;
  if (c0 < 0 || c0 >= CROSSWORD_MAX) return null;
  const lastIndex = c0 + (len - 1);
  const rEnd = r + Math.floor(lastIndex / CROSSWORD_MAX);
  if (rEnd >= CROSSWORD_MAX) return null;
  const next = cloneGrid(grid);
  let attachments = 0;
  for (let j = 0; j < len; j++) {
    const idx = c0 + j;
    const rr = r + Math.floor(idx / CROSSWORD_MAX);
    const c = idx % CROSSWORD_MAX;
    const ch = answer[j]!;
    const cell = next[rr]![c]!;
    if (cell.isBlock) {
      cell.isBlock = false;
      cell.letterAcross = ch;
      cell.acrossWordId = wordId;
      cell.acrossOffset = j;
      continue;
    }
    if (cell.acrossWordId !== null) {
      if (cell.acrossWordId !== wordId || cell.letterAcross !== ch) return null;
      continue;
    }
    if (cell.letterDown !== null) {
      if (cell.letterDown === ch) return null;
      attachments += 1;
      cell.letterAcross = ch;
      cell.acrossWordId = wordId;
      cell.acrossOffset = j;
      continue;
    }
    cell.letterAcross = ch;
    cell.acrossWordId = wordId;
    cell.acrossOffset = j;
  }
  if (requireAttachment && attachments === 0) return null;
  return next;
}

function placeDownWrapped(
  grid: MutableCell[][],
  wordId: string,
  answer: string,
  r0: number,
  c: number,
  requireAttachment: boolean,
): MutableCell[][] | null {
  const len = answer.length;
  if (len < 1) return null;
  if (c < 0 || c >= CROSSWORD_MAX) return null;
  if (r0 < 0 || r0 >= CROSSWORD_MAX) return null;
  const lastIndex = r0 + (len - 1);
  const cEnd = c + Math.floor(lastIndex / CROSSWORD_MAX);
  if (cEnd >= CROSSWORD_MAX) return null;
  const next = cloneGrid(grid);
  let attachments = 0;
  for (let j = 0; j < len; j++) {
    const idx = r0 + j;
    const r = idx % CROSSWORD_MAX;
    const cc = c + Math.floor(idx / CROSSWORD_MAX);
    const ch = answer[j]!;
    const cell = next[r]![cc]!;
    if (cell.isBlock) {
      cell.isBlock = false;
      cell.letterDown = ch;
      cell.downWordId = wordId;
      cell.downOffset = j;
      continue;
    }
    if (cell.downWordId !== null) {
      if (cell.downWordId !== wordId || cell.letterDown !== ch) return null;
      continue;
    }
    if (cell.letterAcross !== null) {
      if (cell.letterAcross === ch) return null;
      attachments += 1;
      cell.letterDown = ch;
      cell.downWordId = wordId;
      cell.downOffset = j;
      continue;
    }
    cell.letterDown = ch;
    cell.downWordId = wordId;
    cell.downOffset = j;
  }
  if (requireAttachment && attachments === 0) return null;
  return next;
}

function tryAttachWord(
  grid: MutableCell[][],
  wordId: string,
  answer: string,
  dir: WordDir,
): MutableCell[][] | null {
  const len = answer.length;
  if (len < 2) return null;

  for (let r = 0; r < CROSSWORD_MAX; r++) {
    for (let c = 0; c < CROSSWORD_MAX; c++) {
      const placed =
        dir === "across"
          ? placeAcrossWrapped(grid, wordId, answer, r, c, true)
          : placeDownWrapped(grid, wordId, answer, r, c, true);
      if (placed) return placed;
    }
  }
  return null;
}

function boundingBox(grid: MutableCell[][]) {
  let minR = CROSSWORD_MAX;
  let maxR = -1;
  let minC = CROSSWORD_MAX;
  let maxC = -1;
  for (let r = 0; r < CROSSWORD_MAX; r++) {
    for (let c = 0; c < CROSSWORD_MAX; c++) {
      if (!grid[r]![c]!.isBlock) {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }
  if (maxR < 0) return null;
  return { minR, maxR, minC, maxC };
}

/** Crop to minimal rectangle (still at most 15 wide/tall). */
function cropGrid(grid: MutableCell[][], box: NonNullable<ReturnType<typeof boundingBox>>): GridCell[][] {
  const h = box.maxR - box.minR + 1;
  const w = box.maxC - box.minC + 1;
  const out: GridCell[][] = [];
  for (let i = 0; i < h; i++) {
    const row: GridCell[] = [];
    for (let j = 0; j < w; j++) {
      row.push(grid[box.minR + i]![box.minC + j]!);
    }
    out.push(row);
  }
  return out;
}

function rebaseWords(words: PlacedWord[], minR: number, minC: number): PlacedWord[] {
  return words.map((w) => ({
    ...w,
    startR: w.startR - minR,
    startC: w.startC - minC,
  }));
}

/**
 * Builds a non-standard crossword: overlaps use **different** truth letters for across vs down.
 * First clue is across, centered; further clues alternate down/across and attach with a mismatched crossing.
 */
export function buildPuzzle(clues: ClueIn[]): BuiltPuzzle | null {
  const maxCells = CROSSWORD_MAX * CROSSWORD_MAX;
  const usable = clues.filter((x) => x.answer.length >= 2 && x.answer.length <= maxCells);
  if (usable.length === 0) return null;

  const first = usable[0]!;
  const rowsNeeded = Math.ceil(first.answer.length / CROSSWORD_MAX);
  const r0 = Math.max(0, Math.floor((CROSSWORD_MAX - rowsNeeded) / 2));
  const c0 = 0;
  let grid = emptyGrid(CROSSWORD_MAX);
  const placed = placeAcrossWrapped(grid, first.id, first.answer, r0, c0, false);
  if (!placed) return null;
  grid = placed;

  const words: PlacedWord[] = [
    {
      id: first.id,
      question: first.question,
      answer: first.answer,
      variantType: first.variantType,
      dir: "across",
      startR: r0,
      startC: c0,
    },
  ];

  for (let i = 1; i < usable.length; i++) {
    const clue = usable[i]!;
    const dir: WordDir = i % 2 === 1 ? "down" : "across";
    const attached = tryAttachWord(grid, clue.id, clue.answer, dir);
    if (!attached) break;
    grid = attached;

    let startR = 0;
    let startC = 0;
    outer: for (let r = 0; r < CROSSWORD_MAX; r++) {
      for (let c = 0; c < CROSSWORD_MAX; c++) {
        const cell = grid[r]![c]!;
        if (cell.acrossWordId === clue.id && cell.acrossOffset === 0) {
          startR = r;
          startC = c;
          break outer;
        }
        if (cell.downWordId === clue.id && cell.downOffset === 0) {
          startR = r;
          startC = c;
          break outer;
        }
      }
    }

    words.push({
      id: clue.id,
      question: clue.question,
      answer: clue.answer,
      variantType: clue.variantType,
      dir,
      startR,
      startC,
    });
  }

  const box = boundingBox(grid);
  if (!box) return null;
  const cropped = cropGrid(grid, box);
  const rebased = rebaseWords(words, box.minR, box.minC);
  const size = Math.max(cropped.length, cropped[0]?.length ?? 0);

  return {
    size,
    grid: cropped,
    words: rebased,
    acrossIds: rebased.filter((w) => w.dir === "across").map((w) => w.id),
    downIds: rebased.filter((w) => w.dir === "down").map((w) => w.id),
  };
}
