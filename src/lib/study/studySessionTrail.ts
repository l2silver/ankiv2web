/** Flashcard study session navigation: ordered trail + index (supports going back to prior cards). */

export type SessionTrailState = {
  trail: string[];
  trailIndex: number;
};

export function emptySessionTrailState(): SessionTrailState {
  return { trail: [], trailIndex: 0 };
}

/** Seed the trail when the due queue first has a head card. */
export function initSessionTrailIfEmpty(
  state: SessionTrailState,
  queueHeadId: string,
): SessionTrailState {
  if (state.trail.length > 0) return state;
  return { trail: [queueHeadId], trailIndex: 0 };
}

/** When viewing the latest trail entry, append a new queue head after grading advances the queue. */
export function appendQueueHeadToSessionTrailIfAtEnd(
  state: SessionTrailState,
  queueHeadId: string | undefined,
): SessionTrailState {
  if (!queueHeadId || state.trail.length === 0) return state;
  if (state.trailIndex !== state.trail.length - 1) return state;
  if (state.trail[state.trailIndex] === queueHeadId) return state;
  const trail = [...state.trail, queueHeadId];
  return { trail, trailIndex: trail.length - 1 };
}

export function sessionTrailDisplayId(
  state: SessionTrailState,
  queueHeadId: string | undefined,
): string | undefined {
  if (state.trail.length > 0) {
    return state.trail[Math.min(state.trailIndex, state.trail.length - 1)];
  }
  return queueHeadId;
}

export function canGoBackInSessionTrail(state: SessionTrailState): boolean {
  return state.trailIndex > 0;
}

/** Drop forward history after the current card (e.g. before grading from a rewound position). */
export function truncateSessionTrailOnFinish(state: SessionTrailState): SessionTrailState {
  return {
    trail: state.trail.slice(0, state.trailIndex + 1),
    trailIndex: state.trailIndex,
  };
}

export function goBackInSessionTrail(state: SessionTrailState): SessionTrailState {
  if (state.trailIndex <= 0) return state;
  return { ...state, trailIndex: state.trailIndex - 1 };
}
