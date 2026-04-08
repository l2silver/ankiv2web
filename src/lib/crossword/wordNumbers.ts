import type { BuiltPuzzle } from "./types";

/** Map cell key `"row,col"` → clue number (1-based), standard crossword order: reading order of word starts. */
export function wordStartNumberByCell(puzzle: BuiltPuzzle): Map<string, number> {
  const seen = new Set<string>();
  const positions: { r: number; c: number }[] = [];
  for (const w of puzzle.words) {
    const k = `${w.startR},${w.startC}`;
    if (!seen.has(k)) {
      seen.add(k);
      positions.push({ r: w.startR, c: w.startC });
    }
  }
  positions.sort((a, b) => (a.r !== b.r ? a.r - b.r : a.c - b.c));
  const map = new Map<string, number>();
  positions.forEach((p, i) => {
    map.set(`${p.r},${p.c}`, i + 1);
  });
  return map;
}
