/**
 * A7: Thread cycling + keyboard guard for Timeline (wedding-scoped, no API).
 */

export type ThreadIdList = readonly { id: string }[];

/** Cycle within the wedding’s thread list — same order as thread chips. */
export function adjacentThreadId(
  threads: ThreadIdList,
  currentId: string | undefined,
  delta: 1 | -1,
): string | null {
  if (threads.length < 2 || !currentId) return null;
  const idx = threads.findIndex((t) => t.id === currentId);
  if (idx < 0) return null;
  const next = (idx + delta + threads.length) % threads.length;
  return threads[next]?.id ?? null;
}

/** 1-based index in the wedding’s thread list (same order as thread chips), or null if unknown. */
export function threadQueuePosition(
  threads: ThreadIdList,
  currentId: string | undefined,
): { current: number; total: number } | null {
  if (!currentId || threads.length === 0) return null;
  const idx = threads.findIndex((t) => t.id === currentId);
  if (idx < 0) return null;
  return { current: idx + 1, total: threads.length };
}

/** Alt+Arrow only (no Ctrl/Meta/Shift) — matches Timeline thread shortcuts. */
export function timelineThreadAltArrowDelta(
  e: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "key">,
): -1 | 1 | null {
  if (!e.altKey) return null;
  if (e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (e.key === "ArrowLeft") return -1;
  if (e.key === "ArrowRight") return 1;
  return null;
}

/**
 * Skip shortcuts while typing — inputs, textareas, selects, contenteditable.
 */
export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as HTMLElement & { tagName?: string };
  if (el.isContentEditable) return true;
  const tag = typeof el.tagName === "string" ? el.tagName : "";
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const t = String((el as HTMLInputElement).type ?? "text").toLowerCase();
    if (
      ["button", "submit", "reset", "checkbox", "radio", "file", "hidden", "image", "range", "color"].includes(t)
    ) {
      return false;
    }
    return true;
  }
  if (typeof el.closest === "function" && el.closest("[contenteditable='true']")) return true;
  return false;
}
