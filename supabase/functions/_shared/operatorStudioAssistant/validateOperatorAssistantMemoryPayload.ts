/**
 * Validation for memory_note proposals + confirm path. `project` | `person` | `studio` — CHECK-safe.
 */
import type {
  InsertOperatorAssistantMemoryBody,
  OperatorAssistantProposedActionMemoryNote,
} from "../../../../src/types/operatorAssistantProposedAction.types.ts";
import type { Database } from "../../../../src/types/database.types.ts";

const MAX_TITLE = 120;
const MAX_SUMMARY = 400;
const MAX_FULL = 8000;

export type ValidatedOperatorAssistantMemoryPayload = InsertOperatorAssistantMemoryBody & {
  memoryScope: Database["public"]["Enums"]["memory_scope"];
};

function trimToMax(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function parseOptionalUuid(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  if (v == null) return null;
  if (typeof v !== "string" || v.trim().length === 0) return null;
  return v.trim();
}

export function validateOperatorAssistantMemoryPayload(
  raw: unknown,
):
  | { ok: true; value: ValidatedOperatorAssistantMemoryPayload }
  | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "payload must be an object" };
  }
  const o = raw as Record<string, unknown>;
  const ms = o.memoryScope;
  if (ms !== "project" && ms !== "studio" && ms !== "person") {
    return { ok: false, error: "memoryScope must be project, studio, or person" };
  }

  const title = trimToMax(o.title, MAX_TITLE);
  if (!title) return { ok: false, error: "title is required" };

  const long = trimToMax(
    o.fullContent != null && String(o.fullContent).trim() !== "" ? o.fullContent : o.summary,
    MAX_FULL,
  );
  if (!long) return { ok: false, error: "summary or fullContent is required" };

  const summaryRaw = trimToMax(o.summary, MAX_SUMMARY);
  const summary = summaryRaw ?? (long.length > MAX_SUMMARY ? long.slice(0, MAX_SUMMARY) : long);

  const weddingId = parseOptionalUuid(o, "weddingId");
  const personId = parseOptionalUuid(o, "personId");

  if (ms === "project") {
    if (!weddingId) return { ok: false, error: "weddingId is required for project memory" };
    if (personId) return { ok: false, error: "personId must be omitted for project memory" };
  } else if (ms === "person") {
    if (!personId) return { ok: false, error: "personId is required for person memory" };
    if (weddingId) return { ok: false, error: "weddingId must be omitted for person memory" };
  } else {
    if (weddingId) return { ok: false, error: "weddingId must be omitted for studio memory" };
    if (personId) return { ok: false, error: "personId must be omitted for studio memory" };
  }

  return {
    ok: true,
    value: {
      memoryScope: ms,
      title,
      summary,
      fullContent: long,
      weddingId: ms === "project" ? weddingId : null,
      personId: ms === "person" ? personId : null,
    },
  };
}

export function tryParseLlmProposedMemoryNote(
  item: unknown,
):
  | { ok: true; value: OperatorAssistantProposedActionMemoryNote }
  | { ok: false; reason: string } {
  if (item == null || typeof item !== "object" || (item as { kind?: unknown }).kind !== "memory_note") {
    return { ok: false, reason: "not a memory_note" };
  }
  const o = item as Record<string, unknown>;
  const ms = o.memoryScope;
  if (ms !== "project" && ms !== "studio" && ms !== "person") {
    return { ok: false, reason: "memoryScope must be project, studio, or person" };
  }

  const title = trimToMax(o.title, MAX_TITLE);
  if (!title) return { ok: false, reason: "title is required" };

  const fromFull = trimToMax(o.fullContent, MAX_FULL);
  const fromSumm = trimToMax(o.summary, MAX_SUMMARY);
  const long = fromFull ?? fromSumm;
  if (!long) return { ok: false, reason: "summary or fullContent is required" };

  const summary = fromSumm ?? (long.length > MAX_SUMMARY ? long.slice(0, MAX_SUMMARY) : long);
  const fullContent = fromFull ?? long;
  if (!summary.trim() || !fullContent.trim()) {
    return { ok: false, reason: "summary or fullContent is required" };
  }

  const weddingId = parseOptionalUuid(o, "weddingId");
  const personId = parseOptionalUuid(o, "personId");

  if (ms === "project") {
    if (!weddingId) return { ok: false, reason: "weddingId required for project memory" };
    if (personId) return { ok: false, reason: "personId must be omitted for project memory" };
  } else if (ms === "person") {
    if (!personId) return { ok: false, reason: "personId required for person memory" };
    if (weddingId) return { ok: false, reason: "weddingId must be omitted for person memory" };
  } else {
    if (weddingId) return { ok: false, reason: "weddingId must be omitted for studio memory" };
    if (personId) return { ok: false, reason: "personId must be omitted for studio memory" };
  }

  return {
    ok: true,
    value: {
      kind: "memory_note",
      memoryScope: ms,
      title,
      summary: summary.length > MAX_SUMMARY ? summary.slice(0, MAX_SUMMARY) : summary,
      fullContent: fullContent.length > MAX_FULL ? fullContent.slice(0, MAX_FULL) : fullContent,
      weddingId: ms === "project" ? weddingId : null,
      personId: ms === "person" ? personId : null,
    },
  };
}
