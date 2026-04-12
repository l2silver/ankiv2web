import { apiFetch, isSyncPullMockEnabled } from "@/lib/api/client";
import type {
  CardsByIdsRequest,
  CardsNewIndexRequest,
  CardsNewIndexResponse,
  SyncPatchRequest,
  SyncPatchResponse,
} from "@/lib/api/types";
import mockCardsNewIndexResponse from "@/lib/mock/cards-new-index.response.json";

export async function postCardsNewIndex(body: CardsNewIndexRequest): Promise<CardsNewIndexResponse> {
  if (isSyncPullMockEnabled()) {
    // Dev: always return the full fixture so edits to the JSON (e.g. deck_id) show up on
    // "Pull new cards" without clearing IndexedDB. Real API only returns ids not in body.ids.
    return { cards: mockCardsNewIndexResponse.cards } as CardsNewIndexResponse;
  }

  const res = await apiFetch("/cards/new/index", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `POST /cards/new/index failed: ${res.status}`);
  }
  return res.json() as Promise<CardsNewIndexResponse>;
}

/** Full rows for known ids (server updates to `more_questions`, etc.). Not available when pull mock is on. */
export async function postCardsByIds(body: CardsByIdsRequest): Promise<CardsNewIndexResponse> {
  if (isSyncPullMockEnabled()) {
    throw new Error(
      "POST /cards/by-ids is not available with pull mock enabled (disable NEXT_PUBLIC_USE_SYNC_MOCK).",
    );
  }
  const res = await apiFetch("/cards/by-ids", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `POST /cards/by-ids failed: ${res.status}`);
  }
  return res.json() as Promise<CardsNewIndexResponse>;
}

export async function patchSync(body: SyncPatchRequest): Promise<SyncPatchResponse> {
  const res = await apiFetch("/sync", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `PATCH /sync failed: ${res.status}`);
  }
  return res.json() as Promise<SyncPatchResponse>;
}
