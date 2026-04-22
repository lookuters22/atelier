import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));

/**
 * RLS: tenant SELECT + INSERT for `offer_builder_change_proposals`; no client UPDATE/DELETE
 * in fetch/insert modules (see migration `20260625120000_offer_builder_change_proposals_v1.sql`).
 */
describe("offerBuilderChangeProposals data layer (RLS contract)", () => {
  it("fetch, insert, and review helper do not use direct .update or .delete on the table", () => {
    for (const file of [
      "fetchOfferBuilderChangeProposals.ts",
      "insertOfferBuilderChangeProposal.ts",
      "insertInvoiceSetupChangeProposal.ts",
      "fetchInvoiceSetupChangeProposals.ts",
      "reviewInvoiceSetupChangeProposal.ts",
      "reviewOfferBuilderChangeProposal.ts",
      "applyOfferBuilderChangeProposal.ts",
      "applyInvoiceSetupChangeProposal.ts",
    ]) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text, file).not.toMatch(/\.update\s*\(/);
      expect(text, file).not.toMatch(/\.delete\s*\(/);
    }
  });
});
