import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** DB behavioral proof (seed + RPC + postconditions): `completeBoundedNearMatchThreadWeddingLink.rpc.hosted.test.ts` with `BOUNDED_NEAR_MATCH_LINK_RPC_E2E=1`. */

describe("complete_bounded_near_match_thread_wedding_link migration (source invariants)", () => {
  it("defines RPC, job column, CAS on unlinked threads, thread_already_linked outcome, and hold clear guard", async () => {
    const file = path.resolve(
      "supabase/migrations/20260725120000_complete_bounded_near_match_thread_wedding_link.sql",
    );
    const sql = await readFile(file, "utf8");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.complete_bounded_near_match_thread_wedding_link/);
    expect(sql).toMatch(/approve_bounded_near_match_thread_link/);
    expect(sql).toMatch(/link_thread_to_wedding/);
    expect(sql).toMatch(/v3_operator_hold_escalation_id IS NOT DISTINCT FROM p_escalation_id/);
    expect(sql).toMatch(/bounded_matchmaker_near_match/);
    expect(sql).toMatch(/request_thread_wedding_link/);
    expect(sql).toMatch(/AND t\.wedding_id IS NULL/);
    expect(sql).toMatch(/thread_already_linked/);
    expect(sql).toMatch(/existing_wedding_id/);
  });

  it("CAS follow-up migration replaces the RPC for already-deployed databases", async () => {
    const file = path.resolve(
      "supabase/migrations/20260730120000_complete_bounded_near_match_thread_link_cas_v1.sql",
    );
    const sql = await readFile(file, "utf8");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.complete_bounded_near_match_thread_wedding_link/);
    expect(sql).toMatch(/AND t\.wedding_id IS NULL/);
    expect(sql).toMatch(/'status', 'thread_already_linked'/);
  });
});
