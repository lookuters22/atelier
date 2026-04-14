/**
 * G5: One active `gmail_label_import_groups` row per (photographer, account, Gmail label id).
 * `pending` = staging; `approving` = grouped approval worker in progress (blocks duplicate staging).
 * After a group is approved/dismissed/failed, the next sync creates a fresh pending group.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function ensurePendingGmailLabelImportGroup(
  supabase: SupabaseClient,
  opts: {
    photographerId: string;
    connectedAccountId: string;
    sourceIdentifier: string;
    sourceLabelName: string;
  },
): Promise<string> {
  const { photographerId, connectedAccountId, sourceIdentifier, sourceLabelName } = opts;

  const { data: existing, error: findErr } = await supabase
    .from("gmail_label_import_groups")
    .select("id, status")
    .eq("photographer_id", photographerId)
    .eq("connected_account_id", connectedAccountId)
    .eq("source_identifier", sourceIdentifier)
    .in("status", ["pending", "approving"])
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);

  if (existing?.status === "approving") {
    throw new Error("gmail_label_group_approval_in_progress");
  }

  if (existing?.id) return existing.id as string;

  const now = new Date().toISOString();
  const { data: ins, error: insErr } = await supabase
    .from("gmail_label_import_groups")
    .insert({
      photographer_id: photographerId,
      connected_account_id: connectedAccountId,
      source_identifier: sourceIdentifier,
      source_label_name: sourceLabelName,
      status: "pending",
      updated_at: now,
    })
    .select("id")
    .single();

  if (insErr || !ins?.id) {
    throw new Error(insErr?.message ?? "gmail_label_import_groups insert failed");
  }
  return ins.id as string;
}
