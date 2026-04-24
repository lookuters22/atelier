import { describe, expect, it } from "vitest";
import { supersededTargetIdsFromMemoryRows, visibleProjectMemoriesFromFetch } from "./projectMemoriesDisplay.ts";

describe("projectMemoriesDisplay", () => {
  it("collects superseded target ids from rows (trimmed)", () => {
    const rows = [
      { id: "a", supersedes_memory_id: "old1" },
      { id: "b", supersedes_memory_id: null },
      { id: "c", supersedes_memory_id: "  old2 " },
    ];
    expect(supersededTargetIdsFromMemoryRows(rows)).toEqual(new Set(["old1", "old2"]));
  });

  it("excludes rows whose id is targeted by another row's supersedes_memory_id", () => {
    const rows = [
      { id: "newer", supersedes_memory_id: "older" },
      { id: "older", supersedes_memory_id: null },
      { id: "other", supersedes_memory_id: null },
    ];
    expect(visibleProjectMemoriesFromFetch(rows).map((r) => r.id)).toEqual(["newer", "other"]);
  });
});
