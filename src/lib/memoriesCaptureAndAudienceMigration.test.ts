import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("memories capture + audience migration (20260730150000)", () => {
  it("defines CHECK capture_occurred_on IS NULL OR capture_channel IS NOT NULL", async () => {
    const p = path.resolve("supabase/migrations/20260730150000_memories_capture_invariant_audience_default.sql");
    const sql = await readFile(p, "utf8");
    expect(sql).toMatch(/capture_occurred_on\s+IS\s+NULL/i);
    expect(sql).toMatch(/capture_channel\s+IS\s+NOT\s+NULL/i);
    expect(sql).toMatch(/memories_capture_occurred_on_requires_channel/);
  });

  it("sets DEFAULT client_visible on audience_source_tier", async () => {
    const p = path.resolve("supabase/migrations/20260730150000_memories_capture_invariant_audience_default.sql");
    const sql = await readFile(p, "utf8");
    expect(sql).toMatch(/audience_source_tier\s+SET\s+DEFAULT\s+'client_visible'/i);
  });
});
