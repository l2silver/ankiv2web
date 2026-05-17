"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { DeckTreeNode } from "@/lib/cards/deckTree";
import { isPermanentDeckPath } from "@/lib/permanentDeck/isPermanentDeck";

const OPEN_DECKS_STORAGE_KEY = "ankiv2.deckTree.openPaths.v1";

function loadOpenDeckPathsFromStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(OPEN_DECKS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const next = new Set<string>();
    for (const v of parsed) {
      if (typeof v === "string" && v.trim()) next.add(v);
    }
    return next;
  } catch {
    return new Set();
  }
}

function anyStudyDue(node: DeckTreeNode): number {
  return node.due + node.dueCrosswordOnly;
}

function hasChildren(node: DeckTreeNode): boolean {
  return node.children.length > 0;
}

function dueButtonLabel(node: DeckTreeNode): string {
  const { due, dueCrosswordOnly } = node;
  if (due === 0 && dueCrosswordOnly === 0) return "0 due";
  if (dueCrosswordOnly === 0) return `${due} due`;
  if (due === 0) return `${dueCrosswordOnly} more_questions-only`;
  return `${due} + ${dueCrosswordOnly} more_questions-only`;
}

function dueButtonTitle(node: DeckTreeNode): string {
  const n = anyStudyDue(node);
  if (n === 0) return "Nothing due in this deck (including subdecks)";
  const parts = [
    node.due > 0 ? `${node.due} flashcard` : null,
    node.dueCrosswordOnly > 0 ? `${node.dueCrosswordOnly} more_questions-only (crossword)` : null,
  ].filter(Boolean);
  const base = `Choose study mode (${parts.join(", ")} due in this deck tree)`;
  if (node.dueCrosswordOnly === 0) return base;
  return base + " — more_questions-only: no drill variant is due for that note, but a crossword row still is.";
}

/** Extra left padding per nesting level so hierarchy is obvious. */
const INDENT_STEP_PX = 24;
const INDENT_BASE_PX = 12;

function DeckSubtree({
  node,
  depth,
  isOpen,
  toggleOpen,
}: {
  node: DeckTreeNode;
  depth: number;
  isOpen: (path: string) => boolean;
  toggleOpen: (path: string) => void;
}) {
  const router = useRouter();
  const rowPadLeft = INDENT_BASE_PX + depth * INDENT_STEP_PX;
  const expandable = hasChildren(node);
  const open = isOpen(node.path);

  return (
    <li className="list-none">
      <div
        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-zinc-800/80 bg-zinc-900/40 py-2 pr-3"
        style={{ paddingLeft: rowPadLeft }}
      >
        <span className="min-w-0 text-zinc-100">
          <span className="sr-only">Nesting level {depth + 1}. </span>
          <span className="inline-flex min-w-0 items-baseline gap-1.5">
            {expandable ? (
              <button
                type="button"
                onClick={() => toggleOpen(node.path)}
                aria-expanded={open}
                aria-label={open ? `Collapse ${node.label}` : `Expand ${node.label}`}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-zinc-700/80 bg-zinc-950/20 text-xs text-zinc-300 hover:bg-zinc-950/50"
              >
                <span aria-hidden="true">{open ? "▾" : "▸"}</span>
              </button>
            ) : (
              <span className="inline-block h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 truncate">{node.label}</span>
          </span>
        </span>
        <span className="flex min-w-[10rem] shrink-0 items-baseline justify-end gap-2 text-sm sm:min-w-0">
          <button
            type="button"
            disabled={anyStudyDue(node) === 0}
            onClick={() =>
              router.push(
                isPermanentDeckPath(node.path)
                  ? `/study?deck=${encodeURIComponent(node.path)}&mode=flashcard`
                  : `/study?deck=${encodeURIComponent(node.path)}`,
              )
            }
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
      {expandable && open ? (
        <ul className="mt-2 ml-1 list-none space-y-2 border-l-2 border-sky-800/60 pl-3">
          {node.children.map((child) => (
            <DeckSubtree
              key={child.path}
              node={child}
              depth={depth + 1}
              isOpen={isOpen}
              toggleOpen={toggleOpen}
            />
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
  const [openPaths, setOpenPaths] = useState<Set<string>>(() => loadOpenDeckPathsFromStorage());

  const isOpen = useCallback((path: string) => openPaths.has(path), [openPaths]);

  const toggleOpen = useCallback((path: string) => {
    setOpenPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_DECKS_STORAGE_KEY, JSON.stringify([...openPaths]));
    } catch {
      // ignore (private mode / quota)
    }
  }, [openPaths]);

  return (
    <ul className="mt-5 list-none space-y-2 p-0">
      {nodes.map((node) => (
        <DeckSubtree
          key={node.path}
          node={node}
          depth={0}
          isOpen={isOpen}
          toggleOpen={toggleOpen}
        />
      ))}
    </ul>
  );
}
