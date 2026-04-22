/**
 * Validation for memory_note proposals + confirm path. `project` | `person` | `studio` — CHECK-safe.
 */
import type {
  InsertOperatorAssistantMemoryBody,
  OperatorAssistantProposedActionMemoryNote,
} from "../../../../src/types/operatorAssistantProposedAction.types.ts";
import type { Database } from "../../../../src/types/database.types.ts";
import {
  composeOperatorAssistantMemorySummaryForStorage,
  MAX_OPERATOR_MEMORY_OUTCOME_CHARS,
} from "../../../../src/lib/composeOperatorAssistantMemorySummary.ts";

const MAX_TITLE = 120;
const MAX_SUMMARY = 400;
const MAX_FULL = 8000;
const MAX_OUTCOME = MAX_OPERATOR_MEMORY_OUTCOME_CHARS;

/** Post-validation row payload: `summary` is composed for `memories.summary` (header consumers). */
export type ValidatedOperatorAssistantMemoryPayload = Omit<InsertOperatorAssistantMemoryBody, "summary"> & {
  memoryScope: Database["public"]["Enums"]["memory_scope"];
  summary: string;
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

  const outcome = trimToMax(o.outcome, MAX_OUTCOME);
  if (!outcome) return { ok: false, error: "outcome is required" };

  const long = trimToMax(
    o.fullContent != null && String(o.fullContent).trim() !== "" ? o.fullContent : o.summary,
    MAX_FULL,
  );
  if (!long) return { ok: false, error: "summary or fullContent is required" };

  const summaryRaw = trimToMax(o.summary, MAX_SUMMARY);
  const supplementary =
    summaryRaw ?? (long.length > MAX_SUMMARY ? long.slice(0, MAX_SUMMARY) : long);
  const summary = composeOperatorAssistantMemorySummaryForStorage(outcome, supplementary, MAX_SUMMARY);

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
      outcome,
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

  const outcome = trimToMax(o.outcome, MAX_OUTCOME);
  if (!outcome) return { ok: false, reason: "outcome is required" };

  const fromFull = trimToMax(o.fullContent, MAX_FULL);
  const fromSumm = trimToMax(o.summary, MAX_SUMMARY);
  const long = fromFull ?? fromSumm;
  if (!long) return { ok: false, reason: "summary or fullContent is required" };

  const supplementary = fromSumm ?? (long.length > MAX_SUMMARY ? long.slice(0, MAX_SUMMARY) : long);
  const summaryWire =
    supplementary.length > MAX_SUMMARY ? supplementary.slice(0, MAX_SUMMARY) : supplementary;
  const fullContent = fromFull ?? long;
  if (!fullContent.trim()) {
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
      outcome,
      summary: summaryWire,
      fullContent: fullContent.length > MAX_FULL ? fullContent.slice(0, MAX_FULL) : fullContent,
      weddingId: ms === "project" ? weddingId : null,
      personId: ms === "person" ? personId : null,
    },
  };
}
