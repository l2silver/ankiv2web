"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Suspense } from "react";

import { CrosswordGameStudy } from "@/components/CrosswordGameStudy";
import { StudyModePicker } from "@/components/StudyModePicker";
import { StudySession } from "@/components/StudySession";

const STUDY_MODES = ["flashcard", "crossword"] as const;
type StudyMode = (typeof STUDY_MODES)[number];

function isStudyMode(value: string | null): value is StudyMode {
  return value !== null && (STUDY_MODES as readonly string[]).includes(value);
}

function StudyInner() {
  const sp = useSearchParams();
  const deck = sp.get("deck");
  const modeRaw = sp.get("mode");
  const mode = isStudyMode(modeRaw) ? modeRaw : null;

  return (
    <div className="min-h-full bg-zinc-950 px-6 py-10 text-zinc-100">
      {deck && mode === "flashcard" ? (
        <StudySession deckPath={deck} />
      ) : deck && mode === "crossword" ? (
        <CrosswordGameStudy deckPath={deck} />
      ) : deck ? (
        <StudyModePicker deckPath={deck} />
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            <Link href="/" className="text-sky-400 hover:text-sky-300">
              ← Decks
            </Link>
          </p>
          <h1 className="mt-4 text-xl font-semibold">Study</h1>
          <p className="mt-2 text-sm text-amber-400/90">
            No deck query — open this page from a due count on the home screen.
          </p>
        </>
      )}
    </div>
  );
}

export default function StudyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-full bg-zinc-950 px-6 py-10 text-sm text-zinc-500">Loading…</div>
      }
    >
      <StudyInner />
    </Suspense>
  );
}
