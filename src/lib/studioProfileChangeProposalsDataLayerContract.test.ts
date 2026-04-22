import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));

/**
 * RLS (see `supabase/migrations/20260622120001_studio_profile_change_proposals_rls_select_insert_only.sql`)
 * allows authenticated clients only SELECT + INSERT. UPDATE/DELETE must not appear in the browser data path.
 */
describe("studioProfileChangeProposals data layer (RLS contract)", () => {
  it("fetch + insert modules do not use .update or .delete for this table", () => {
    for (const file of [
      "fetchStudioProfileChangeProposals.ts",
      "insertStudioProfileChangeProposal.ts",
    ]) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text, file).not.toMatch(/\.update\s*\(/);
      expect(text, file).not.toMatch(/\.delete\s*\(/);
    }
  });
});
