# Ankiv2 web (`ankiv2/web`) — current functionality

This document describes what the **Next.js 16 (App Router) + React 19** study client does today, aligned with `.cursor/rules/ankiv2-expert.md` and the source under `src/`. For deeper scheduling and queue rules, see `ankiv2/ANKI2-FRONTEND-DESIGN.md` and `ankiv2/DESIGN.md`. For the card browser only, see `ankiv2/CARD-BROWSER-DESIGN.md`.

## Stack and data flow

- **Redux Toolkit** (`src/features/cards`, `src/features/sync`) holds card state and sync flags.
- **IndexedDB** (`src/lib/db/cardsDb.ts`, store `ankiv2` / `cards`) is the offline source of truth; rows can carry `_dirty` until `PATCH /sync` succeeds.
- **Pull**: `POST /cards/new/index` (or the **pull mock** when `NEXT_PUBLIC_USE_SYNC_MOCK=true` / `npm run dev:mock`) loads new cards. **`PATCH /sync` is never mocked** — pushes always hit `NEXT_PUBLIC_API_URL` when configured.
- **Scheduling** (due dates, intervals, grades) runs **in the browser**; the server persists partial updates.

## Environment and API access

| Concern | Behavior |
|--------|----------|
| `NEXT_PUBLIC_API_URL` | Go API origin (no path). Required for real pull/push unless only the pull mock is used. |
| `NEXT_PUBLIC_API_KEY` | If set at **build/dev start**, bundled into the client and **skips** first-run setup when combined with `NEXT_PUBLIC_API_URL` (`hasFullBuildTimeApiConfig` in `src/lib/api/client.ts`). |
| First-run setup | `ApiAppGate` → `ApiKeySetup`: collects URL + optional key, writes `localStorage` (`src/lib/settings/apiCredentials.ts`), sets setup done. |
| E2E test DB header | When `?ankiv2_e2e=1` is used or `NEXT_PUBLIC_ANKIV2_E2E=1`, `apiFetch` adds `X-Ankiv2-Test-Mode: 1` (see `src/lib/api/client.ts`) so the Go API can use `TEST_MONGODB_DATABASE`. |

## Routes (`src/app`)

| Route | Purpose |
|-------|---------|
| `/` | API gate + **home**: nested deck tree, due counts, sync / developer tools, link to **Browse cards**. |
| `/browse` | **Card browser** (`CardBrowserPage`): inspect cards by deck or by flagged filter; see section below. |
| `/study` | Without `deck` query: short message telling the user to open study from a due link on home. |
| `/study?deck=<path>` | **Study mode picker** (`StudyModePicker`): Flashcards vs Crossword Game. |
| `/study?deck=<path>&mode=flashcard` | **Flashcard session** (`StudySession`). |
| `/study?deck=<path>&mode=crossword` | **Crossword session** (`CrosswordGameStudy`). |

`deck` is an Anki-style path using `::` segments; subtree matching is `deck_id === path` or `deck_id.startsWith(path + "::")` (`src/lib/cards/deckTree.ts`).

## Card browser (`browse/page.tsx`, `CardBrowserPage.tsx`)

- **Gate**: `ApiAppGate` + `Suspense` (same first-run URL/key flow as home). On mount: **`hydrateFromIDB`**.
- **Scopes**: **`?filter=flagged`** (all flagged, non-deleted cards) or **`?deck=<path>`** (subtree); optional **`&card=<id>`** selects the viewer row. Updates use **`router.replace`**. If both `filter` and `deck` appear, **flagged wins**.
- **Sidebar**: **Flags** button, then a deck tree built from **`aggregateDeckPathsForBrowser`** + **`buildDeckTree`** (totals count **non-deleted** cards only — not the same aggregates as the home due tree). Expand state: `localStorage` **`ankiv2.cardBrowser.openPaths.v1`** (separate from home’s `ankiv2.deckTree.openPaths.v1`).
- **List**: **`orderedFlaggedCardIds`** / **`orderedCardIdsInDeckSubtree`** (`deckTree.ts`); tombstones (`deleted_at`) hidden.
- **Viewer**: both sides via **`resolveFlashcardFaces`**; **Flag** via **`markCardDirtyLocal`**; **Study deck…** → `/study?deck=…`.
- **Layout**: desktop = three columns (`≥` 1024px); mobile = stepped **Decks → Cards → Card** with **← Decks** / **← Cards** (see design doc for `forceDecksPanel` and single-branch `matchMedia` mounting).

## Home (`HomePage.tsx`)

- On mount: **`hydrateFromIDB`**, then if pull is available **`pullNewCards`** and **`pullContentChangesSince`** once.
- **Browse cards** link in the header → **`/browse`** (card browser).
- **Deck tree** (`DeckTreeRows`): nested labels, expand/collapse per row (state persisted in `localStorage` under `ankiv2.deckTree.openPaths.v1`). Each row shows **due** (flashcard queue + crossword-only breakdown in the button label/title) and **total** cards in subtree.
- **Due logic**: `due_at ≤ now`, not suspended, not buried (`src/lib/cards/due.ts`). Counts refresh on a **1 minute** timer and when the tab becomes visible again.
- **Visibility**: when the document hides and there are dirty cards and the API is ready, **`pushDirtyCards`** runs automatically.
- **Sync & developer tools** (`<details>`): status (`isPulling`, `isPushing`, timestamps, `lastError`, card/dirty counts), buttons — **Reload from IndexedDB**, **Pull new cards**, **Push dirty cards**, **Align variant schedules** (with confirm + status message), **Clear error**, **Reset app** (erase IndexedDB, confirm), **Change API URL & key** (when no full build-time config), **Mark first card dirty (demo)**.

## Study — flashcards (`StudySession.tsx`)

- Re-**hydrates from IDB** on entry.
- **Queue**: `dueCardIdsForDeck(..., mode: "flashcard")` — sorted by `due_at` then `id`. After each grade, the next card is always **`queue[0]`** (never a stale numeric index).
- **Empty queue** states:
  - Cards were answered this session → **Session complete** + link home.
  - Due cards exist only as crossword-only **more_questions** (no flashcard-eligible follow-ups) → message + **Open Crossword Game** link.
  - Otherwise → nothing due in subtree.
- **Card UI**: deck line, **Flag** toggle (marks card dirty), question (`resolveFlashcardFaces` by `note_type` / `card_variant`), **Show answer** (Space/Enter), answer, **Again / Hard / Good / Easy** (keys 1–4 when answer visible) with interval hints, **Custom due** slider (tiered day ranges) + **Apply custom due & next card**.
- **Grading**: `markFlashcardReviewDeferSiblingDuesLocal` updates scheduling across note variants consistently.

## Study — crossword (`CrosswordGameStudy.tsx`)

- Builds a **non-classic** grid from `more_questions` entries with `type: "Crossword"` (normalized answers, min length, max grid size from `src/lib/crossword/types.ts`).
- **Source cards**: prefer due cards in the deck subtree; if none due, can fall back to non-due cards that still have playable clues (`usingNotDueFallback` banner).
- **UI**: Across/Down, Blind/Hints, `CrosswordBoard`, clue text, **View card** (popup flashcard), **Flag**, **Reveal answer**, on-screen **letter keyboard** + physical keyboard.
- **Progress**: each filled word must be **graded** (Again/Hard/Good/Easy) to count; session complete when every word is filled **and** graded. Draft state persists to `localStorage` (debounced + on hide). Completing clears the draft.
- **Crossword debug** panel (`<details>`): JSON snapshot of pipeline inputs.
- After grading the **last Across** word, the UI **switches to Down** when appropriate (per product rule in the expert rule).

## Flashcard rendering (`src/lib/flashcards/`)

- **`resolveFlashcardFaces`** routes by `note_type`: **vocab**, **language**, **knowledge** each have `front_to_back_plus_context`, `back_to_front_plus_context`, and vocab adds `context_to_front_plus_back` / `more_questions` layouts; unknown / missing `note_type` falls back to plain **front/back** (`defaultFaces` in `resolveFlashcardFaces.ts`).
- Legacy wire names for variants are normalized in `*VariantNames.ts` / `getEffectiveCardVariant`.

## Crossword support libs (`src/lib/crossword/`)

- Puzzle build, answer normalization, decoys, word numbering, draft storage, cell display helpers — all consumed by `CrosswordGameStudy` and board components under `src/components/crossword/`.

## Operational notes for QA / Playwright

- Run the **Go API** on the same origin as `NEXT_PUBLIC_API_URL` when testing push/pull; use **`X-Ankiv2-Test-Mode`** (query `ankiv2_e2e=1` or `NEXT_PUBLIC_ANKIV2_E2E=1`) with a valid `TEST_MONGODB_DATABASE` on the server when you need an isolated DB (invalid names will make `PATCH /sync` fail while pull mock is off).
- **`NEXT_PUBLIC_USE_SYNC_MOCK=true`** serves **pull** from `src/lib/mock/cards-new-index.response.json`; **`PATCH /sync` is never mocked** — grading and push still hit the Go API when a base URL is configured.
- Default dev port for this app is **3011** (`package.json`).
- **Automated UI tests** live in `ankiv2/playwright/tests/web/`. Playwright builds this app with the pull mock enabled and serves static `out/` on **`127.0.0.1:3122`** by default (override with `WEB_BASE_URL` / `WEB_PLAYWRIGHT_PORT`) so it does not collide with a developer `next dev` on 3011. Run from `ankiv2/playwright`: `npx playwright test --project=web`.

### Playwright coverage map (current)

| Area | Spec file | What is asserted |
|------|-----------|-------------------|
| Home / deck tree | `tests/web/home.spec.ts` | Pull mock hydrates nested decks; expand/collapse; due link → mode picker; sync panel + Pull; direct flashcard URL |
| Card browser | `tests/web/browse.spec.ts` | Home → Browse; deck scope + list + viewer; flagged empty state; mobile stepped flow |
| Study routing | `tests/web/study-routing.spec.ts` | `/study` without `deck`; mode picker → flashcard; reveal + **Good** + flag; keyboard Space/`3`; custom due block after reveal |
| Crossword | `tests/web/crossword.spec.ts` | Grid chrome (Across/Down, Blind/Hints); reveal + grade one word; View card dialog |

**Not yet automated** (good follow-ups): full crossword session completion (all words graded), every `note_type` / `card_variant` flash layout, visibility-based push, **Reset app** / **Align variant schedules** confirm flows, and `PATCH /sync` success against a healthy Go test DB.
