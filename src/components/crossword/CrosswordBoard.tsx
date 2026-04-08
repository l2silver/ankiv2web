"use client";

import { displayCellLetter } from "@/lib/crossword/cellDisplay";
import type { BuiltPuzzle, CrosswordView } from "@/lib/crossword/types";

function wordIdForCellInView(
  cell: BuiltPuzzle["grid"][0][0],
  view: CrosswordView,
): string | null {
  if (view === "across") return cell.acrossWordId;
  return cell.downWordId;
}

function isCellInSelectedWord(
  cell: BuiltPuzzle["grid"][0][0],
  selectedWordId: string | null,
): boolean {
  if (!selectedWordId) return false;
  return cell.acrossWordId === selectedWordId || cell.downWordId === selectedWordId;
}

type Props = {
  puzzle: BuiltPuzzle;
  view: CrosswordView;
  inputByWord: Record<string, string>;
  matchedAcross: ReadonlySet<string>;
  matchedDown: ReadonlySet<string>;
  decoySeedPrefix: string;
  selectedWordId: string | null;
  onSelectWord: (wordId: string) => void;
  /** `"row,col"` → 1-based clue number at word starts */
  wordStartNumbers: Map<string, number>;
  /** Placed word ids the user has already graded this session → green clue numbers at word starts */
  gradedWordIds: ReadonlySet<string>;
  /** Hide perpendicular-direction hint letters (decoys / matched-cross reveal) in the active view */
  blindMode: boolean;
};

export function CrosswordBoard({
  puzzle,
  view,
  inputByWord,
  matchedAcross,
  matchedDown,
  decoySeedPrefix,
  selectedWordId,
  onSelectWord,
  wordStartNumbers,
  gradedWordIds,
  blindMode,
}: Props) {
  const { grid } = puzzle;
  return (
    <div
      className="inline-grid gap-px rounded-lg border border-zinc-700 bg-zinc-800 p-px"
      style={{
        gridTemplateColumns: `repeat(${grid[0]?.length ?? 0}, minmax(0, 2rem))`,
      }}
    >
      {grid.map((row, r) =>
        row.map((cell, c) => {
          const { char, isDecoy, isBlocked } = displayCellLetter(
            cell,
            view,
            inputByWord,
            matchedAcross,
            matchedDown,
            `${decoySeedPrefix}|${r}|${c}`,
            blindMode,
          );
          if (isBlocked) {
            return (
              <div
                key={`${r}-${c}`}
                className="h-8 w-8 bg-zinc-950 sm:h-9 sm:w-9"
                aria-hidden
              />
            );
          }

          const pickId = wordIdForCellInView(cell, view);
          const inSelected = isCellInSelectedWord(cell, selectedWordId);
          const startNum = wordStartNumbers.get(`${r},${c}`);
          const startGraded =
            startNum != null &&
            puzzle.words.some(
              (w) => w.startR === r && w.startC === c && gradedWordIds.has(w.id),
            );

          return (
            <button
              key={`${r}-${c}`}
              type="button"
              disabled={!pickId}
              onClick={() => {
                if (pickId) onSelectWord(pickId);
              }}
              className={`relative flex h-8 w-8 items-center justify-center border text-sm font-semibold tabular-nums sm:h-9 sm:w-9 ${
                pickId ? "cursor-pointer hover:bg-zinc-800/80" : "cursor-default opacity-60"
              } ${
                inSelected
                  ? "border-sky-500 bg-sky-950/50 ring-1 ring-sky-500/90"
                  : "border-zinc-700/80 bg-zinc-900"
              } ${isDecoy ? "text-rose-300/90" : "text-zinc-100"}`}
              title={
                pickId
                  ? isDecoy
                    ? `Clue ${startNum ?? "—"}. Provisional letter — depends on the crossing entry.`
                    : `Clue ${startNum ?? "—"}. Select this word.`
                  : undefined
              }
              aria-label={
                pickId
                  ? `Clue ${startNum ?? ""} letter ${(char || "blank").toString()}`.trim()
                  : `Grid cell ${r + 1},${c + 1}`
              }
            >
              {startNum != null ? (
                <span
                  className={`pointer-events-none absolute left-0.5 top-0.5 z-10 text-[8px] font-bold leading-none sm:left-1 sm:top-1 sm:text-[9px] ${
                    startGraded ? "text-emerald-400" : "text-zinc-400"
                  }`}
                >
                  {startNum}
                </span>
              ) : null}
              <span className="pointer-events-none font-semibold">{char || "\u00a0"}</span>
            </button>
          );
        }),
      )}
    </div>
  );
}
