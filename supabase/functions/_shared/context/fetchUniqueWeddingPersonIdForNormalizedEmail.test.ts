import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fetchUniqueWeddingPersonIdForNormalizedEmail } from "./fetchUniqueWeddingPersonIdForNormalizedEmail.ts";

function contactPointsClient(
  responses: Array<{ data: { person_id: string }[]; error: null }>,
): SupabaseClient {
  let call = 0;
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
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
    }),
  } as unknown as SupabaseClient;
}

describe("fetchUniqueWeddingPersonIdForNormalizedEmail", () => {
  it("returns the only distinct person_id", async () => {
    const supabase = contactPointsClient([{ data: [{ person_id: "a" }], error: null }]);
    const r = await fetchUniqueWeddingPersonIdForNormalizedEmail(
      supabase,
      "photo1",
      "x@y.com",
      ["a"],
    );
    expect(r).toBe("a");
  });

  it("returns null when two distinct persons match", async () => {
    const supabase = contactPointsClient([
      { data: [{ person_id: "a" }, { person_id: "b" }], error: null },
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
      { data: [{ person_id: "p0" }], error: null },
      { data: [{ person_id: "p1" }], error: null },
    ]);
    const r = await fetchUniqueWeddingPersonIdForNormalizedEmail(
      supabase,
      "photo1",
      "x@y.com",
      ids,
    );
    expect(r).toBeNull();
  });

  it("merges chunks and returns single id when same person in both chunks", async () => {
    const ids = Array.from({ length: 121 }, (_, i) => `p${i}`);
    const supabase = contactPointsClient([
      { data: [{ person_id: "p0" }], error: null },
      { data: [{ person_id: "p0" }], error: null },
    ]);
    const r = await fetchUniqueWeddingPersonIdForNormalizedEmail(
      supabase,
      "photo1",
      "x@y.com",
      ids,
    );
    expect(r).toBe("p0");
  });
});
