"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { CardEntity } from "@/features/cards/cardsSlice";
import { markNoteContentFieldsAcrossVariantsLocal } from "@/features/sync/syncThunks";
import { noteVariantCardIds } from "@/lib/cards/crosswordFromCard";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";

type Draft = { front: string; back: string; context: string };

function fieldsFromCard(c: CardEntity): Draft {
  return {
    front: c.front ?? "",
    back: c.back ?? "",
    context: c.context ?? "",
  };
}

type Props = {
  anchorCard: CardEntity;
  disabled?: boolean;
  /** When true, outer spacing is tighter (e.g. modal). */
  compact?: boolean;
};

export function NoteContentFieldsForm({ anchorCard, disabled = false, compact = false }: Props) {
  const dispatch = useAppDispatch();
  const { byId, allIds } = useAppSelector((s) => s.cards);

  const baseline = useMemo(() => fieldsFromCard(anchorCard), [
    anchorCard.id,
    anchorCard.front,
    anchorCard.back,
    anchorCard.context,
  ]);

  const [draft, setDraft] = useState<Draft>(baseline);
  const [saving, setSaving] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setDraft(baseline);
    setInlineError(null);
    setSavedFlash(false);
  }, [baseline]);

  const variantCount = useMemo(
    () => noteVariantCardIds(anchorCard, byId, allIds).length,
    [anchorCard, byId, allIds],
  );

  const dirty =
    draft.front !== baseline.front || draft.back !== baseline.back || draft.context !== baseline.context;

  const discard = useCallback(() => {
    setDraft(baseline);
    setInlineError(null);
  }, [baseline]);

  const save = useCallback(async () => {
    setInlineError(null);
    setSaving(true);
    try {
      await dispatch(
        markNoteContentFieldsAcrossVariantsLocal({
          anchorId: anchorCard.id,
          front: draft.front,
          back: draft.back,
          context: draft.context,
        }),
      ).unwrap();
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 3500);
    } catch (e) {
      setInlineError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [anchorCard.id, dispatch, draft.back, draft.context, draft.front]);

  const gap = compact ? "gap-3" : "gap-4";
  const taRows = compact ? 3 : 4;

  return (
    <details className={`rounded-xl border border-zinc-800 bg-zinc-950/40 ${compact ? "p-3" : "p-4"}`}>
      <summary className="cursor-pointer select-none text-sm font-medium text-zinc-200">
        Edit note text (front, back, context)
      </summary>
      <div className={`mt-4 flex flex-col ${gap}`}>
        <p className="text-xs leading-snug text-zinc-500">
          These values sync to the server on push (<code className="text-zinc-600">PATCH /sync</code>). The question
          / answer layout above may combine them by note type — you are editing the stored fields shared by this note
          {variantCount > 1 ? (
            <>
              {" "}
              (<span className="tabular-nums text-zinc-400">{variantCount}</span> card rows in your library)
            </>
          ) : null}
          .
        </p>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Front</span>
          <textarea
            value={draft.front}
            onChange={(e) => setDraft((d) => ({ ...d, front: e.target.value }))}
            disabled={disabled || saving}
            rows={taRows}
            className="mt-1.5 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-700 focus:outline-none focus:ring-1 focus:ring-sky-600 disabled:opacity-50"
            autoComplete="off"
            spellCheck={true}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Back</span>
          <textarea
            value={draft.back}
            onChange={(e) => setDraft((d) => ({ ...d, back: e.target.value }))}
            disabled={disabled || saving}
            rows={taRows}
            className="mt-1.5 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-700 focus:outline-none focus:ring-1 focus:ring-sky-600 disabled:opacity-50"
            autoComplete="off"
            spellCheck={true}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Context</span>
          <textarea
            value={draft.context}
            onChange={(e) => setDraft((d) => ({ ...d, context: e.target.value }))}
            disabled={disabled || saving}
            rows={taRows}
            className="mt-1.5 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-700 focus:outline-none focus:ring-1 focus:ring-sky-600 disabled:opacity-50"
            autoComplete="off"
            spellCheck={true}
          />
        </label>

        {inlineError ? <p className="text-sm text-rose-300">{inlineError}</p> : null}
        {savedFlash ? <p className="text-sm text-emerald-400/90">Saved locally. Push from home or when the tab hides.</p> : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || saving || !dirty}
            onClick={() => void save()}
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save note text"}
          </button>
          <button
            type="button"
            disabled={disabled || saving || !dirty}
            onClick={discard}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50"
          >
            Discard
          </button>
        </div>
      </div>
    </details>
  );
}
