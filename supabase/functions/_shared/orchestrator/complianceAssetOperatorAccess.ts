/**
 * Runtime-only operator access to compliance library objects: metadata + short-lived signed URL.
 * Does not attach URLs to orchestrator proposals or escalation payloads — use at API/tool boundaries only.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { OrchestratorComplianceAssetLibraryKey } from "../../../../src/types/decisionContext.types.ts";
import {
  buildComplianceAssetAttachmentDescriptor,
  createComplianceAssetSignedUrlForOperator,
  DEFAULT_COMPLIANCE_ASSET_SIGNED_URL_TTL_SECONDS,
  resolveComplianceAssetStorage,
} from "./resolveComplianceAssetStorage.ts";

const KNOWN_KEYS = new Set<OrchestratorComplianceAssetLibraryKey>([
  "public_liability_coi",
  "venue_security_compliance_packet",
]);

export function parseOrchestratorComplianceAssetLibraryKey(
  raw: unknown,
): OrchestratorComplianceAssetLibraryKey | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (t === "public_liability_coi" || t === "venue_security_compliance_packet") return t;
  return null;
}

export function isOrchestratorComplianceAssetLibraryKey(
  s: string,
): s is OrchestratorComplianceAssetLibraryKey {
  return KNOWN_KEYS.has(s as OrchestratorComplianceAssetLibraryKey);
}

export type ComplianceAssetOperatorDownloadOk = {
  ok: true;
  library_key: OrchestratorComplianceAssetLibraryKey;
  storage_bucket: string;
  object_path: string;
  filename: string;
  mime_guess: string;
  signed_url: string;
  expires_in_seconds: number;
  expires_at: string;
};

export type ComplianceAssetOperatorDownloadErr =
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "signed_url_failed"; error: string };

export type PrepareComplianceAssetOperatorDownloadResult =
  | ComplianceAssetOperatorDownloadOk
  | ComplianceAssetOperatorDownloadErr;

/**
 * Re-resolves Storage (exact path, `found` bit), then issues a signed GET URL. No proposal mutation.
 */
export async function prepareComplianceAssetOperatorDownload(
  supabase: SupabaseClient,
  photographerId: string,
  libraryKey: OrchestratorComplianceAssetLibraryKey,
  options?: { expiresInSeconds?: number },
): Promise<PrepareComplianceAssetOperatorDownloadResult> {
  const resolution = await resolveComplianceAssetStorage(supabase, photographerId, libraryKey);
  if (!resolution.found) {
    return { ok: false, reason: "not_found" };
  }

  const desc = buildComplianceAssetAttachmentDescriptor(resolution);
  const expiresInSeconds = options?.expiresInSeconds ?? DEFAULT_COMPLIANCE_ASSET_SIGNED_URL_TTL_SECONDS;
  const signed = await createComplianceAssetSignedUrlForOperator(
    supabase,
    { bucket: desc.bucket, object_path: desc.path },
    expiresInSeconds,
  );
  if (!signed.signedUrl?.trim()) {
    return { ok: false, reason: "signed_url_failed", error: signed.error ?? "no_signed_url" };
  }

  const expires_at = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  return {
    ok: true,
    library_key: resolution.library_key,
    storage_bucket: resolution.storage_bucket,
    object_path: resolution.object_path,
    filename: desc.filename,
    mime_guess: desc.mimeGuess,
    signed_url: signed.signedUrl.trim(),
    expires_in_seconds: expiresInSeconds,
    expires_at,
  };
}
