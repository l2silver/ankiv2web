"use client";

import { useRouter } from "next/navigation";

import type { DeckTreeNode } from "@/lib/cards/deckTree";

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
            disabled={node.due === 0}
            onClick={() => router.push(`/study?deck=${encodeURIComponent(node.path)}`)}
            title={
              node.due === 0
                ? "Nothing due in this deck (including subdecks)"
                : `Choose study mode for this deck tree (${node.due} due)`
            }
            className={
              node.due > 0
                ? "rounded-md px-1.5 py-0.5 font-medium tabular-nums text-sky-400 underline decoration-sky-400/50 underline-offset-2 hover:bg-sky-950/50 hover:text-sky-300"
                : "cursor-not-allowed tabular-nums text-zinc-600"
            }
          >
            {node.due} due
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
