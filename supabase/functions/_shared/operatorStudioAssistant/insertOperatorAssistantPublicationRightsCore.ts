/**
 * Service-role insert into `project_publication_rights` (P13). Operator confirm only.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../src/types/database.types.ts";
import type { ValidatedPublicationRightsRecordPayload } from "./validateOperatorAssistantPublicationRightsPayload.ts";
import { recordOperatorAssistantWriteAudit } from "./recordOperatorAssistantWriteAudit.ts";

export async function insertPublicationRightsRecordForOperatorAssistant(
  supabase: SupabaseClient,
  photographerId: string,
  body: ValidatedPublicationRightsRecordPayload,
): Promise<{ id: string; auditId: string }> {
  const { data: w, error: werr } = await supabase
    .from("weddings")
    .select("id")
    .eq("id", body.weddingId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (werr) {
    throw new Error(`wedding verify failed: ${werr.message}`);
  }
  if (!w?.id) {
    throw new Error("wedding not found for tenant");
  }

  if (body.personId) {
    const { data: p, error: perr } = await supabase
      .from("people")
      .select("id")
      .eq("id", body.personId)
      .eq("photographer_id", photographerId)
      .maybeSingle();
    if (perr) {
      throw new Error(`person verify failed: ${perr.message}`);
    }
    if (!p?.id) {
      throw new Error("person not found for tenant");
    }
  }

  if (body.clientThreadId) {
    const { data: t, error: terr } = await supabase
      .from("threads")
      .select("id, wedding_id")
      .eq("id", body.clientThreadId)
      .eq("photographer_id", photographerId)
      .maybeSingle();
    if (terr) {
      throw new Error(`thread verify failed: ${terr.message}`);
    }
    if (!t?.id) {
      throw new Error("thread not found for tenant");
    }
    const tw = (t as { wedding_id?: string | null }).wedding_id;
    if (tw != null && tw !== body.weddingId) {
      throw new Error("thread is linked to a different project than weddingId");
    }
  }

  const insertRow: Database["public"]["Tables"]["project_publication_rights"]["Insert"] = {
    photographer_id: photographerId,
    wedding_id: body.weddingId,
    person_id: body.personId ?? null,
    thread_id: body.clientThreadId ?? null,
    permission_status: body.permissionStatus,
    permitted_usage_channels: body.permittedUsageChannels,
    attribution_required: body.attributionRequired,
    attribution_detail: body.attributionDetail ?? null,
    exclusion_notes: body.exclusionNotes ?? null,
    valid_until: body.validUntil ?? null,
    evidence_source: body.evidenceSource,
    operator_confirmation_summary: body.operatorConfirmationSummary,
  };

  const { data: row, error: insErr } = await supabase
    .from("project_publication_rights")
    .insert(insertRow)
    .select("id")
    .single();

  if (insErr) {
    throw new Error(insErr.message);
  }
  if (!row?.id) {
    throw new Error("insert did not return id");
  }
  const id = String(row.id);

  const { auditId } = await recordOperatorAssistantWriteAudit(supabase, photographerId, {
    operation: "publication_rights_record_create",
    entityTable: "project_publication_rights",
    entityId: id,
    detail: {
      weddingId: body.weddingId,
      permissionStatus: body.permissionStatus,
      channels: body.permittedUsageChannels,
      evidenceSource: body.evidenceSource,
    },
  });

  return { id, auditId };
}
