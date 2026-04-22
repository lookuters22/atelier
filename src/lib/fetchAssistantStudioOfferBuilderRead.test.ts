import { describe, expect, it } from "vitest";
import { fetchAssistantStudioOfferBuilderRead, MAX_OFFER_BUILDER_PROJECTS_IN_CONTEXT } from "./fetchAssistantStudioOfferBuilderRead.ts";
import type { Database } from "../types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("fetchAssistantStudioOfferBuilderRead", () => {
  it("returns tenant-bounded project rows with compactSummary (no raw puck_data in return)", async () => {
    const supabase = {
      from: (table: string) => {
        expect(table).toBe("studio_offer_builder_projects");
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: (n: number) => {
                  expect(n).toBe(MAX_OFFER_BUILDER_PROJECTS_IN_CONTEXT);
                  return Promise.resolve({
                    data: [
                      {
                        id: "a0eebc99-9c0b-4ef8-8bb3-000000000001",
                        name: "  Premium  ",
                        updated_at: "2026-01-15T00:00:00.000Z",
                        puck_data: { root: { props: { title: "P" } }, content: [] },
                      },
                    ],
                    error: null,
                  });
                },
              }),
            }),
          }),
        };
      },
    } as SupabaseClient<Database>;

    const r = await fetchAssistantStudioOfferBuilderRead(supabase, "photo-1");
    expect(r.totalListed).toBe(1);
    expect(r.truncated).toBe(false);
    expect(r.projects[0]!.id).toBe("a0eebc99-9c0b-4ef8-8bb3-000000000001");
    expect(r.projects[0]!.displayName).toBe("Premium");
    expect("puck_data" in r.projects[0]!).toBe(false);
  });
});
