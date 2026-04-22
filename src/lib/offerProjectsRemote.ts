import type { Data } from "@measured/puck";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../types/database.types";
import type { OfferProjectRecord } from "./offerProjectsLocal";

function rowToRecord(row: Database["public"]["Tables"]["studio_offer_builder_projects"]["Row"]): OfferProjectRecord {
  return {
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
    data: row.puck_data as unknown as Data,
  };
}

export async function listOfferProjectsRemote(
  supabase: SupabaseClient<Database>,
  photographerId: string,
): Promise<OfferProjectRecord[]> {
  const { data, error } = await supabase
    .from("studio_offer_builder_projects")
    .select("id, name, puck_data, updated_at")
    .eq("photographer_id", photographerId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) =>
    rowToRecord(row as Database["public"]["Tables"]["studio_offer_builder_projects"]["Row"]),
  );
}

export async function getOfferProjectRemote(
  supabase: SupabaseClient<Database>,
  photographerId: string,
  id: string,
): Promise<OfferProjectRecord | undefined> {
  const { data, error } = await supabase
    .from("studio_offer_builder_projects")
    .select("id, name, puck_data, updated_at")
    .eq("photographer_id", photographerId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return undefined;
  return rowToRecord(data);
}

export async function upsertOfferProjectRemote(
  supabase: SupabaseClient<Database>,
  photographerId: string,
  project: OfferProjectRecord,
): Promise<void> {
  const payload: Database["public"]["Tables"]["studio_offer_builder_projects"]["Insert"] = {
    id: project.id,
    photographer_id: photographerId,
    name: project.name,
    puck_data: project.data as unknown as Json,
    updated_at: project.updatedAt,
  };

  const { error } = await supabase.from("studio_offer_builder_projects").upsert(payload, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

export async function deleteOfferProjectRemote(
  supabase: SupabaseClient<Database>,
  photographerId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("studio_offer_builder_projects")
    .delete()
    .eq("photographer_id", photographerId)
    .eq("id", id);

  if (error) throw new Error(error.message);
}
