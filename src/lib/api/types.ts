import type { CrosswordQuestion, MoreQuestion } from "@/features/cards/cardsSlice";

export type { CrosswordQuestion, MoreQuestion };

/** Body for `PATCH /sync` — `id` plus any fields that changed (snake_case, matches OpenAPI). */
export type SyncPatchCard = {
  id: string;
  due_at?: string;
  interval_days?: number;
  ease?: number;
  reps?: number;
  lapses?: number;
  last_reviewed_at?: string;
  suspended?: boolean;
  buried?: boolean;
  deck_id?: string;
  front?: string;
  back?: string;
  context?: string;
  note_type?: string;
  card_variant?: string;
  /** Replaces the full list when present (any `type` string; extra keys allowed). */
  more_questions?: MoreQuestion[];
};

export type SyncPatchRequest = {
  cards: SyncPatchCard[];
};

export type SyncPatchResponse = {
  updated: number;
};

export type CardsNewIndexRequest = {
  ids: string[];
};

export type CardsNewIndexResponse = {
  cards: Record<string, unknown>[];
};

export type CardsChangedSinceRequest = {
  since_sequence: number;
  after_sequence?: number;
};

export type CardsChangedSinceResponse = {
  cards: Record<string, unknown>[];
  has_more: boolean;
  next_after_sequence?: number;
};
