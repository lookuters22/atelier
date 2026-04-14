/**
 * Timeline thread selection for wedding detail / inbox pipeline.
 * Honors an optional URL `threadId` (inbox draft deep links) over blind `threads[0]` fallback.
 */
export function nextWeddingTimelineThreadId(
  threadIds: readonly string[],
  selectedThreadId: string,
  preferredThreadId: string | null | undefined,
  didAutoPickFirstAwaitingPreferred: boolean,
): { selected: string; markAwaitingPreferred: boolean } | null {
  if (threadIds.length === 0) return null;

  const preferred =
    preferredThreadId && preferredThreadId.trim().length > 0 ? preferredThreadId.trim() : null;
  const preferredInList = preferred !== null && threadIds.includes(preferred);

  if (preferredInList) {
    const hasValid = Boolean(selectedThreadId && threadIds.includes(selectedThreadId));
    if (!hasValid) {
      return { selected: preferred, markAwaitingPreferred: false };
    }
    if (selectedThreadId === preferred) {
      return null;
    }
    if (
      didAutoPickFirstAwaitingPreferred &&
      selectedThreadId === threadIds[0] &&
      preferred !== threadIds[0]
    ) {
      return { selected: preferred, markAwaitingPreferred: false };
    }
    return null;
  }

  const hasValid = Boolean(selectedThreadId && threadIds.includes(selectedThreadId));
  if (!hasValid) {
    return {
      selected: threadIds[0],
      markAwaitingPreferred: preferred !== null,
    };
  }
  return null;
}
