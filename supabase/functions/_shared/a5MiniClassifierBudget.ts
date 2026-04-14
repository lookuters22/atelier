/**
 * A5 — shared trim + per-field cap for small `gpt-4o-mini` classifier/extraction prompts.
 * Deterministic; same visible marker across all mini-classifier paths.
 */

/** Visible suffix when user/content text exceeds `maxChars` after trim. */
export const A5_MINI_CLASSIFIER_TRUNCATE_MARKER = "… [truncated: A5 budget]";

/**
 * Trims and truncates one user/content field for a classifier or extraction prompt.
 */
export function truncateA5ClassifierField(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n${A5_MINI_CLASSIFIER_TRUNCATE_MARKER}`;
}
