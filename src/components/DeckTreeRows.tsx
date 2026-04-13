"use client";

import { useRouter } from "next/navigation";

import type { DeckTreeNode } from "@/lib/cards/deckTree";

function anyStudyDue(node: DeckTreeNode): number {
  return node.due + node.dueCrosswordOnly;
}

function dueButtonLabel(node: DeckTreeNode): string {
  const { due, dueCrosswordOnly } = node;
  if (due === 0 && dueCrosswordOnly === 0) return "0 due";
  if (dueCrosswordOnly === 0) return `${due} due`;
  if (due === 0) return `${dueCrosswordOnly} crossword due`;
  return `${due} + ${dueCrosswordOnly} crossword due`;
}

function dueButtonTitle(node: DeckTreeNode): string {
  const n = anyStudyDue(node);
  if (n === 0) return "Nothing due in this deck (including subdecks)";
  const parts = [
    node.due > 0 ? `${node.due} flashcard` : null,
    node.dueCrosswordOnly > 0 ? `${node.dueCrosswordOnly} crossword-only` : null,
  ].filter(Boolean);
  return `Choose study mode (${parts.join(", ")} due in this deck tree)`;
}

/** Extra left padding per nesting level so hierarchy is obvious. */
const INDENT_STEP_PX = 24;
const INDENT_BASE_PX = 12;

function DeckSubtree({ node, depth }: { node: DeckTreeNode; depth: number }) {
  const router = useRouter();
  const rowPadLeft = INDENT_BASE_PX + depth * INDENT_STEP_PX;

  return (
    <li className="list-none">
      <div
        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-zinc-800/80 bg-zinc-900/40 py-2 pr-3"
        style={{ paddingLeft: rowPadLeft }}
      >
        <span className="min-w-0 text-zinc-100">
          <span className="sr-only">Nesting level {depth + 1}. </span>
          {node.label}
        </span>
        <span className="flex min-w-[10rem] shrink-0 items-baseline justify-end gap-2 text-sm sm:min-w-0">
          <button
            type="button"
            disabled={anyStudyDue(node) === 0}
            onClick={() => router.push(`/study?deck=${encodeURIComponent(node.path)}`)}
            title={dueButtonTitle(node)}
            className={
              anyStudyDue(node) > 0
                ? "rounded-md px-1.5 py-0.5 font-medium tabular-nums text-sky-400 underline decoration-sky-400/50 underline-offset-2 hover:bg-sky-950/50 hover:text-sky-300"
                : "cursor-not-allowed tabular-nums text-zinc-600"
            }
          >
            {dueButtonLabel(node)}
          </button>
          <span className="tabular-nums text-zinc-600">· {node.total} cards</span>
        </span>
      </div>
      {node.children.length > 0 ? (
        <ul className="mt-2 ml-1 list-none space-y-2 border-l-2 border-sky-800/60 pl-3">
          {node.children.map((child) => (
            <DeckSubtree key={child.path} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

type Props = {
  nodes: DeckTreeNode[];
};

/**
 * Nested decks: each row is indented an extra ~24px per level; subdecks sit in a list with a
 * vertical bar on the left (`border-l`).
 */
export function DeckTreeRows({ nodes }: Props) {
  return (
    <ul className="mt-5 list-none space-y-2 p-0">
      {nodes.map((node) => (
        <DeckSubtree key={node.path} node={node} depth={0} />
      ))}
    </ul>
  );
}
