import type { CardEntity, CrosswordQuestion, MoreQuestion } from "@/features/cards/cardsSlice";

function optString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function optNumber(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  return undefined;
}

function optBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function optCrosswordQuestions(v: unknown): CrosswordQuestion[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: CrosswordQuestion[] = [];
  for (const item of v) {
    if (item === null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const question = optString(o.question);
    const answer = optString(o.answer);
    if (question === undefined || answer === undefined) continue;
    out.push({ question, answer });
  }
  return out.length > 0 ? out : [];
}

function optMoreQuestions(v: unknown): MoreQuestion[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: MoreQuestion[] = [];
  for (const item of v) {
    if (item === null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const typeStr = optString(o.type);
    const question = optString(o.question);
    const answer = optString(o.answer);

    if (typeStr === "Crossword" && Array.isArray(o.questions)) {
      const nested = optCrosswordQuestions(o.questions);
      if (nested === undefined) continue;
      for (const q of nested) {
        out.push({ type: "Crossword", question: q.question, answer: q.answer });
      }
      continue;
    }

    if (question === undefined || answer === undefined) continue;

    const row = JSON.parse(JSON.stringify(o)) as MoreQuestion;
    row.type = typeStr && typeStr !== "" ? typeStr : "FillIn";
    row.question = question;
    row.answer = answer;
    delete row.questions;
    out.push(row);
  }
  return out;
}

/** Maps one server / Firestore JSON object into a `CardEntity` (snake_case fields). */
export function normalizeServerCard(raw: Record<string, unknown>): CardEntity | null {
  const id = raw.id;
  if (typeof id !== "string" || id === "") return null;

  const card: CardEntity = { id };
  const deck_id = optString(raw.deck_id);
  const front = optString(raw.front);
  const back = optString(raw.back);
  const context = optString(raw.context);
  const note_type = optString(raw.note_type);
  const card_variant = optString(raw.card_variant);
  const due_at = optString(raw.due_at);
  const last_reviewed_at = optString(raw.last_reviewed_at);
  const created_at = optString(raw.created_at);
  const updated_at = optString(raw.updated_at);
  if (deck_id !== undefined) card.deck_id = deck_id;
  if (front !== undefined) card.front = front;
  if (back !== undefined) card.back = back;
  if (context !== undefined) card.context = context;
  if (note_type !== undefined) card.note_type = note_type;
  if (card_variant !== undefined) card.card_variant = card_variant;
  if (due_at !== undefined) card.due_at = due_at;
  if (last_reviewed_at !== undefined) card.last_reviewed_at = last_reviewed_at;
  if (created_at !== undefined) card.created_at = created_at;
  if (updated_at !== undefined) card.updated_at = updated_at;

  const interval_days = optNumber(raw.interval_days);
  const ease = optNumber(raw.ease);
  const reps = optNumber(raw.reps);
  const lapses = optNumber(raw.lapses);
  if (interval_days !== undefined) card.interval_days = interval_days;
  if (ease !== undefined) card.ease = ease;
  if (reps !== undefined) card.reps = Math.trunc(reps);
  if (lapses !== undefined) card.lapses = Math.trunc(lapses);

  const suspended = optBool(raw.suspended);
  const buried = optBool(raw.buried);
  if (suspended !== undefined) card.suspended = suspended;
  if (buried !== undefined) card.buried = buried;

  let more_questions = optMoreQuestions(raw.more_questions);
  const legacyCross = optCrosswordQuestions(raw.crossword_questions);
  if (legacyCross !== undefined && legacyCross.length > 0) {
    const hasCrosswordClues = more_questions?.some(m => m.type === "Crossword") ?? false;
    if (!hasCrosswordClues) {
      const base = more_questions ? [...more_questions] : [];
      for (const q of legacyCross) {
        base.push({ type: "Crossword", question: q.question, answer: q.answer });
      }
      more_questions = base;
    }
  }
  if (more_questions !== undefined) card.more_questions = more_questions;

  return card;
}
