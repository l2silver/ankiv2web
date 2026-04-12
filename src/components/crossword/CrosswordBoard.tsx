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
  const cols = grid[0]?.length ?? 0;
  const rows = grid.length;
  if (cols === 0 || rows === 0) return null;

  return (
    <div
      className="grid w-full max-w-full min-w-0 gap-px rounded-lg border border-zinc-700 bg-zinc-800 p-px"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        aspectRatio: `${cols} / ${rows}`,
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
                className="min-h-0 min-w-0 bg-zinc-950"
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
              className={`relative flex min-h-0 min-w-0 h-full w-full max-h-full max-w-full items-center justify-center border text-[clamp(0.65rem,2.6vmin,0.875rem)] font-semibold tabular-nums leading-none sm:text-sm ${
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
                  className={`pointer-events-none absolute left-[0.1em] top-[0.15em] z-10 text-[clamp(6px,1.8vmin,9px)] font-bold leading-none sm:left-1 sm:top-1 ${
                    startGraded ? "text-emerald-400" : "text-zinc-400"
                  }`}
                >
                  {startNum}
                </span>
              ) : null}
              <span className="pointer-events-none font-semibold tabular-nums">{char || "\u00a0"}</span>
            </button>
          );
        }),
      )}
    </div>
  );
}
