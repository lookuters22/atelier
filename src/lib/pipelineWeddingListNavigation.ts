/**
 * A7: Cycle through the Pipeline sidebar wedding list (filtered + bucket order, navigation only).
 */

import { isEditableKeyboardTarget } from "./timelineThreadNavigation";

export { isEditableKeyboardTarget };

/** Alt+↑ / Alt+↓ only — avoids clashing with Timeline’s Alt+← / Alt+→. */
export function pipelineWeddingAltVerticalDelta(
  e: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "key">,
): -1 | 1 | null {
  if (!e.altKey) return null;
  if (e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (e.key === "ArrowUp") return -1;
  if (e.key === "ArrowDown") return 1;
  return null;
}

/**
 * Linear order matches Pipeline sidebar: array order of ids (inquiries → active → deliverables → archived).
 * If `currentId` is missing or not in the list, picks first (delta +1) or last (delta -1).
 */
export function adjacentWeddingIdInOrderedList(
  orderedIds: readonly string[],
  currentId: string | null | undefined,
  delta: 1 | -1,
): string | null {
  if (orderedIds.length === 0) return null;
  if (orderedIds.length === 1) return orderedIds[0];
  const has = Boolean(currentId && orderedIds.includes(currentId));
  if (!has) {
    return delta === 1 ? orderedIds[0] : orderedIds[orderedIds.length - 1];
  }
  const idx = orderedIds.indexOf(currentId!);
  const next = (idx + delta + orderedIds.length) % orderedIds.length;
  return orderedIds[next] ?? null;
}

/**
 * A7: Keep the active Pipeline wedding row in view. `nearest` scrolls only when needed (no fight with the user).
 */
export function scrollPipelineWeddingRowIntoView(element: HTMLElement): void {
  element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

/** 1-based index in the filtered queue, or null if selection is missing / not in list. */
export function weddingQueuePosition(
  orderedIds: readonly string[],
  weddingId: string | null | undefined,
): { current: number; total: number } | null {
  if (!weddingId || orderedIds.length === 0) return null;
  const idx = orderedIds.indexOf(weddingId);
  if (idx < 0) return null;
  return { current: idx + 1, total: orderedIds.length };
}
