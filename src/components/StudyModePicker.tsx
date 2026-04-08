"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  deckPath: string;
};

export function StudyModePicker({ deckPath }: Props) {
  const router = useRouter();
  const q = encodeURIComponent(deckPath);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-zinc-500">
        <Link href="/" className="text-sky-400 hover:text-sky-300">
          ← Decks
        </Link>
      </p>
      <h1 className="mt-4 text-xl font-semibold text-zinc-100">Study</h1>
      <p className="mt-1 truncate text-xs text-zinc-600" title={deckPath}>
        <span className="text-zinc-500">Deck</span> <span className="text-zinc-400">{deckPath}</span>
      </p>
      <p className="mt-3 text-sm text-zinc-400">Choose how you want to study this deck.</p>

      <ul className="mt-8 list-none space-y-3 p-0">
        <li>
          <button
            type="button"
            onClick={() => router.push(`/study?deck=${q}&mode=flashcard`)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900/50 px-5 py-4 text-left transition hover:border-sky-700/80 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            <span className="text-base font-semibold text-zinc-100">Flashcards</span>
            <span className="mt-1 block text-sm text-zinc-500">
              Classic front → reveal answer, then grade (Again / Hard / Good / Easy).
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => router.push(`/study?deck=${q}&mode=crossword`)}
            className="w-full rounded-xl border border-zinc-700 border-dashed bg-zinc-900/30 px-5 py-4 text-left transition hover:border-violet-700/80 hover:bg-zinc-900/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            <span className="text-base font-semibold text-zinc-100">Crossword Game</span>
            <span className="mt-1 block text-sm text-zinc-500">Crossword-style practice (in progress).</span>
          </button>
        </li>
      </ul>
    </div>
  );
}
