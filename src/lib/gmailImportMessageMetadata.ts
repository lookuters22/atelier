import type { SupabaseClient } from "@supabase/supabase-js";

/** Latest message `messages.metadata.gmail_import.body_html_sanitized` from approved Gmail imports. */
export function parseGmailImportBodyHtmlSanitized(messageMetadata: unknown): string | null {
  if (!messageMetadata || typeof messageMetadata !== "object") return null;
  const gi = (messageMetadata as Record<string, unknown>).gmail_import;
  if (!gi || typeof gi !== "object") return null;
  const h = (gi as Record<string, unknown>).body_html_sanitized;
  return typeof h === "string" && h.trim().length > 0 ? h : null;
}

/** G3: compact pointer when HTML lives in Storage (`gmail_render_artifacts`). */
export type GmailImportRenderHtmlRefV1 = {
  version: 1;
  artifact_id: string;
  storage_bucket: string;
  storage_path: string;
  byte_size: number;
};

export function parseGmailImportRenderHtmlRef(messageMetadata: unknown): GmailImportRenderHtmlRefV1 | null {
  if (!messageMetadata || typeof messageMetadata !== "object") return null;
  const gi = (messageMetadata as Record<string, unknown>).gmail_import;
  if (!gi || typeof gi !== "object") return null;
  const r = (gi as Record<string, unknown>).render_html_ref;
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (o.version !== 1) return null;
  const aid = o.artifact_id;
  const bucket = o.storage_bucket;
  const path = o.storage_path;
  if (typeof aid !== "string" || !aid || typeof bucket !== "string" || typeof path !== "string") {
    return null;
  }
  return {
    version: 1,
    artifact_id: aid,
    storage_bucket: bucket,
    storage_path: path,
    byte_size: typeof o.byte_size === "number" ? o.byte_size : 0,
  };
}

/** Load sanitized HTML for Inbox when only `render_html_ref` is present (G3). */
export async function fetchGmailImportHtmlForDisplay(
  supabase: SupabaseClient,
  ref: GmailImportRenderHtmlRefV1,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(ref.storage_bucket)
    .createSignedUrl(ref.storage_path, 600);
  if (error || !data?.signedUrl) return null;
  const res = await fetch(data.signedUrl);
  if (!res.ok) return null;
  const text = await res.text();
  return text.trim().length > 0 ? text : null;
}

/** G6 durable render summary (`messages.metadata.gmail_import.durable_render`) — optional; safe if absent. */
export type GmailImportDurableRenderSummary = {
  version: 1;
  strategy: string;
  self_contained: boolean;
  remaining_remote_categories: string[];
  g3_migration_hint?: string;
};

export function parseGmailImportDurableRender(messageMetadata: unknown): GmailImportDurableRenderSummary | null {
  if (!messageMetadata || typeof messageMetadata !== "object") return null;
  const gi = (messageMetadata as Record<string, unknown>).gmail_import;
  if (!gi || typeof gi !== "object") return null;
  const dr = (gi as Record<string, unknown>).durable_render;
  if (!dr || typeof dr !== "object") return null;
  const o = dr as Record<string, unknown>;
  if (o.version !== 1) return null;
  const cats = o.remaining_remote_categories;
  return {
    version: 1,
    strategy: typeof o.strategy === "string" ? o.strategy : "unknown",
    self_contained: Boolean(o.self_contained),
    remaining_remote_categories: Array.isArray(cats) ? cats.map(String) : [],
    g3_migration_hint: typeof o.g3_migration_hint === "string" ? o.g3_migration_hint : undefined,
  };
}
