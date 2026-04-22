/**
 * Display helpers for JSONB / profile field values (Ana, operator review, diffs).
 * Kept free of supabase/assistant read helpers to avoid import cycles.
 */

const MAX_DEFAULT = 520;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Turn JSONB column values into a short line for the LLM or UI (bounded; no multi-KB blobs).
 */
export function summarizeProfileJsonField(value: unknown, maxChars: number = MAX_DEFAULT): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length > 0 ? clip(t, maxChars) : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.every((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean")) {
      return clip(value.map(String).join(", "), maxChars);
    }
    try {
      return clip(JSON.stringify(value), maxChars);
    } catch {
      return null;
    }
  }
  if (typeof value === "object") {
    try {
      return clip(JSON.stringify(value), maxChars);
    } catch {
      return null;
    }
  }
  return null;
}
