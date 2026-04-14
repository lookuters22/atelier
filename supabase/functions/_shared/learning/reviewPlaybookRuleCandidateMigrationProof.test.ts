import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Proof that approve UPDATE paths set is_active = true (reactivate inactive live rules).
 * Full DB integration would require a live Postgres; this locks the migration contract in CI.
 */
describe("review_playbook_rule_candidate migration (approve reactivates)", () => {
  it("includes is_active = true on both global and channel UPDATE branches", () => {
    const primary = readFileSync(
      join(process.cwd(), "supabase/migrations/20260424120000_review_playbook_rule_candidate.sql"),
      "utf8",
    );
    const followUp = readFileSync(
      join(process.cwd(), "supabase/migrations/20260425120000_review_playbook_rule_candidate_approve_sets_is_active.sql"),
      "utf8",
    );

    for (const [label, sql] of [
      ["20260424120000", primary],
      ["20260425120000", followUp],
    ] as const) {
      const matches = sql.match(/is_active\s*=\s*true/g);
      expect(matches, `${label}: expected is_active = true in approve UPDATE paths`).not.toBeNull();
      expect(matches!.length, label).toBeGreaterThanOrEqual(2);
    }
  });
});
