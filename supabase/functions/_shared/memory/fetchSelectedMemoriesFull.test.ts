import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { fetchSelectedMemoriesFull, touchMemoryLastAccessed } from "./fetchSelectedMemoriesFull.ts";

/**
 * execute_v3 Step 5E — focused verification: header scan stays light; promotion fills
 * `selectedMemories` with `full_content` only for chosen IDs (tenant-scoped).
 */
describe("fetchSelectedMemoriesFull — selectedMemories promotion", () => {
  it("loads full_content for requested memory ids under photographer_id", async () => {
    const supabase = {
      from(_table: string) {
        return {
          select(_cols: string) {
            return {
              eq(col: string, photographerId: string) {
                expect(col).toBe("photographer_id");
                expect(photographerId).toBe("tenant-a");
                return {
                  in(col2: string, ids: string[]) {
                    expect(col2).toBe("id");
                    expect(ids).toEqual(["mem-1"]);
                    return Promise.resolve({
                      data: [
                        {
                          id: "mem-1",
                          type: "preference",
                          title: "Reply tone",
                          summary: "Short header",
                          full_content: "LONG DURABLE BODY ONLY AFTER PROMOTION",
                        },
                      ],
                      error: null,
                    });
                  },
                };
              },
            };
          },
          update() {
            return {
              eq() {
                return {
                  in() {
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      },
    };

    const rows = await fetchSelectedMemoriesFull(
      supabase as unknown as SupabaseClient,
      "tenant-a",
      ["mem-1"],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("mem-1");
    expect(rows[0].summary).toBe("Short header");
    expect(rows[0].full_content).toBe(
      "LONG DURABLE BODY ONLY AFTER PROMOTION",
    );
  });

  it("schedules last_accessed touch without blocking (update chain)", async () => {
    let updateCalls = 0;
    const supabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  in() {
                    return Promise.resolve({
                      data: [{ id: "x", type: "t", title: "", summary: "", full_content: "c" }],
                      error: null,
                    });
                  },
                };
              },
            };
          },
          update() {
            updateCalls += 1;
            return {
              eq() {
                return {
                  in() {
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      },
    };

    await fetchSelectedMemoriesFull(supabase as unknown as SupabaseClient, "p", ["x"]);
    await vi.waitFor(() => expect(updateCalls).toBe(1));
  });
});

describe("touchMemoryLastAccessed", () => {
  it("runs update for tenant-scoped ids and swallows errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const inIds: string[][] = [];
    const supabase = {
      from() {
        return {
          update() {
            return {
              eq() {
                return {
                  in(_c: string, ids: string[]) {
                    inIds.push(ids);
                    return Promise.resolve({ error: { message: "fail" } });
                  },
                };
              },
            };
          },
        };
      },
    };
    touchMemoryLastAccessed(supabase as unknown as SupabaseClient, "photo", ["a", "b"]);
    await vi.waitFor(() => expect(inIds.length).toBe(1));
    expect(inIds[0]?.sort()).toEqual(["a", "b"]);
    vi.restoreAllMocks();
  });
});
