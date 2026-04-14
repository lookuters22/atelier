/**
 * V1 materialization artifact shape for `import_candidates.materialization_artifact`.
 * Kept in a module without `supabase` so Vitest can import the type guard without Deno.
 */
import type { StagedImportAttachmentRef } from "./gmailStageImportCandidateAttachments.ts";

export type GmailMaterializationArtifactV1 = {
  version: 1;
  body: string;
  metadata: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  gmail_message_id: string | null;
  staged_attachments: StagedImportAttachmentRef[];
};

export function isGmailMaterializationArtifactV1(x: unknown): x is GmailMaterializationArtifactV1 {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return o.version === 1 && typeof o.body === "string" && o.metadata !== undefined;
}
