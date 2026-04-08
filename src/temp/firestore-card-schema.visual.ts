/**
 * TEMPORARY — for visualization only. Not imported by the app.
 *
 * Firestore layout:
 *   Collection: `cards` (env `CARDS_COLLECTION`, default `cards`)
 *   Document:    `cards/{cardId}`  ← stable id (e.g. UUID) is the **document id**
 *
 * Aligns with: `backend/internal/openapi/openapi.yaml` (CardSnapshot, SyncPatchCard)
 *              and repo root `DESIGN.md` (Firestore data model).
 *
 * Safe to delete when you no longer need it.
 */

// --- In Firestore (native types) ---------------------------------------------
// Timestamps are Firestore Timestamp; numbers are double/int as usual.
// The Go API does not define a separate Go struct for the full document.

/** Fields typically stored on the document body (`cards/{cardId}`). */
/** Open vocabulary on `type`; extra keys allowed (see OpenAPI `MoreQuestion.additionalProperties`). */
export type MoreQuestionFirestore = Record<string, unknown> & {
  type: string;
  question: string;
  answer: string;
};

export type FirestoreCardBody = {
  deck_id?: string;
  front?: string;
  back?: string;
  /** Extra study prompts (`type` open-ended; crossword uses `type: "Crossword"`). */
  more_questions?: MoreQuestionFirestore[];
  /** When the card was first created (set by whoever creates the doc). */
  created_at?: FirebaseTimestamp;
  /** Bumped on any write; `PATCH /sync` always sets this server-side. */
  updated_at?: FirebaseTimestamp;

  due_at?: FirebaseTimestamp;
  interval_days?: number;
  ease?: number;
  reps?: number;
  lapses?: number;
  last_reviewed_at?: FirebaseTimestamp;
  suspended?: boolean;
  buried?: boolean;
};

/**
 * Placeholder so this file type-checks without Firebase deps.
 * In Firestore this is `Timestamp`.
 */
export type FirebaseTimestamp = { __firestoreTimestamp: true };

// --- JSON over HTTP (RFC3339 strings for times) -----------------------------

/** One card returned by `POST /cards/new/index` → `{ cards: [...] }`. */
export type CardSnapshotJson = {
  id: string;
  deck_id?: string;
  front?: string;
  back?: string;
  more_questions?: MoreQuestionFirestore[];
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
};

/** One element of `PATCH /sync` body → `{ cards: [...] }`. */
export type SyncPatchCardJson = {
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
  more_questions?: MoreQuestionFirestore[];
};

// --- Examples (hover / jump-to-type in the editor) ---------------------------

export const exampleCardSnapshotJson = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  deck_id: "french-verbs",
  front: "to speak",
  back: "parler",
  more_questions: [
    { type: "Crossword", question: "Speak in French (infinitive)", answer: "PARLER" },
    { type: "Crossword", question: "Same word, 3 letters, common abbreviation in grids", answer: "PAR" },
  ],
  due_at: "2026-04-06T12:00:00.000Z",
  interval_days: 3,
  ease: 2.5,
  reps: 4,
  lapses: 0,
  last_reviewed_at: "2026-04-05T09:15:00.000Z",
  suspended: false,
  buried: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-04-05T09:15:01.000Z",
} as const satisfies CardSnapshotJson;

export const exampleSyncPatchJson = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  due_at: "2026-04-07T08:00:00.000Z",
  reps: 5,
  interval_days: 7,
} as const satisfies SyncPatchCardJson;
