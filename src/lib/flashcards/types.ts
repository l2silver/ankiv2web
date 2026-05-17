import type { ReactNode } from "react";

export type FlashcardFaces = {
  front: ReactNode;
  /** `null` = no answer face (permanent image deck). */
  back: ReactNode | null;
};
