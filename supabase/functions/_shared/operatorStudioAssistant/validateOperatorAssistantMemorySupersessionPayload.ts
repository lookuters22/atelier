/**
 * Body for `supersede-operator-assistant-memory`: two memory UUIDs only (tenant from JWT).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ValidatedMemorySupersessionPayload = {
  supersedingMemoryId: string;
  supersededMemoryId: string;
};

function parseUuid(v: unknown, field: string): string | { error: string } {
  if (typeof v !== "string" || v.trim().length === 0) {
    return { error: `${field} must be a non-empty string` };
  }
  const s = v.trim();
  if (!UUID_RE.test(s)) {
    return { error: `${field} must be a valid UUID` };
  }
  return s;
}

export function validateOperatorAssistantMemorySupersessionPayload(
  body: unknown,
): { ok: true; value: ValidatedMemorySupersessionPayload } | { ok: false; error: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const o = body as Record<string, unknown>;

  const a = parseUuid(o.supersedingMemoryId, "supersedingMemoryId");
  if (typeof a === "object" && "error" in a) return { ok: false, error: a.error };

  const b = parseUuid(o.supersededMemoryId, "supersededMemoryId");
  if (typeof b === "object" && "error" in b) return { ok: false, error: b.error };

  if (a === b) {
    return { ok: false, error: "supersedingMemoryId and supersededMemoryId must differ" };
  }

  return { ok: true, value: { supersedingMemoryId: a, supersededMemoryId: b } };
}
