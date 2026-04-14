import type { CardEntity } from "@/features/cards/cardsSlice";

import { scheduleNoteKey } from "@/lib/cards/crosswordFromCard";
import { countsInFlashcardStudyQueue } from "@/lib/flashcards/moreQuestionEligible";

/** Scheduling slice copied across variant rows of one note. */
export type NoteSchedulePatch = Pick<
  CardEntity,
  "due_at" | "interval_days" | "ease" | "reps" | "lapses" | "last_reviewed_at"
> & {
  relearn_step?: number;
};

function dueAtMs(c: CardEntity): number {
  const t = Date.parse(c.due_at ?? "");
  return Number.isNaN(t) ? 0 : t;
}

function isActiveForRealign(c: CardEntity): boolean {
  return !c.suspended && !c.buried;
}

/**
 * Pick the variant row whose schedule other siblings should match: prefer a flashcard-queue row,
 * then earliest `due_at`, then stable id tie-break.
 */
export function pickLeadVariantForNoteGroup(members: CardEntity[]): CardEntity {
  const active = members.filter(isActiveForRealign);
  const pool = active.length > 0 ? active : members;
  const flash = pool.filter(countsInFlashcardStudyQueue);
  const ranked = (flash.length > 0 ? flash : pool).slice();
  ranked.sort((a, b) => {
    const d = dueAtMs(a) - dueAtMs(b);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
  return ranked[0]!;
}

export function schedulePatchFromCard(lead: CardEntity): NoteSchedulePatch {
  return {
    due_at: lead.due_at,
    interval_days: lead.interval_days,
    ease: lead.ease,
    reps: lead.reps,
    lapses: lead.lapses,
    last_reviewed_at: lead.last_reviewed_at,
    relearn_step: lead.relearn_step,
  };
}

function intervalClose(a: number | undefined, b: number | undefined): boolean {
  return Math.abs((a ?? 0) - (b ?? 0)) < 1e-6;
}

export function noteScheduleMatchesPatch(card: CardEntity, patch: NoteSchedulePatch): boolean {
  return (
    (card.due_at ?? "") === (patch.due_at ?? "") &&
    intervalClose(card.interval_days, patch.interval_days) &&
    (card.ease ?? 0) === (patch.ease ?? 0) &&
    (card.reps ?? 0) === (patch.reps ?? 0) &&
    (card.lapses ?? 0) === (patch.lapses ?? 0) &&
    (card.last_reviewed_at ?? "") === (patch.last_reviewed_at ?? "") &&
    (card.relearn_step ?? undefined) === (patch.relearn_step ?? undefined)
  );
}

export type RealignPatch = { id: string; fields: NoteSchedulePatch };

/**
 * For each note (same deck + main fields), align every variant row to the lead variant's schedule.
 * Used to clear stale `more_questions`-only dues after older data never propagated.
 */
export function computeNoteVariantScheduleRealignments(
  byId: Record<string, CardEntity>,
  allIds: readonly string[],
): { patches: RealignPatch[]; groupCount: number } {
  const groups = new Map<string, CardEntity[]>();
  for (const id of allIds) {
    const c = byId[id];
    if (!c) continue;
    const k = scheduleNoteKey(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }

  const patches: RealignPatch[] = [];
  let groupCount = 0;
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    groupCount++;
    const lead = pickLeadVariantForNoteGroup(members);
    const fields = schedulePatchFromCard(lead);
    for (const m of members) {
      if (m.id === lead.id) continue;
      if (noteScheduleMatchesPatch(m, fields)) continue;
      patches.push({ id: m.id, fields });
    }
  }
  return { patches, groupCount };
}
