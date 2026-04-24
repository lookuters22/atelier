/**
 * Validation for memory_note proposals + confirm path. `project` | `person` | `studio` — CHECK-safe.
 */
import {
  isOperatorAssistantMemoryProposalOrigin,
  isOperatorMemoryAudienceSourceTier,
  isOperatorMemoryCaptureChannel,
  type InsertOperatorAssistantMemoryBody,
  type OperatorAssistantMemoryProposalOrigin,
  type OperatorAssistantProposedActionMemoryNote,
  type OperatorMemoryAudienceSourceTier,
  type OperatorMemoryCaptureChannel,
} from "../../../../src/types/operatorAssistantProposedAction.types.ts";
import type { Database } from "../../../../src/types/database.types.ts";
import {
  composeOperatorAssistantMemorySummaryForStorage,
  MAX_OPERATOR_MEMORY_OUTCOME_CHARS,
} from "../../../../src/lib/composeOperatorAssistantMemorySummary.ts";
import { shouldRedactSensitiveDocumentPatternsForModelContext } from "../memory/redactSensitiveDocumentPatternsForModelContext.ts";

const MAX_TITLE = 120;
const MAX_SUMMARY = 400;
const MAX_FULL = 8000;
const MAX_OUTCOME = MAX_OPERATOR_MEMORY_OUTCOME_CHARS;

/** RFC-4122-style UUID check (version nibble 1–5, variant 8/9/a/b) — same as other operator-assistant validators. */
const MEMORY_SCOPE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Post-validation row payload: `summary` is composed for `memories.summary` (header consumers). */
export type ValidatedOperatorAssistantMemoryPayload = Omit<InsertOperatorAssistantMemoryBody, "summary"> & {
  memoryScope: Database["public"]["Enums"]["memory_scope"];
  summary: string;
  audienceSourceTier: OperatorMemoryAudienceSourceTier;
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
  const t = v.trim();
  if (!MEMORY_SCOPE_UUID_RE.test(t)) return null;
  return t;
}

function parseCaptureFields(o: Record<string, unknown>): {
  captureChannel: OperatorMemoryCaptureChannel | null;
  captureOccurredOn: string | null;
} | { error: string } {
  let captureChannel: OperatorMemoryCaptureChannel | null = null;
  const ccRaw = o.captureChannel;
  if (ccRaw != null && String(ccRaw).trim() !== "") {
    if (typeof ccRaw !== "string") {
      return { error: "captureChannel must be a string" };
    }
    const cct = ccRaw.trim();
    if (!isOperatorMemoryCaptureChannel(cct)) {
      return {
        error:
          "captureChannel must be one of: phone, video_call, in_person, whatsapp, instagram_dm, other",
      };
    }
    captureChannel = cct;
  }

  let captureOccurredOn: string | null = null;
  const coRaw = o.captureOccurredOn;
  if (coRaw != null && String(coRaw).trim() !== "") {
    if (typeof coRaw !== "string") {
      return { error: "captureOccurredOn must be a string" };
    }
    const cot = coRaw.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cot)) {
      return { error: "captureOccurredOn must be YYYY-MM-DD" };
    }
    const [yy, mm, dd] = cot.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(Date.UTC(yy, mm - 1, dd));
    if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) {
      return { error: "captureOccurredOn is not a valid calendar date" };
    }
    captureOccurredOn = cot;
  }

  if (captureOccurredOn != null && captureChannel == null) {
    return { error: "captureOccurredOn requires captureChannel" };
  }

  return { captureChannel, captureOccurredOn };
}

function parseProposalOriginField(
  o: Record<string, unknown>,
): OperatorAssistantMemoryProposalOrigin | { error: string } {
  const raw = o.proposalOrigin;
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) {
    return { error: "proposalOrigin is required" };
  }
  if (typeof raw !== "string") {
    return { error: "proposalOrigin must be a string" };
  }
  const t = raw.trim();
  if (!isOperatorAssistantMemoryProposalOrigin(t)) {
    return {
      error:
        "proposalOrigin must be operator_typed, assistant_proposed_confirmed, or assistant_proposed_edited",
    };
  }
  return t;
}

function parseAudienceSourceTierField(
  o: Record<string, unknown>,
): OperatorMemoryAudienceSourceTier | { error: string } {
  const raw = o.audienceSourceTier;
  if (raw == null || String(raw).trim() === "") {
    return "client_visible";
  }
  if (typeof raw !== "string") {
    return { error: "audienceSourceTier must be a string" };
  }
  const t = raw.trim();
  if (!isOperatorMemoryAudienceSourceTier(t)) {
    return {
      error: "audienceSourceTier must be client_visible, internal_team, or operator_only",
    };
  }
  return t;
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

  const proposalOrigin = parseProposalOriginField(o);
  if (typeof proposalOrigin !== "string") {
    return { ok: false, error: proposalOrigin.error };
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
  const sensitiveProbe = [title, outcome, long, summaryRaw ?? ""].join("\n");
  if (shouldRedactSensitiveDocumentPatternsForModelContext(sensitiveProbe)) {
    return {
      ok: false,
      error:
        "Memory text may include passport/ID/payment identifiers. Remove or generalize those details before saving (do not store raw document or payment numbers).",
    };
  }
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

  const cap = parseCaptureFields(o);
  if ("error" in cap) {
    return { ok: false, error: cap.error };
  }

  const audienceTier = parseAudienceSourceTierField(o);
  if (typeof audienceTier !== "string") {
    return { ok: false, error: audienceTier.error };
  }

  return {
    ok: true,
    value: {
      proposalOrigin,
      memoryScope: ms,
      title,
      outcome,
      summary,
      fullContent: long,
      weddingId: ms === "project" ? weddingId : null,
      personId: ms === "person" ? personId : null,
      captureChannel: cap.captureChannel,
      captureOccurredOn: cap.captureOccurredOn,
      audienceSourceTier: audienceTier,
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

  const cap = parseCaptureFields(o);
  if ("error" in cap) {
    return { ok: false, reason: cap.error };
  }

  const astRaw = o.audienceSourceTier;
  let audienceSourceTier: OperatorMemoryAudienceSourceTier | undefined;
  if (astRaw != null && String(astRaw).trim() !== "") {
    if (typeof astRaw !== "string") {
      return { ok: false, reason: "audienceSourceTier must be a string" };
    }
    const ast = astRaw.trim();
    if (!isOperatorMemoryAudienceSourceTier(ast)) {
      return {
        ok: false,
        reason: "audienceSourceTier must be client_visible, internal_team, or operator_only",
      };
    }
    audienceSourceTier = ast;
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
      ...(cap.captureChannel != null ? { captureChannel: cap.captureChannel } : {}),
      ...(cap.captureOccurredOn != null ? { captureOccurredOn: cap.captureOccurredOn } : {}),
      ...(audienceSourceTier != null ? { audienceSourceTier } : {}),
    },
  };
}
