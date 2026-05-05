import type { ConceptEntity } from "@/features/concepts/conceptsSlice";

function optString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function optNumber(v: unknown): number | undefined {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  return undefined;
}

/** Maps one concept JSON row (`id`, snake_case fields) into `ConceptEntity`. */
export function normalizeServerConcept(raw: Record<string, unknown>): ConceptEntity | null {
  const id = typeof raw.id === "string" && raw.id.trim() !== "" ? raw.id : "";
  if (!id) return null;

  const c: ConceptEntity = { id };
  const title = optString(raw.title);
  const body = optString(raw.body);
  const deck_id_hint = optString(raw.deck_id_hint);
  const created_at = optString(raw.created_at);
  const updated_at = optString(raw.updated_at);
  if (title !== undefined) c.title = title;
  if (body !== undefined) c.body = body;
  if (deck_id_hint !== undefined) c.deck_id_hint = deck_id_hint;
  if (created_at !== undefined) c.created_at = created_at;
  if (updated_at !== undefined) c.updated_at = updated_at;

  const content_change_seq = optNumber(raw.content_change_seq);
  if (content_change_seq !== undefined) {
    c.content_change_seq = Math.trunc(content_change_seq);
  }
  return c;
}
