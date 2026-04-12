import { decoyLetter } from "./decoyLetter";
import type { CrosswordView, GridCell } from "./types";

function userCharAt(wordId: string | null, offset: number | null, inputByWord: Record<string, string>): string {
  if (wordId === null || offset === null) return "";
  const s = (inputByWord[wordId] ?? "").toLowerCase();
  const ch = s[offset];
  if (ch === "." || !ch) return "";
  return /[a-z]/.test(ch) ? ch : "";
}

function wordInputHasAnyLetter(wordId: string, inputByWord: Record<string, string>): boolean {
  return /[a-z]/.test((inputByWord[wordId] ?? "").toLowerCase());
}

/**
 * What to show in the grid for this cell in the active view.
 * `matched*` = user entry equals the puzzle word (used for reveal / decoys only; not surfaced as “you got it right”).
 */
export function displayCellLetter(
  cell: GridCell,
  view: CrosswordView,
  inputByWord: Record<string, string>,
  matchedAcross: ReadonlySet<string>,
  matchedDown: ReadonlySet<string>,
  decoySeedPrefix: string,
  /** When true, never surface letters from the perpendicular direction (no decoys, no “matched other” reveal). */
  blindMode: boolean,
): { char: string; isDecoy: boolean; isBlocked: boolean } {
  if (cell.isBlock) {
    return { char: "", isDecoy: false, isBlocked: true };
  }

  const hasA = cell.letterAcross !== null;
  const hasD = cell.letterDown !== null;

  if (view === "across") {
    if (!hasA) {
      return { char: "", isDecoy: false, isBlocked: false };
    }
    const wa = cell.acrossWordId!;
    const offA = cell.acrossOffset ?? 0;
    const correctA = cell.letterAcross!;

    if (matchedAcross.has(wa)) {
      const u = userCharAt(wa, offA, inputByWord);
      return { char: u || correctA, isDecoy: false, isBlocked: false };
    }

    if (!blindMode) {
      if (hasD && cell.downWordId !== null && matchedDown.has(cell.downWordId)) {
        return { char: correctA, isDecoy: false, isBlocked: false };
      }

      if (hasD && cell.downWordId !== null) {
        const wd = cell.downWordId;
        if (!wordInputHasAnyLetter(wd, inputByWord)) {
          const u = userCharAt(wa, offA, inputByWord);
          return { char: u, isDecoy: false, isBlocked: false };
        }
        const offD = cell.downOffset ?? 0;
        const userDown = (inputByWord[wd] ?? "").toLowerCase();
        const seed = `${decoySeedPrefix}|${wd}|${userDown}|${offD}|a|${correctA}`;
        return { char: decoyLetter(correctA, seed), isDecoy: true, isBlocked: false };
      }
    }

    const u = userCharAt(wa, offA, inputByWord);
    return { char: u, isDecoy: false, isBlocked: false };
  }

  // down view
  if (!hasD) {
    return { char: "", isDecoy: false, isBlocked: false };
  }
  const wd = cell.downWordId!;
  const offD = cell.downOffset ?? 0;
  const correctD = cell.letterDown!;

  if (matchedDown.has(wd)) {
    const u = userCharAt(wd, offD, inputByWord);
    return { char: u || correctD, isDecoy: false, isBlocked: false };
  }

  if (!blindMode) {
    if (hasA && cell.acrossWordId !== null && matchedAcross.has(cell.acrossWordId)) {
      return { char: correctD, isDecoy: false, isBlocked: false };
    }

    if (hasA && cell.acrossWordId !== null) {
      const wa = cell.acrossWordId;
      if (!wordInputHasAnyLetter(wa, inputByWord)) {
        const u = userCharAt(wd, offD, inputByWord);
        return { char: u, isDecoy: false, isBlocked: false };
      }
      const offA = cell.acrossOffset ?? 0;
      const userAcross = (inputByWord[wa] ?? "").toLowerCase();
      const seed = `${decoySeedPrefix}|${wa}|${userAcross}|${offA}|d|${correctD}`;
      return { char: decoyLetter(correctD, seed), isDecoy: true, isBlocked: false };
    }
  }

  const u = userCharAt(wd, offD, inputByWord);
  return { char: u, isDecoy: false, isBlocked: false };
}
