/**
 * Photographer-scoped pending state: which compliance library key we asked the operator to collect
 * via WhatsApp. Used by the operator WhatsApp webhook to route the **first** inbound attachment only
 * (see `complianceAssetWhatsAppIngest.ts`) — upload routing uses `library_key` + canonical storage rules;
 * `source_thread_id` / `wedding_id` are observability + future thread-aware matching.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  OrchestratorComplianceAssetLibraryKey,
  OrchestratorProposalCandidate,
} from "../../../../src/types/decisionContext.types.ts";
import {
  V3_COMPLIANCE_ASSET_LIBRARY_MISSING_COLLECT_ACTION_KEY,
} from "./complianceAssetMissingCapture.ts";

export const V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY =
  "v3_compliance_whatsapp_pending_collect" as const;

export type ComplianceWhatsAppPendingCollectV1 = {
  library_key: OrchestratorComplianceAssetLibraryKey;
  /** ISO-8601 timestamp when pending was written. */
  set_at: string;
  /** Client/email thread that triggered the missing-collect proposal (observability; not used for upload path today). */
  source_thread_id: string | null;
  /** Wedding scope for the thread above when present. */
  wedding_id: string | null;
};

const LIBRARY_KEYS: ReadonlySet<string> = new Set<OrchestratorComplianceAssetLibraryKey>([
  "public_liability_coi",
  "venue_security_compliance_packet",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseLibraryKey(raw: unknown): OrchestratorComplianceAssetLibraryKey | null {
  if (typeof raw !== "string" || !LIBRARY_KEYS.has(raw)) return null;
  return raw as OrchestratorComplianceAssetLibraryKey;
}

/**
 * Read pending collect state from merged `photographers.settings` JSON.
 */
export function parseComplianceWhatsAppPendingCollect(
  settings: unknown,
): ComplianceWhatsAppPendingCollectV1 | null {
  if (!isRecord(settings)) return null;
  const raw = settings[V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY];
  if (!isRecord(raw)) return null;
  const library_key = parseLibraryKey(raw.library_key);
  if (!library_key) return null;
  const set_at = typeof raw.set_at === "string" && raw.set_at.trim() ? raw.set_at.trim() : "";
  if (!set_at) return null;
  const source_thread_id =
    typeof raw.source_thread_id === "string" ? raw.source_thread_id.trim() || null : null;
  const wedding_id = typeof raw.wedding_id === "string" ? raw.wedding_id.trim() || null : null;
  return { library_key, set_at, source_thread_id, wedding_id };
}

/**
 * First `v3_compliance_asset_library_missing_collect` proposal wins (deterministic).
 */
export function extractMissingCollectLibraryKeyFromProposals(
  proposals: OrchestratorProposalCandidate[],
): OrchestratorComplianceAssetLibraryKey | null {
  for (const p of proposals) {
    if (p.action_key !== V3_COMPLIANCE_ASSET_LIBRARY_MISSING_COLLECT_ACTION_KEY) continue;
    const fromProposal = p.compliance_asset_library_key;
    if (fromProposal) return fromProposal;
    const fromRes = p.compliance_asset_resolution?.library_key;
    if (fromRes) return fromRes;
  }
  return null;
}

/**
 * When the current run includes a `v3_compliance_asset_library_missing_collect` proposal, upserts
 * `v3_compliance_whatsapp_pending_collect` (one slot per photographer; overwrites prior pending).
 *
 * **Does not clear** pending when this run has no missing-collect proposal — unrelated threads for the
 * same photographer would otherwise erase an active collect before WhatsApp ingestion. Pending is cleared
 * only by successful webhook ingestion (`clearComplianceWhatsAppPendingCollect`) or other explicit clears.
 */
export async function syncComplianceWhatsAppPendingCollectState(
  supabase: SupabaseClient,
  photographerId: string,
  params: {
    weddingId: string | null | undefined;
    threadId: string | null | undefined;
    proposals: OrchestratorProposalCandidate[];
  },
): Promise<{ action: "set" | "noop"; library_key?: string }> {
  const key = extractMissingCollectLibraryKeyFromProposals(params.proposals);
  if (!key) {
    return { action: "noop" };
  }

  const { data: row, error: selErr } = await supabase
    .from("photographers")
    .select("settings")
    .eq("id", photographerId)
    .maybeSingle();
  if (selErr) throw new Error(`syncComplianceWhatsAppPendingCollectState: ${selErr.message}`);

  const prev = (row as { settings?: unknown } | null)?.settings ?? {};
  const settings = { ...(typeof prev === "object" && prev !== null && !Array.isArray(prev) ? prev : {}) } as Record<
    string,
    unknown
  >;

  const payload: ComplianceWhatsAppPendingCollectV1 = {
    library_key: key,
    set_at: new Date().toISOString(),
    source_thread_id: params.threadId?.trim() ? params.threadId.trim() : null,
    wedding_id: params.weddingId?.trim() ? params.weddingId.trim() : null,
  };
  settings[V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY] = payload;
  const { error: upErr } = await supabase
    .from("photographers")
    .update({ settings })
    .eq("id", photographerId);
  if (upErr) throw new Error(`syncComplianceWhatsAppPendingCollectState set: ${upErr.message}`);
  return { action: "set", library_key: key };
}

/**
 * Removes pending collect after a successful library upload (or manual clear).
 */
export async function clearComplianceWhatsAppPendingCollect(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<void> {
  const { data: row, error: selErr } = await supabase
    .from("photographers")
    .select("settings")
    .eq("id", photographerId)
    .maybeSingle();
  if (selErr) throw new Error(`clearComplianceWhatsAppPendingCollect: ${selErr.message}`);
  const prev = (row as { settings?: unknown } | null)?.settings ?? {};
  const settings = { ...(typeof prev === "object" && prev !== null && !Array.isArray(prev) ? prev : {}) } as Record<
    string,
    unknown
  >;
  if (settings[V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY] === undefined) return;
  delete settings[V3_COMPLIANCE_WHATSAPP_PENDING_COLLECT_SETTINGS_KEY];
  const { error: upErr } = await supabase.from("photographers").update({ settings }).eq("id", photographerId);
  if (upErr) throw new Error(`clearComplianceWhatsAppPendingCollect: ${upErr.message}`);
}
