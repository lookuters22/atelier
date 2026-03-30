const DATA_CHANGED = "atelier:data-changed";

/**
 * Fire after any mutation that should refresh sidebar badges,
 * notification bell, approval lists, or timeline views.
 */
export function fireDataChanged() {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED));
}

export function onDataChanged(callback: () => void): () => void {
  window.addEventListener(DATA_CHANGED, callback);
  return () => window.removeEventListener(DATA_CHANGED, callback);
}

// Keep the old names as aliases so existing call-sites still compile.
export const fireDraftsChanged = fireDataChanged;
export const onDraftsChanged = onDataChanged;
