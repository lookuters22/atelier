/**
 * Bounded read of `studio_offer_builder_projects` for operator Ana (tenant-scoped, read-only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Data } from "@measured/puck";
import type { Database } from "../types/database.types";
import type { AssistantStudioOfferBuilderRead } from "../types/assistantContext.types.ts";
import { summarizeOfferPuckDataForAssistant } from "./offerPuckAssistantSummary.ts";

export const MAX_OFFER_BUILDER_PROJECTS_IN_CONTEXT = 20;

const NOTE =
  "Summaries are derived from stored Puck `puck_data` (outline and package names only) — not a full PDF or client-facing render. For one offer, use `operator_lookup_offer_builder` with the **offerProjectId** (UUID) from this list if you need a longer outline.";

export async function fetchAssistantStudioOfferBuilderRead(
  supabase: SupabaseClient<Database>,
  photographerId: string,
): Promise<AssistantStudioOfferBuilderRead> {
  const { data, error } = await supabase
    .from("studio_offer_builder_projects")
    .select("id, name, puck_data, updated_at")
    .eq("photographer_id", photographerId)
    .order("updated_at", { ascending: false })
    .limit(MAX_OFFER_BUILDER_PROJECTS_IN_CONTEXT);

  if (error) {
    throw new Error(`fetchAssistantStudioOfferBuilderRead: ${error.message}`);
  }

  const rows = data ?? [];
  const projects = rows.map((row) => ({
    id: String(row.id),
    displayName: String(row.name ?? "").trim() || "Untitled offer",
    updatedAt: String(row.updated_at),
    compactSummary: summarizeOfferPuckDataForAssistant(row.puck_data as unknown as Data),
  }));

  return {
    projects,
    totalListed: projects.length,
    truncated: projects.length >= MAX_OFFER_BUILDER_PROJECTS_IN_CONTEXT,
    note: NOTE,
  };
}
