/**
 * Hosted behavioral proof for `complete_bounded_near_match_thread_wedding_link` (service_role RPC).
 * Asserts real DB pre/post conditions — not wrapper mapping or SQL regex alone.
 *
 * Requires: migrations applied (including CAS v1). `.env` with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Run:
 *   npx cross-env BOUNDED_NEAR_MATCH_LINK_RPC_E2E=1 vitest run --config vitest.context.config.ts src/lib/completeBoundedNearMatchThreadWeddingLink.rpc.hosted.test.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "../types/database.types.ts";
import { loadEnvFromRoot } from "../../scripts/loadRootEnv.ts";

loadEnvFromRoot();

const enabled = process.env.BOUNDED_NEAR_MATCH_LINK_RPC_E2E === "1";
const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

const RESOLUTION = "E2E bounded near-match thread link approval (behavioral harness).";

type Sb = SupabaseClient<Database>;

async function insertPhotographer(sb: Sb): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { data, error } = await sb
    .from("photographers")
    .insert({ email: `nm-link-e2e-${suffix}@test.invalid` })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`photographers insert: ${error?.message}`);
  return data.id as string;
}

async function insertWedding(sb: Sb, photographerId: string, coupleNames: string): Promise<string> {
  const { data, error } = await sb
    .from("weddings")
    .insert({
      photographer_id: photographerId,
      couple_names: coupleNames,
      location: "E2E",
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`weddings insert: ${error?.message}`);
  return data.id as string;
}

async function insertUnfiledThread(sb: Sb, photographerId: string, title: string): Promise<string> {
  const { data, error } = await sb
    .from("threads")
    .insert({
      photographer_id: photographerId,
      title,
      wedding_id: null,
      kind: "group",
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`threads insert: ${error?.message}`);
  return data.id as string;
}

async function insertNearMatchEscalation(
  sb: Sb,
  input: {
    photographerId: string;
    threadId: string;
    candidateWeddingId: string;
    weddingId?: string | null;
  },
): Promise<string> {
  const { data, error } = await sb
    .from("escalation_requests")
    .insert({
      photographer_id: input.photographerId,
      thread_id: input.threadId,
      wedding_id: input.weddingId ?? null,
      action_key: "request_thread_wedding_link",
      reason_code: "bounded_matchmaker_near_match",
      decision_justification: {
        candidate_wedding_id: input.candidateWeddingId,
        confidence_score: 80,
        matchmaker_reasoning: "e2e seed",
      },
      question_body: "E2E near-match link — approve filing?",
      status: "open",
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`escalation_requests insert: ${error?.message}`);
  return data.id as string;
}

/** Generic open escalation (for hold FK) — not a near-match link row. */
async function insertGenericOpenEscalation(
  sb: Sb,
  photographerId: string,
  threadId: string,
): Promise<string> {
  const { data, error } = await sb
    .from("escalation_requests")
    .insert({
      photographer_id: photographerId,
      thread_id: threadId,
      wedding_id: null,
      action_key: "operator_blocked_action",
      reason_code: "e2e_hold_fixture",
      decision_justification: { e2e: true },
      question_body: "E2E hold placeholder escalation",
      status: "open",
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`generic escalation insert: ${error?.message}`);
  return data.id as string;
}

async function callLinkRpc(sb: Sb, photographerId: string, escalationId: string) {
  return sb.rpc("complete_bounded_near_match_thread_wedding_link", {
    p_photographer_id: photographerId,
    p_escalation_id: escalationId,
    p_resolution_summary: RESOLUTION,
  });
}

async function deletePhotographerCascade(sb: Sb, photographerId: string): Promise<void> {
  await sb.from("photographers").delete().eq("id", photographerId);
}

describe.skipIf(!enabled || !url || !key)("complete_bounded_near_match_thread_wedding_link RPC (hosted behavioral)", () => {
  const supabase = createClient<Database>(url, key);

  it("deploy smoke: missing escalation raises", async () => {
    const fake = "00000000-0000-4000-8000-000000000099";
    const { data, error } = await callLinkRpc(supabase, fake, fake);
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(error!.message).toMatch(/escalation not found/i);
  });

  it("happy path: links unlinked thread, finalizes escalation, writes manual_link; clears hold when hold id matches", async () => {
    const photographerId = await insertPhotographer(supabase);
    try {
      const wCandidate = await insertWedding(supabase, photographerId, "E2E Candidate");
      const threadId = await insertUnfiledThread(supabase, photographerId, "E2E unfiled thread");
      const escalationId = await insertNearMatchEscalation(supabase, {
        photographerId,
        threadId,
        candidateWeddingId: wCandidate,
      });

      const { error: holdErr } = await supabase
        .from("threads")
        .update({
          v3_operator_automation_hold: true,
          v3_operator_hold_escalation_id: escalationId,
        })
        .eq("id", threadId);
      if (holdErr) throw new Error(holdErr.message);

      const { data, error } = await callLinkRpc(supabase, photographerId, escalationId);
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      const body = data as Record<string, unknown>;
      expect(body.status).toBe("completed");
      expect(body.wedding_id).toBe(wCandidate);

      const { data: thread, error: tErr } = await supabase
        .from("threads")
        .select("wedding_id, ai_routing_metadata, v3_operator_automation_hold, v3_operator_hold_escalation_id")
        .eq("id", threadId)
        .single();
      if (tErr || !thread) throw new Error(tErr?.message);
      expect(thread.wedding_id).toBe(wCandidate);
      expect(thread.v3_operator_automation_hold).toBe(false);
      expect(thread.v3_operator_hold_escalation_id).toBeNull();

      const meta = thread.ai_routing_metadata as Record<string, unknown> | null;
      expect(meta?.manual_link).toBeTruthy();
      const manual = meta?.manual_link as Record<string, unknown>;
      expect(manual?.kind).toBe("link_thread_to_wedding");
      expect(manual?.wedding_id).toBe(wCandidate);
      expect(manual?.bounded_near_match_approval).toBe(true);

      const { data: esc, error: eErr } = await supabase
        .from("escalation_requests")
        .select("status, resolution_storage_target, wedding_id, learning_outcome")
        .eq("id", escalationId)
        .single();
      if (eErr || !esc) throw new Error(eErr?.message);
      expect(esc.status).toBe("answered");
      expect(esc.resolution_storage_target).toBe("thread_wedding_link");
      expect(esc.wedding_id).toBe(wCandidate);
      expect(esc.learning_outcome).toBe("one_off_case");
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
    }
  });

  it("idempotent replay: second RPC on same answered escalation returns already_completed", async () => {
    const photographerId = await insertPhotographer(supabase);
    try {
      const wCandidate = await insertWedding(supabase, photographerId, "E2E Idempotent");
      const threadId = await insertUnfiledThread(supabase, photographerId, "E2E idempotent thread");
      const escalationId = await insertNearMatchEscalation(supabase, {
        photographerId,
        threadId,
        candidateWeddingId: wCandidate,
      });

      const first = await callLinkRpc(supabase, photographerId, escalationId);
      expect(first.error).toBeNull();
      expect((first.data as Record<string, unknown>).status).toBe("completed");

      const { data: weddingBefore } = await supabase
        .from("threads")
        .select("wedding_id, ai_routing_metadata")
        .eq("id", threadId)
        .single();

      const second = await callLinkRpc(supabase, photographerId, escalationId);
      expect(second.error).toBeNull();
      const b = second.data as Record<string, unknown>;
      expect(b.status).toBe("already_completed");
      expect(b.wedding_id).toBe(wCandidate);

      const { data: weddingAfter } = await supabase
        .from("threads")
        .select("wedding_id, ai_routing_metadata")
        .eq("id", threadId)
        .single();
      expect(weddingAfter?.wedding_id).toBe(weddingBefore?.wedding_id);
      expect(JSON.stringify(weddingAfter?.ai_routing_metadata)).toBe(
        JSON.stringify(weddingBefore?.ai_routing_metadata),
      );
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
    }
  });

  it("already-linked refusal: second open escalation does not overwrite wedding_id or finalize second escalation", async () => {
    const photographerId = await insertPhotographer(supabase);
    try {
      const wFirst = await insertWedding(supabase, photographerId, "E2E First Project");
      const wSecond = await insertWedding(supabase, photographerId, "E2E Second Project");
      const threadId = await insertUnfiledThread(supabase, photographerId, "E2E double-approval thread");
      const e1 = await insertNearMatchEscalation(supabase, {
        photographerId,
        threadId,
        candidateWeddingId: wFirst,
      });

      const r1 = await callLinkRpc(supabase, photographerId, e1);
      expect(r1.error).toBeNull();
      expect((r1.data as Record<string, unknown>).status).toBe("completed");

      const e2 = await insertNearMatchEscalation(supabase, {
        photographerId,
        threadId,
        candidateWeddingId: wSecond,
      });

      const r2 = await callLinkRpc(supabase, photographerId, e2);
      expect(r2.error).toBeNull();
      const b = r2.data as Record<string, unknown>;
      expect(b.status).toBe("thread_already_linked");
      expect(b.existing_wedding_id).toBe(wFirst);
      expect(b.attempted_wedding_id).toBe(wSecond);

      const { data: thread } = await supabase.from("threads").select("wedding_id").eq("id", threadId).single();
      expect(thread?.wedding_id).toBe(wFirst);

      const { data: esc2 } = await supabase
        .from("escalation_requests")
        .select("status")
        .eq("id", e2)
        .single();
      expect(esc2?.status).toBe("open");
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
    }
  });

  it("hold-clear is conditional: mismatched hold escalation id leaves hold flags intact", async () => {
    const photographerId = await insertPhotographer(supabase);
    try {
      const wCandidate = await insertWedding(supabase, photographerId, "E2E Hold Mismatch");
      const threadId = await insertUnfiledThread(supabase, photographerId, "E2E hold mismatch thread");
      const eHold = await insertGenericOpenEscalation(supabase, photographerId, threadId);
      const eLink = await insertNearMatchEscalation(supabase, {
        photographerId,
        threadId,
        candidateWeddingId: wCandidate,
      });

      const { error: upErr } = await supabase
        .from("threads")
        .update({
          v3_operator_automation_hold: true,
          v3_operator_hold_escalation_id: eHold,
        })
        .eq("id", threadId);
      if (upErr) throw new Error(upErr.message);

      const { error: rpcErr } = await callLinkRpc(supabase, photographerId, eLink);
      expect(rpcErr).toBeNull();

      const { data: thread } = await supabase
        .from("threads")
        .select("wedding_id, v3_operator_automation_hold, v3_operator_hold_escalation_id")
        .eq("id", threadId)
        .single();
      expect(thread?.wedding_id).toBe(wCandidate);
      expect(thread?.v3_operator_automation_hold).toBe(true);
      expect(thread?.v3_operator_hold_escalation_id).toBe(eHold);
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
    }
  });

  it("validation: wrong reason_code raises", async () => {
    const photographerId = await insertPhotographer(supabase);
    try {
      const w = await insertWedding(supabase, photographerId, "E2E Wrong Reason");
      const threadId = await insertUnfiledThread(supabase, photographerId, "E2E wrong reason thread");
      const { data: escRow, error: insErr } = await supabase
        .from("escalation_requests")
        .insert({
          photographer_id: photographerId,
          thread_id: threadId,
          wedding_id: null,
          action_key: "request_thread_wedding_link",
          reason_code: "some_other_reason",
          decision_justification: { candidate_wedding_id: w },
          question_body: "wrong reason_code fixture",
          status: "open",
        })
        .select("id")
        .single();
      if (insErr || !escRow?.id) throw new Error(insErr?.message);

      const { data, error } = await callLinkRpc(supabase, photographerId, escRow.id as string);
      expect(data).toBeNull();
      expect(error?.message).toMatch(/wrong reason_code/i);
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
    }
  });

  it("validation: wrong action_key raises", async () => {
    const photographerId = await insertPhotographer(supabase);
    try {
      const w = await insertWedding(supabase, photographerId, "E2E Wrong Action");
      const threadId = await insertUnfiledThread(supabase, photographerId, "E2E wrong action thread");
      const { data: escRow, error: insErr } = await supabase
        .from("escalation_requests")
        .insert({
          photographer_id: photographerId,
          thread_id: threadId,
          wedding_id: null,
          action_key: "operator_blocked_action",
          reason_code: "bounded_matchmaker_near_match",
          decision_justification: { candidate_wedding_id: w },
          question_body: "wrong action_key fixture",
          status: "open",
        })
        .select("id")
        .single();
      if (insErr || !escRow?.id) throw new Error(insErr?.message);

      const { data, error } = await callLinkRpc(supabase, photographerId, escRow.id as string);
      expect(data).toBeNull();
      expect(error?.message).toMatch(/wrong action_key/i);
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
    }
  });

  it("validation: tenant mismatch on RPC photographer id raises", async () => {
    const p1 = await insertPhotographer(supabase);
    const p2 = await insertPhotographer(supabase);
    try {
      const w = await insertWedding(supabase, p1, "E2E Tenant A");
      const threadId = await insertUnfiledThread(supabase, p1, "E2E tenant thread");
      const e = await insertNearMatchEscalation(supabase, {
        photographerId: p1,
        threadId,
        candidateWeddingId: w,
      });

      const { data, error } = await callLinkRpc(supabase, p2, e);
      expect(data).toBeNull();
      expect(error?.message).toMatch(/tenant mismatch/i);
    } finally {
      await deletePhotographerCascade(supabase, p1);
      await deletePhotographerCascade(supabase, p2);
    }
  });

  it("validation: wedding_not_found raises", async () => {
    const photographerId = await insertPhotographer(supabase);
    try {
      const missingWedding = "00000000-0000-4000-8000-0000000000aa";
      const threadId = await insertUnfiledThread(supabase, photographerId, "E2E missing wedding thread");
      const e = await insertNearMatchEscalation(supabase, {
        photographerId,
        threadId,
        candidateWeddingId: missingWedding,
      });

      const { data, error } = await callLinkRpc(supabase, photographerId, e);
      expect(data).toBeNull();
      expect(error?.message).toMatch(/wedding_not_found/i);
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
    }
  });

  it("validation: wedding tenant mismatch raises", async () => {
    const p1 = await insertPhotographer(supabase);
    const p2 = await insertPhotographer(supabase);
    try {
      const wOther = await insertWedding(supabase, p2, "E2E Other Tenant Wedding");
      const threadId = await insertUnfiledThread(supabase, p1, "E2E cross-tenant thread");
      const e = await insertNearMatchEscalation(supabase, {
        photographerId: p1,
        threadId,
        candidateWeddingId: wOther,
      });

      const { data, error } = await callLinkRpc(supabase, p1, e);
      expect(data).toBeNull();
      expect(error?.message).toMatch(/wedding tenant mismatch/i);
    } finally {
      await deletePhotographerCascade(supabase, p1);
      await deletePhotographerCascade(supabase, p2);
    }
  });
});
