/** Playable grid is never larger than 15×15 (see design docs). */
export const CROSSWORD_MAX = 15;

export type CrosswordView = "across" | "down";

export type WordDir = CrosswordView;

/** One clue placed on the board (answer is A–Z only). */
export type PlacedWord = {
  id: string;
  question: string;
  answer: string;
  /** Optional clue-level variant type (used to choose which variant gets scheduled). */
  variantType?: string;
  dir: WordDir;
  startR: number;
  startC: number;
};

export type GridCell = {
  /** Unused cells stay blocked. */
  isBlock: boolean;
  letterAcross: string | null;
  letterDown: string | null;
  acrossWordId: string | null;
  /** 0-based index into that word's answer. */
  acrossOffset: number | null;
  downWordId: string | null;
  downOffset: number | null;
};

export type BuiltPuzzle = {
  size: number;
  grid: GridCell[][];
  words: PlacedWord[];
  acrossIds: string[];
  downIds: string[];
};
