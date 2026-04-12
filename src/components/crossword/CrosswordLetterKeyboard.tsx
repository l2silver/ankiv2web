"use client";

import { useEffect, useRef, useState } from "react";

import { toSlotString } from "@/lib/crossword/normalizeAnswer";

const ROWS: string[][] = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

/** Accented vowels and ç; parent `toSlotString` folds to a–z. */
const FRENCH_VOWEL_ACCENTS = [
  "à",
  "â",
  "è",
  "é",
  "ê",
  "ë",
  "î",
  "ï",
  "ô",
  "ù",
  "û",
  "ü",
  "ÿ",
  "ç",
] as const;

type Props = {
  value: string;
  slotCount: number;
  disabled?: boolean;
  onValueChange: (next: string) => void;
  /** When this changes (e.g. selected word id), cursor resets to the first empty cell. */
  selectionKey: string;
  idPrefix?: string;
};

const keyBtn =
  "flex min-h-10 min-w-9 flex-1 items-center justify-center rounded-lg border border-zinc-600 bg-zinc-900 px-1.5 text-sm font-semibold text-zinc-100 shadow-sm transition hover:border-zinc-500 hover:bg-zinc-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-11 sm:min-w-10 sm:text-base";

function firstEditableIndex(slotStr: string): number {
  const dot = slotStr.indexOf(".");
  return dot === -1 ? Math.max(0, slotStr.length - 1) : dot;
}

export function CrosswordLetterKeyboard({
  value,
  slotCount,
  disabled = false,
  onValueChange,
  selectionKey,
  idPrefix = "cw-keyboard",
}: Props) {
  const canType = !disabled && slotCount > 0;
  const slotStr = toSlotString(value, slotCount);

  const [cursorIndex, setCursorIndex] = useState(0);
  const prevSelectionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevSelectionKeyRef.current !== selectionKey) {
      prevSelectionKeyRef.current = selectionKey;
      setCursorIndex(firstEditableIndex(toSlotString(value, slotCount)));
    }
    // Intentionally omit `value` so typing does not reset the cursor; `value` here is read only when `selectionKey` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, slotCount]);

  useEffect(() => {
    setCursorIndex((i) => Math.min(i, Math.max(0, slotCount - 1)));
  }, [slotCount]);

  const applySlot = (chars: string[]) => {
    onValueChange(chars.join(""));
  };

  const insertLetter = (letter: string) => {
    if (!canType) return;
    const chars = slotStr.split("");
    const i = Math.min(cursorIndex, slotCount - 1);
    chars[i] = letter;
    applySlot(chars);
    if (i < slotCount - 1) setCursorIndex(i + 1);
  };

  const applyBackspace = () => {
    if (!canType) return;
    const chars = slotStr.split("");
    let i = Math.min(cursorIndex, slotCount - 1);
    if (chars[i] !== "." && /[a-z]/.test(chars[i]!)) {
      chars[i] = ".";
      applySlot(chars);
      return;
    }
    if (i > 0) {
      i -= 1;
      setCursorIndex(i);
      chars[i] = ".";
      applySlot(chars);
    }
  };

  useEffect(() => {
    if (!canType) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const chars = toSlotString(value, slotCount).split("");
      const i = Math.min(cursorIndex, slotCount - 1);

      if (e.key === "Backspace") {
        e.preventDefault();
        if (chars[i] !== "." && /[a-z]/.test(chars[i]!)) {
          chars[i] = ".";
          onValueChange(chars.join(""));
          return;
        }
        if (i > 0) {
          const j = i - 1;
          setCursorIndex(j);
          chars[j] = ".";
          onValueChange(chars.join(""));
        }
        return;
      }

      if (e.key.length === 1) {
        const folded = e.key
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        if (folded.length === 1 && folded >= "a" && folded <= "z") {
          e.preventDefault();
          chars[i] = folded;
          onValueChange(chars.join(""));
          if (i < slotCount - 1) setCursorIndex(i + 1);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canType, cursorIndex, onValueChange, slotCount, value]);

  const slots = Array.from({ length: Math.max(0, slotCount) }, (_, i) => slotStr[i] ?? ".");

  return (
    <div className="w-full max-w-md space-y-4">
      <div
        className="flex min-h-12 flex-wrap items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950/80 px-2 py-2 sm:gap-2"
        aria-live="polite"
        aria-label="Letters entered for this word"
      >
        {slotCount === 0 ? (
          <span className="text-sm text-zinc-500">—</span>
        ) : (
          slots.map((ch, i) => {
            const letter = ch !== "." ? ch : "";
            const active = i === Math.min(cursorIndex, slotCount - 1);
            return (
              <button
                key={i}
                type="button"
                disabled={!canType}
                id={`${idPrefix}-slot-${i}`}
                onClick={() => {
                  if (!canType) return;
                  setCursorIndex(i);
                }}
                className={`flex h-9 w-8 items-center justify-center rounded border font-mono text-sm font-semibold tabular-nums transition sm:h-10 sm:w-9 sm:text-base ${
                  active
                    ? "border-sky-500 bg-sky-950/50 text-zinc-100 ring-2 ring-sky-500/80"
                    : "border-zinc-600 bg-zinc-900 text-zinc-100 hover:border-zinc-500"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {letter || "\u00a0"}
              </button>
            );
          })
        )}
      </div>

      <div role="group" aria-label="Letter keyboard" className="space-y-2">
        {ROWS.map((row, ri) => (
          <div key={ri} className="flex justify-center gap-1 sm:gap-1.5">
            {ri === 2 ? (
              <button
                type="button"
                disabled={!canType}
                onClick={applyBackspace}
                id={`${idPrefix}-backspace`}
                className={`${keyBtn} max-w-[5.5rem] flex-none shrink-0 text-xs sm:text-sm`}
              >
                ⌫
              </button>
            ) : null}
            {row.map((letter) => (
              <button
                key={letter}
                type="button"
                disabled={!canType}
                onClick={() => insertLetter(letter)}
                id={`${idPrefix}-${letter}`}
                className={keyBtn}
              >
                {letter}
              </button>
            ))}
          </div>
        ))}
        <div
          role="group"
          aria-label="French accented vowels and ç"
          className="flex flex-wrap justify-center gap-1 sm:gap-1.5"
        >
          {FRENCH_VOWEL_ACCENTS.map((letter) => (
            <button
              key={letter}
              type="button"
              disabled={!canType}
              onClick={() => insertLetter(letter)}
              id={`${idPrefix}-fr-${letter}`}
              className={`${keyBtn} min-w-8 flex-none sm:min-w-9`}
            >
              {letter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
