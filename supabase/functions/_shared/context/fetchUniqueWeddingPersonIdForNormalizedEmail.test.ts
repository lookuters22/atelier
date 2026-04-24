import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fetchUniqueWeddingPersonIdForNormalizedEmail } from "./fetchUniqueWeddingPersonIdForNormalizedEmail.ts";

function contactPointsClient(
  responses: Array<{ data: { person_id: string; value_normalized: string }[]; error: null }>,
): SupabaseClient {
  let call = 0;
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            in: () => {
              const r = responses[call] ?? { data: [], error: null };
              call++;
              return Promise.resolve(r);
            },
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("fetchUniqueWeddingPersonIdForNormalizedEmail", () => {
  it("returns the only distinct person_id", async () => {
    const supabase = contactPointsClient([
      { data: [{ person_id: "a", value_normalized: "x@y.com" }], error: null },
    ]);
    const r = await fetchUniqueWeddingPersonIdForNormalizedEmail(supabase, "photo1", "x@y.com", ["a"]);
    expect(r).toBe("a");
  });

  it("P17: Gmail alias inbound matches stored jane.doe contact point", async () => {
    const supabase = contactPointsClient([
      {
        data: [{ person_id: "bride-1", value_normalized: "jane.doe@gmail.com" }],
        error: null,
      },
    ]);
    const r = await fetchUniqueWeddingPersonIdForNormalizedEmail(
      supabase,
      "photo1",
      "janedoe+planner@gmail.com",
      ["bride-1"],
    );
    expect(r).toBe("bride-1");
  });

  it("returns null when two distinct persons match", async () => {
    const supabase = contactPointsClient([
      {
        data: [
          { person_id: "a", value_normalized: "shared@y.com" },
          { person_id: "b", value_normalized: "shared@y.com" },
        ],
        error: null,
      },
    ]);
    const r = await fetchUniqueWeddingPersonIdForNormalizedEmail(
      supabase,
      "photo1",
      "shared@y.com",
      ["a", "b"],
    );
    expect(r).toBeNull();
  });

  it("returns null when no rows", async () => {
    const supabase = contactPointsClient([{ data: [], error: null }]);
    const r = await fetchUniqueWeddingPersonIdForNormalizedEmail(supabase, "p", "e@e.com", ["z"]);
    expect(r).toBeNull();
  });

  it("merges chunks and returns null if distinct count exceeds one", async () => {
    const ids = Array.from({ length: 121 }, (_, i) => `p${i}`);
    const supabase = contactPointsClient([
      { data: [{ person_id: "p0", value_normalized: "x@y.com" }], error: null },
      { data: [{ person_id: "p1", value_normalized: "x@y.com" }], error: null },
    ]);
    const r = await fetchUniqueWeddingPersonIdForNormalizedEmail(supabase, "photo1", "x@y.com", ids);
    expect(r).toBeNull();
  });

  it("merges chunks and returns single id when same person in both chunks", async () => {
    const ids = Array.from({ length: 121 }, (_, i) => `p${i}`);
    const supabase = contactPointsClient([
      { data: [{ person_id: "p0", value_normalized: "x@y.com" }], error: null },
      { data: [{ person_id: "p0", value_normalized: "x@y.com" }], error: null },
    ]);
    const r = await fetchUniqueWeddingPersonIdForNormalizedEmail(supabase, "photo1", "x@y.com", ids);
    expect(r).toBe("p0");
  });

  it("ambiguous Gmail intersection: two people with equivalent addresses stays unresolved", async () => {
    const supabase = contactPointsClient([
      {
        data: [
          { person_id: "a", value_normalized: "jane.doe@gmail.com" },
          { person_id: "b", value_normalized: "janedoe@gmail.com" },
        ],
        error: null,
      },
    ]);
    const r = await fetchUniqueWeddingPersonIdForNormalizedEmail(
      supabase,
      "photo1",
      "jane.doe@gmail.com",
      ["a", "b"],
    );
    expect(r).toBeNull();
  });
});
