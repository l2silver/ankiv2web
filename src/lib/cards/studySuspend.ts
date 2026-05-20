import { markCardDirtyLocal } from "@/features/sync/syncThunks";

export const STUDY_SUSPEND_CARD_FIELDS = { suspended: true as const };

type SuspendDispatch = {
  (action: ReturnType<typeof markCardDirtyLocal>): { unwrap: () => Promise<string> };
};

/** Mark the current flashcard variant suspended locally (no confirmation). */
export async function suspendStudyCardVariant(
  card: { id: string } | undefined,
  gradingLocked: boolean,
  dispatch: SuspendDispatch,
): Promise<boolean> {
  if (!card || gradingLocked) return false;
  await dispatch(markCardDirtyLocal({ id: card.id, fields: STUDY_SUSPEND_CARD_FIELDS })).unwrap();
  return true;
}
