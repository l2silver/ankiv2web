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

function placeAcross(
  grid: MutableCell[][],
  wordId: string,
  answer: string,
  r: number,
  c0: number,
): MutableCell[][] | null {
  const len = answer.length;
  if (c0 < 0 || c0 + len > CROSSWORD_MAX || r < 0 || r >= CROSSWORD_MAX) return null;
  const next = cloneGrid(grid);
  for (let j = 0; j < len; j++) {
    const c = c0 + j;
    const ch = answer[j]!;
    const cell = next[r]![c]!;
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
      cell.letterAcross = ch;
      cell.acrossWordId = wordId;
      cell.acrossOffset = j;
      continue;
    }
    cell.letterAcross = ch;
    cell.acrossWordId = wordId;
    cell.acrossOffset = j;
  }
  return next;
}

function placeDown(
  grid: MutableCell[][],
  wordId: string,
  answer: string,
  r0: number,
  c: number,
): MutableCell[][] | null {
  const len = answer.length;
  if (r0 < 0 || r0 + len > CROSSWORD_MAX || c < 0 || c >= CROSSWORD_MAX) return null;
  const next = cloneGrid(grid);
  for (let j = 0; j < len; j++) {
    const r = r0 + j;
    const ch = answer[j]!;
    const cell = next[r]![c]!;
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
      cell.letterDown = ch;
      cell.downWordId = wordId;
      cell.downOffset = j;
      continue;
    }
    cell.letterDown = ch;
    cell.downWordId = wordId;
    cell.downOffset = j;
  }
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

  const candidates: MutableCell[][][] = [];

  for (let r = 0; r < CROSSWORD_MAX; r++) {
    for (let c = 0; c < CROSSWORD_MAX; c++) {
      const cell = grid[r]![c]!;
      if (cell.isBlock) continue;

      if (dir === "down") {
        if (cell.letterAcross === null || cell.acrossWordId === null) continue;
        if (cell.letterDown !== null) continue;
        const ca = cell.letterAcross;
        for (let m = 0; m < len; m++) {
          const ch = answer[m]!;
          if (ch === ca) continue;
          const r0 = r - m;
          const placed = placeDown(grid, wordId, answer, r0, c);
          if (placed) candidates.push(placed);
        }
      } else {
        if (cell.letterDown === null || cell.downWordId === null) continue;
        if (cell.letterAcross !== null) continue;
        const cd = cell.letterDown;
        for (let m = 0; m < len; m++) {
          const ch = answer[m]!;
          if (ch === cd) continue;
          const c0 = c - m;
          const placed = placeAcross(grid, wordId, answer, r, c0);
          if (placed) candidates.push(placed);
        }
      }
    }
  }

  return candidates[0] ?? null;
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
  const usable = clues.filter(
    (x) => x.answer.length >= 2 && x.answer.length <= CROSSWORD_MAX,
  );
  if (usable.length === 0) return null;

  const first = usable[0]!;
  const mid = Math.floor(CROSSWORD_MAX / 2);
  const c0 = Math.max(0, mid - Math.floor(first.answer.length / 2));
  let grid = emptyGrid(CROSSWORD_MAX);
  const placed = placeAcross(grid, first.id, first.answer, mid, c0);
  if (!placed) return null;
  grid = placed;

  const words: PlacedWord[] = [
    {
      id: first.id,
      question: first.question,
      answer: first.answer,
      variantType: first.variantType,
      dir: "across",
      startR: mid,
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
