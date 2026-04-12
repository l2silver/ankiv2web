import type { CardEntity, CrosswordQuestion, MoreQuestion } from "@/features/cards/cardsSlice";
import { getEffectiveCardVariant } from "@/lib/flashcards/effectiveCardVariant";

function sameNote(a: CardEntity, b: CardEntity): boolean {
  return (
    (a.deck_id ?? "") === (b.deck_id ?? "") &&
    (a.front ?? "") === (b.front ?? "") &&
    (a.back ?? "") === (b.back ?? "") &&
    (a.context ?? "") === (b.context ?? "")
  );
}

/**
 * Card id whose scheduling should advance when this crossword clue is graded.
 * Uses `variantType` / `variant_type` on the clue when set; otherwise the carrier (due) card.
 */
export function resolveCrosswordGradeCardId(
  carrier: CardEntity,
  clueVariantWire: string | undefined,
  byId: Record<string, CardEntity>,
  allIds: readonly string[],
): string {
  const raw = clueVariantWire?.trim();
  if (!raw) return carrier.id;

  const targetEff = getEffectiveCardVariant({
    ...carrier,
    card_variant: raw,
  });

  if (getEffectiveCardVariant(carrier) === targetEff) return carrier.id;

  for (const id of allIds) {
    const c = byId[id];
    if (!c) continue;
    if (!sameNote(carrier, c)) continue;
    if (getEffectiveCardVariant(c) === targetEff) return c.id;
  }

  return carrier.id;
}

/** All crossword clues on a card (each `more_questions` row with `type: "Crossword"`). */
export function crosswordQuestionsFromCard(card: CardEntity): CrosswordQuestion[] {
  const out: CrosswordQuestion[] = [];
  for (const item of card.more_questions ?? []) {
    if (String(item.type ?? "").trim().toLowerCase() !== "crossword") continue;
    const ext = item as MoreQuestion & { questions?: CrosswordQuestion[] };
    if (Array.isArray(ext.questions) && ext.questions.length > 0) {
      const parentVt =
        typeof ext.variantType === "string"
          ? ext.variantType
          : typeof ext.variant_type === "string"
            ? ext.variant_type
            : undefined;
      for (const sub of ext.questions) {
        out.push({
          question: sub.question,
          answer: sub.answer,
          variantType: sub.variantType ?? parentVt,
        });
      }
    } else {
      const row = item as MoreQuestion & { variant_type?: string };
      const variantType =
        typeof row.variantType === "string"
          ? row.variantType
          : typeof row.variant_type === "string"
            ? row.variant_type
            : undefined;
      out.push({ question: item.question, answer: item.answer, variantType });
    }
  }
  if (out.length > 0) return out;
  const legacy = (card as CardEntity & { crossword_questions?: CrosswordQuestion[] }).crossword_questions;
  return legacy ?? [];
}
