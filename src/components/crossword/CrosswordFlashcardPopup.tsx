"use client";

import { useEffect, useMemo, type ReactNode } from "react";

import type { CardEntity } from "@/features/cards/cardsSlice";
import { resolveFlashcardFaces } from "@/lib/flashcards/resolveFlashcardFaces";

export function CrosswordFlashcardPopup({
  open,
  card,
  onClose,
  title,
}: {
  open: boolean;
  card: CardEntity;
  onClose: () => void;
  title?: string;
}) {
  const faces = useMemo(() => resolveFlashcardFaces(card), [card]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const headingId = "crossword-flashcard-popup-title";
  const descId = "crossword-flashcard-popup-desc";

  const renderFace = (node: ReactNode) => {
    return <div className="mt-2 text-base leading-relaxed text-zinc-100">{node}</div>;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/70 px-3 py-10 sm:py-14"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-describedby={descId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p id={headingId} className="truncate text-sm font-semibold text-zinc-100">
              {title || "Card preview"}
            </p>
            <p className="mt-1 truncate text-[11px] text-zinc-500" title={card.deck_id?.trim() ? card.deck_id.trim() : ""}>
              <span className="text-zinc-600">Deck</span>{" "}
              <span className="text-zinc-400">{card.deck_id?.trim() ? card.deck_id.trim() : "(no deck)"}</span>
            </p>
            <p id={descId} className="mt-1 text-xs text-zinc-500">
              Press <span className="text-zinc-400">Esc</span> to close.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 sm:p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Front</p>
            {renderFace(faces.front)}
            <div className="my-5 border-t border-zinc-800" />
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Back</p>
            {renderFace(faces.back)}
          </div>
        </div>
      </div>
    </div>
  );
}

