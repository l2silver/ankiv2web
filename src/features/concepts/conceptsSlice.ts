import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/** Theory document from `POST /concepts/*` (`body` is plain text; study UI matches card field rendering). */
export type ConceptEntity = {
  id: string;
  title?: string;
  body?: string;
  deck_id_hint?: string;
  created_at?: string;
  updated_at?: string;
  content_change_seq?: number;
};

type ConceptsState = {
  byId: Record<string, ConceptEntity>;
};

const initialState: ConceptsState = {
  byId: {},
};

const conceptsSlice = createSlice({
  name: "concepts",
  initialState,
  reducers: {
    resetConcepts(state) {
      state.byId = {};
    },
    hydrateConcepts(state, action: PayloadAction<ConceptEntity[]>) {
      state.byId = {};
      for (const c of action.payload) {
        state.byId[c.id] = { ...c };
      }
    },
    upsertManyConcepts(state, action: PayloadAction<ConceptEntity[]>) {
      for (const c of action.payload) {
        state.byId[c.id] = { ...c };
      }
    },
  },
});

export const { resetConcepts, hydrateConcepts, upsertManyConcepts } = conceptsSlice.actions;
export default conceptsSlice.reducer;
