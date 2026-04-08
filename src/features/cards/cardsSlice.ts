import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/** `{ question, answer }` clue text for the crossword grid (from each `more_questions` row with `type: "Crossword"`). */
export type CrosswordQuestion = {
  question: string;
  answer: string;
};

/**
 * One row in `more_questions` (API / Firestore: snake_case). From deck `moreQuestions` gzip JSON.
 * `type` is an open vocabulary (Crossword, FillIn, Similar, …); extra keys are preserved for future modes.
 */
export type MoreQuestion = Record<string, unknown> & {
  type: string;
  question: string;
  answer: string;
};

/** Card in Redux / UI; mirrors API field names. `dirty` = local edits not yet `PATCH /sync`. */
export type CardEntity = {
  id: string;
  deck_id?: string;
  front?: string;
  back?: string;
  /** Extra context text (optional; matches deck import / legacy Anki `Context`). */
  context?: string;
  /** Deck generator / model label (e.g. language, vocab). */
  note_type?: string;
  /** Extra study prompts (any `type`); crossword UI uses rows where `type === "Crossword"`. */
  more_questions?: MoreQuestion[];
  due_at?: string;
  interval_days?: number;
  ease?: number;
  reps?: number;
  lapses?: number;
  last_reviewed_at?: string;
  suspended?: boolean;
  buried?: boolean;
  created_at?: string;
  updated_at?: string;
  /** Local-only: relearning ladder step after a lapse (not sent to the API). */
  relearn_step?: number;
  dirty?: boolean;
};

type CardsState = {
  byId: Record<string, CardEntity>;
  allIds: string[];
};

const initialState: CardsState = {
  byId: {},
  allIds: [],
};

const cardsSlice = createSlice({
  name: "cards",
  initialState,
  reducers: {
    resetCards(state) {
      state.byId = {};
      state.allIds = [];
    },
    hydrateCards(state, action: PayloadAction<CardEntity[]>) {
      state.byId = {};
      state.allIds = [];
      for (const c of action.payload) {
        state.byId[c.id] = { ...c };
        state.allIds.push(c.id);
      }
    },
    upsertMany(state, action: PayloadAction<CardEntity[]>) {
      for (const c of action.payload) {
        if (state.byId[c.id] === undefined) {
          state.allIds.push(c.id);
        }
        state.byId[c.id] = { ...c };
      }
    },
    clearDirtyForIds(state, action: PayloadAction<string[]>) {
      for (const id of action.payload) {
        const row = state.byId[id];
        if (row) {
          row.dirty = false;
        }
      }
    },
  },
});

export const { resetCards, hydrateCards, upsertMany, clearDirtyForIds } = cardsSlice.actions;
export default cardsSlice.reducer;
