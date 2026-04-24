/**
 * Validation for publication / usage / credit structured records (P13).
 * Confirm path only — no silent writes from chat.
 */
import type { OperatorAssistantProposedActionPublicationRightsRecord } from "../../../../src/types/operatorAssistantProposedAction.types.ts";
import type { InsertOperatorAssistantPublicationRightsBody } from "../../../../src/types/operatorAssistantProposedAction.types.ts";
import {
  isPublicationRightsEvidenceSource,
  isPublicationRightsPermissionStatus,
  isPublicationRightsUsageChannel,
  type PublicationRightsUsageChannel,
} from "../../../../src/types/projectPublicationRights.types.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_SUMMARY = 2000;
const MAX_ATTRIBUTION = 2000;
const MAX_EXCLUSION = 4000;

export type ValidatedPublicationRightsRecordPayload = InsertOperatorAssistantPublicationRightsBody;

function parseUuid(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  if (v == null || String(v).trim() === "") return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!UUID_RE.test(t)) return null;
  return t;
}

function parseChannels(raw: unknown): PublicationRightsUsageChannel[] | { error: string } {
  if (!Array.isArray(raw)) {
    return { error: "permittedUsageChannels must be an array" };
  }
  const out: PublicationRightsUsageChannel[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") {
      return { error: "permittedUsageChannels entries must be strings" };
    }
    const c = x.trim();
    if (!isPublicationRightsUsageChannel(c)) {
      return { error: `unknown usage channel: ${c}` };
    }
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

function coherentPermission(
  status: ValidatedPublicationRightsRecordPayload["permissionStatus"],
  channels: PublicationRightsUsageChannel[],
): string | null {
  if (status === "withheld_pending_client_approval" && channels.length > 0) {
    return "withheld_pending_client_approval requires permittedUsageChannels to be empty";
  }
  if (status === "permitted_narrow" && channels.length === 0) {
    return "permitted_narrow requires at least one permittedUsageChannels entry";
  }
  return null;
}

export function validateOperatorAssistantPublicationRightsPayload(
  raw: unknown,
):
  | { ok: true; value: ValidatedPublicationRightsRecordPayload }
  | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "payload must be an object" };
  }
  const o = raw as Record<string, unknown>;

  const weddingId = parseUuid(o, "weddingId");
  if (!weddingId) return { ok: false, error: "weddingId is required (valid UUID)" };

  const personId = parseUuid(o, "personId");
  const clientThreadId = parseUuid(o, "clientThreadId");

  const psRaw = o.permissionStatus ?? o.permission_status;
  if (typeof psRaw !== "string" || !isPublicationRightsPermissionStatus(psRaw.trim())) {
    return { ok: false, error: "permissionStatus must be a valid publication permission status" };
  }
  const permissionStatus = psRaw.trim() as ValidatedPublicationRightsRecordPayload["permissionStatus"];

  const ch = parseChannels(o.permittedUsageChannels ?? o.permitted_usage_channels);
  if ("error" in ch) {
    return { ok: false, error: ch.error };
  }

  const shapeErr = coherentPermission(permissionStatus, ch);
  if (shapeErr) return { ok: false, error: shapeErr };

  const arRaw = o.attributionRequired ?? o.attribution_required;
  if (typeof arRaw !== "boolean") {
    return { ok: false, error: "attributionRequired must be a boolean" };
  }
  const attributionRequired = arRaw;

  let attributionDetail: string | null = null;
  const adRaw = o.attributionDetail ?? o.attribution_detail;
  if (adRaw != null && String(adRaw).trim() !== "") {
    if (typeof adRaw !== "string") {
      return { ok: false, error: "attributionDetail must be a string" };
    }
    const t = adRaw.trim();
    attributionDetail = t.length > MAX_ATTRIBUTION ? t.slice(0, MAX_ATTRIBUTION) : t;
  }

  let exclusionNotes: string | null = null;
  const exRaw = o.exclusionNotes ?? o.exclusion_notes;
  if (exRaw != null && String(exRaw).trim() !== "") {
    if (typeof exRaw !== "string") {
      return { ok: false, error: "exclusionNotes must be a string" };
    }
    const t = exRaw.trim();
    exclusionNotes = t.length > MAX_EXCLUSION ? t.slice(0, MAX_EXCLUSION) : t;
  }

  let validUntil: string | null = null;
  const vuRaw = o.validUntil ?? o.valid_until;
  if (vuRaw != null && String(vuRaw).trim() !== "") {
    if (typeof vuRaw !== "string") {
      return { ok: false, error: "validUntil must be a string YYYY-MM-DD" };
    }
    const vu = vuRaw.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vu)) {
      return { ok: false, error: "validUntil must be YYYY-MM-DD" };
    }
    const [yy, mm, dd] = vu.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(Date.UTC(yy, mm - 1, dd));
    if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) {
      return { ok: false, error: "validUntil is not a valid calendar date" };
    }
    validUntil = vu;
  }

  const evRaw = o.evidenceSource ?? o.evidence_source;
  if (typeof evRaw !== "string" || !isPublicationRightsEvidenceSource(evRaw.trim())) {
    return { ok: false, error: "evidenceSource must be client_email_thread, signed_release, or verbal_operator_confirmed" };
  }
  const evidenceSource = evRaw.trim() as ValidatedPublicationRightsRecordPayload["evidenceSource"];

  const summaryRaw = o.operatorConfirmationSummary ?? o.operator_confirmation_summary;
  if (typeof summaryRaw !== "string" || summaryRaw.trim().length < 8) {
    return { ok: false, error: "operatorConfirmationSummary is required (min 8 chars)" };
  }
  const operatorConfirmationSummary = summaryRaw.trim().slice(0, MAX_SUMMARY);

  return {
    ok: true,
    value: {
      weddingId,
      personId,
      clientThreadId,
      permissionStatus,
      permittedUsageChannels: ch,
      attributionRequired,
      attributionDetail,
      exclusionNotes,
      validUntil,
      evidenceSource,
      operatorConfirmationSummary,
    },
  };
}

export function tryParseLlmProposedPublicationRightsRecord(
  item: unknown,
):
  | { ok: true; value: OperatorAssistantProposedActionPublicationRightsRecord }
  | { ok: false; reason: string } {
  if (item == null || typeof item !== "object") {
    return { ok: false, reason: "not an object" };
  }
  if ((item as { kind?: unknown }).kind !== "publication_rights_record") {
    return { ok: false, reason: "not publication_rights_record" };
  }
  const v = validateOperatorAssistantPublicationRightsPayload(item);
  if (!v.ok) {
    return { ok: false, reason: v.error };
  }
  return {
    ok: true,
    value: { kind: "publication_rights_record", ...v.value },
  };
}
