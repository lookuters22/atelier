/**
 * Storage-backed resolution for compliance asset library keys (tenant-scoped bucket + exact object path).
 * Signed URLs are not attached to proposal objects — use `createComplianceAssetSignedUrlForOperator` only when serving a download.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  ComplianceAssetResolution,
  OrchestratorComplianceAssetLibraryKey,
  OrchestratorProposalCandidate,
} from "../../../../src/types/decisionContext.types.ts";

export const COMPLIANCE_ASSET_LIBRARY_BUCKET = "compliance_asset_library" as const;

const DEFAULT_OBJECT_FILENAMES: Record<OrchestratorComplianceAssetLibraryKey, string> = {
  public_liability_coi: "public_liability_coi.pdf",
  venue_security_compliance_packet: "venue_security_compliance_packet.pdf",
};

const SETTINGS_OVERRIDES_KEY = "v3_compliance_asset_overrides" as const;

export type ComplianceAssetStorageOverride = {
  bucket: string;
  path: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseOverrideForKey(
  settings: unknown,
  libraryKey: OrchestratorComplianceAssetLibraryKey,
): ComplianceAssetStorageOverride | null {
  if (!isRecord(settings)) return null;
  const raw = settings[SETTINGS_OVERRIDES_KEY];
  if (!isRecord(raw)) return null;
  const entry = raw[libraryKey];
  if (!isRecord(entry)) return null;
  const bucket = entry.bucket;
  const path = entry.path;
  if (typeof bucket !== "string" || bucket.trim().length === 0) return null;
  if (typeof path !== "string" || path.trim().length === 0) return null;
  return { bucket: bucket.trim(), path: path.trim() };
}

/** Default canonical object path (no settings override) — for replay/docs/tests. */
export function getCanonicalComplianceAssetObjectPath(
  photographerId: string,
  libraryKey: OrchestratorComplianceAssetLibraryKey,
): string {
  const fn = DEFAULT_OBJECT_FILENAMES[libraryKey];
  return `${photographerId}/${fn}`;
}

function resolveBucketAndPath(
  photographerId: string,
  libraryKey: OrchestratorComplianceAssetLibraryKey,
  settings: unknown,
): { storage_bucket: string; object_path: string } {
  const o = parseOverrideForKey(settings, libraryKey);
  if (o) {
    return { storage_bucket: o.bucket, object_path: o.path };
  }
  return {
    storage_bucket: COMPLIANCE_ASSET_LIBRARY_BUCKET,
    object_path: getCanonicalComplianceAssetObjectPath(photographerId, libraryKey),
  };
}

async function fetchPhotographerSettingsJson(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<unknown> {
  const { data, error } = await supabase
    .from("photographers")
    .select("settings")
    .eq("id", photographerId)
    .maybeSingle();
  if (error) throw new Error(`photographers.settings: ${error.message}`);
  const row = data as { settings: unknown } | null;
  return row?.settings ?? {};
}

/**
 * Verify existence by downloading the exact object path (no prefix / fuzzy list matching).
 */
async function objectExistsAtPath(
  supabase: SupabaseClient,
  bucket: string,
  objectPath: string,
): Promise<boolean> {
  const { error } = await supabase.storage.from(bucket).download(objectPath);
  if (!error) return true;
  const msg = (error as { message?: string }).message ?? String(error);
  const status = (error as { statusCode?: string }).statusCode;
  if (status === "404" || /not\s*found|404/i.test(msg)) return false;
  // Other errors: treat as not found for proposal enrichment (avoid blocking orchestrator on transient failures)
  console.warn(`[resolveComplianceAssetStorage] download check failed: ${bucket}/${objectPath}: ${msg}`);
  return false;
}

export async function resolveComplianceAssetStorage(
  supabase: SupabaseClient,
  photographerId: string,
  libraryKey: OrchestratorComplianceAssetLibraryKey,
): Promise<ComplianceAssetResolution> {
  const settings = await fetchPhotographerSettingsJson(supabase, photographerId);
  const { storage_bucket, object_path } = resolveBucketAndPath(photographerId, libraryKey, settings);
  const found = await objectExistsAtPath(supabase, storage_bucket, object_path);
  return {
    library_key: libraryKey,
    storage_bucket,
    object_path,
    found,
  };
}

/** Canonical bucket + object path for a library key (settings overrides applied; no existence check). */
export async function getComplianceAssetStorageTarget(
  supabase: SupabaseClient,
  photographerId: string,
  libraryKey: OrchestratorComplianceAssetLibraryKey,
): Promise<{ storage_bucket: string; object_path: string }> {
  const settings = await fetchPhotographerSettingsJson(supabase, photographerId);
  return resolveBucketAndPath(photographerId, libraryKey, settings);
}

function contentTypeForObjectPath(objectPath: string): string {
  const lower = objectPath.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

/**
 * Store an inbound file at the tenant canonical path (or settings override). Service-role clients
 * typically used from Edge; does not send WhatsApp or render UI.
 */
export async function uploadComplianceAssetToLibrary(
  supabase: SupabaseClient,
  photographerId: string,
  libraryKey: OrchestratorComplianceAssetLibraryKey,
  body: ArrayBuffer | Blob,
  options?: { contentType?: string; upsert?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { storage_bucket, object_path } = await getComplianceAssetStorageTarget(
    supabase,
    photographerId,
    libraryKey,
  );
  const blob = body instanceof Blob ? body : new Blob([body]);
  const contentType = options?.contentType ?? contentTypeForObjectPath(object_path);
  const { error } = await supabase.storage.from(storage_bucket).upload(object_path, blob, {
    upsert: options?.upsert ?? true,
    contentType,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function buildComplianceAssetAttachmentDescriptor(resolution: ComplianceAssetResolution): {
  bucket: string;
  path: string;
  filename: string;
  mimeGuess: string;
} {
  const segments = resolution.object_path.split("/").filter(Boolean);
  const filename = segments.length > 0 ? segments[segments.length - 1]! : resolution.object_path;
  const lower = filename.toLowerCase();
  let mimeGuess = "application/octet-stream";
  if (lower.endsWith(".pdf")) mimeGuess = "application/pdf";
  else if (lower.endsWith(".png")) mimeGuess = "image/png";
  else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) mimeGuess = "image/jpeg";
  return {
    bucket: resolution.storage_bucket,
    path: resolution.object_path,
    filename,
    mimeGuess,
  };
}

/** Short-lived signed URLs for operator download; not embedded on orchestrator proposals. */
export const DEFAULT_COMPLIANCE_ASSET_SIGNED_URL_TTL_SECONDS = 300;

/**
 * Narrow operator/download path only — do not merge result into orchestrator proposals or durable logs.
 */
export async function createComplianceAssetSignedUrlForOperator(
  supabase: SupabaseClient,
  params: { bucket: string; object_path: string },
  expiresInSeconds: number = DEFAULT_COMPLIANCE_ASSET_SIGNED_URL_TTL_SECONDS,
): Promise<{ signedUrl: string | null; error: string | null }> {
  const { data, error } = await supabase.storage
    .from(params.bucket)
    .createSignedUrl(params.object_path, expiresInSeconds);
  if (error) {
    return { signedUrl: null, error: error.message };
  }
  return { signedUrl: data?.signedUrl ?? null, error: null };
}

export async function enrichProposalsWithComplianceAssetResolution(
  supabase: SupabaseClient,
  photographerId: string,
  proposals: OrchestratorProposalCandidate[],
): Promise<OrchestratorProposalCandidate[]> {
  const cache = new Map<OrchestratorComplianceAssetLibraryKey, ComplianceAssetResolution>();
  const out: OrchestratorProposalCandidate[] = [];
  for (const p of proposals) {
    const key = p.compliance_asset_library_key;
    if (!key) {
      out.push(p);
      continue;
    }
    let resolution = cache.get(key);
    if (!resolution) {
      resolution = await resolveComplianceAssetStorage(supabase, photographerId, key);
      cache.set(key, resolution);
    }
    out.push({ ...p, compliance_asset_resolution: resolution });
  }
  return out;
}
