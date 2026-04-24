/**
 * Hosted behavioral proof for `claim_draft_for_outbound` wedding pause gate (F2).
 *
 * Requires: migrations `20260730130000_claim_draft_for_outbound_wedding_pause_gate.sql` and
 * `20260730140000_claim_draft_for_outbound_pause_state_unconfirmed.sql` applied.
 * `.env`: SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Run:
 *   npx cross-env CLAIM_DRAFT_OUTBOUND_RPC_E2E=1 vitest run --config vitest.context.config.ts src/lib/claimDraftForOutbound.rpc.hosted.test.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "../types/database.types.ts";
import {
  CLAIM_BLOCKED_WEDDING_PAUSE_STATE_UNCONFIRMED_MESSAGE,
  CLAIM_BLOCKED_WEDDING_PAUSED_MESSAGE,
} from "../../supabase/functions/_shared/claimDraftForOutboundPause.ts";
import { loadEnvFromRoot } from "../../scripts/loadRootEnv.ts";

loadEnvFromRoot();

const enabled = process.env.CLAIM_DRAFT_OUTBOUND_RPC_E2E === "1";
const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

type Sb = SupabaseClient<Database>;

async function insertPhotographer(sb: Sb): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { data, error } = await sb
    .from("photographers")
    .insert({ email: `claim-draft-e2e-${suffix}@test.invalid` })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`photographers insert: ${error?.message}`);
  return data.id as string;
}

async function insertWedding(
  sb: Sb,
  photographerId: string,
  coupleNames: string,
  pause: { compassion: boolean; strategic: boolean },
): Promise<string> {
  const { data, error } = await sb
    .from("weddings")
    .insert({
      photographer_id: photographerId,
      couple_names: coupleNames,
      location: "E2E claim draft",
      compassion_pause: pause.compassion,
      strategic_pause: pause.strategic,
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`weddings insert: ${error?.message}`);
  return data.id as string;
}

async function insertThread(
  sb: Sb,
  photographerId: string,
  title: string,
  weddingId: string | null,
): Promise<string> {
  const { data, error } = await sb
    .from("threads")
    .insert({
      photographer_id: photographerId,
      title,
      wedding_id: weddingId,
      kind: "group",
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`threads insert: ${error?.message}`);
  return data.id as string;
}

async function insertPendingDraft(sb: Sb, photographerId: string, threadId: string, body: string): Promise<string> {
  const { data, error } = await sb
    .from("drafts")
    .insert({
      photographer_id: photographerId,
      thread_id: threadId,
      status: "pending_approval",
      body,
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`drafts insert: ${error?.message}`);
  return data.id as string;
}

async function callClaim(sb: Sb, draftId: string, photographerId: string) {
  return sb.rpc("claim_draft_for_outbound", {
    p_draft_id: draftId,
    p_photographer_id: photographerId,
    p_edited_body: null,
  });
}

async function deletePhotographerCascade(sb: Sb, photographerId: string) {
  await sb.from("photographers").delete().eq("id", photographerId);
}

describe.skipIf(!enabled || !url || !key)("claim_draft_for_outbound wedding pause gate (hosted RPC)", () => {
  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  it("happy path: unpaused wedding-backed pending draft claims to approved", async () => {
    const photographerId = await insertPhotographer(supabase);
    try {
      const weddingId = await insertWedding(supabase, photographerId, "E2E happy", {
        compassion: false,
        strategic: false,
      });
      const threadId = await insertThread(supabase, photographerId, "E2E happy thread", weddingId);
      const draftId = await insertPendingDraft(supabase, photographerId, threadId, "hello");

      const { data, error } = await callClaim(supabase, draftId, photographerId);
      expect(error).toBeNull();
      expect(data?.length).toBe(1);
      expect(data?.[0]?.status).toBe("approved");

      const { data: dRow } = await supabase.from("drafts").select("status").eq("id", draftId).single();
      expect(dRow?.status).toBe("approved");
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
    }
  });

  it("unfiled thread (no wedding): pending draft still claims", async () => {
    const photographerId = await insertPhotographer(supabase);
    try {
      const threadId = await insertThread(supabase, photographerId, "E2E CRM thread", null);
      const draftId = await insertPendingDraft(supabase, photographerId, threadId, "crm body");

      const { data, error } = await callClaim(supabase, draftId, photographerId);
      expect(error).toBeNull();
      expect(data?.[0]?.status).toBe("approved");
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
    }
  });

  it("does not claim when wedding has compassion_pause (RPC error)", async () => {
    const photographerId = await insertPhotographer(supabase);
    try {
      const weddingId = await insertWedding(supabase, photographerId, "E2E compassion", {
        compassion: true,
        strategic: false,
      });
      const threadId = await insertThread(supabase, photographerId, "E2E comp thread", weddingId);
      const draftId = await insertPendingDraft(supabase, photographerId, threadId, "body");

      const { data, error } = await callClaim(supabase, draftId, photographerId);
      expect(data).toBeNull();
      expect(String(error?.message ?? "")).toContain(CLAIM_BLOCKED_WEDDING_PAUSED_MESSAGE);

      const { data: dRow } = await supabase.from("drafts").select("status").eq("id", draftId).single();
      expect(dRow?.status).toBe("pending_approval");
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
    }
  });

  it("does not claim when wedding has strategic_pause (RPC error)", async () => {
    const photographerId = await insertPhotographer(supabase);
    try {
      const weddingId = await insertWedding(supabase, photographerId, "E2E strategic", {
        compassion: false,
        strategic: true,
      });
      const threadId = await insertThread(supabase, photographerId, "E2E strat thread", weddingId);
      const draftId = await insertPendingDraft(supabase, photographerId, threadId, "body");

      const { data, error } = await callClaim(supabase, draftId, photographerId);
      expect(data).toBeNull();
      expect(String(error?.message ?? "")).toContain(CLAIM_BLOCKED_WEDDING_PAUSED_MESSAGE);

      const { data: dRow } = await supabase.from("drafts").select("status").eq("id", draftId).single();
      expect(dRow?.status).toBe("pending_approval");
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
    }
  });

  it("race-shaped: wedding unpaused at insert then paused before claim is blocked at claim time", async () => {
    const photographerId = await insertPhotographer(supabase);
    try {
      const weddingId = await insertWedding(supabase, photographerId, "E2E race", {
        compassion: false,
        strategic: false,
      });
      const threadId = await insertThread(supabase, photographerId, "E2E race thread", weddingId);
      const draftId = await insertPendingDraft(supabase, photographerId, threadId, "race body");

      const { error: pauseErr } = await supabase
        .from("weddings")
        .update({ compassion_pause: true })
        .eq("id", weddingId)
        .eq("photographer_id", photographerId);
      expect(pauseErr).toBeNull();

      const { data, error } = await callClaim(supabase, draftId, photographerId);
      expect(data).toBeNull();
      expect(String(error?.message ?? "")).toContain(CLAIM_BLOCKED_WEDDING_PAUSED_MESSAGE);

      const { data: dRow } = await supabase.from("drafts").select("status").eq("id", draftId).single();
      expect(dRow?.status).toBe("pending_approval");
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
    }
  });

  it("wedding-backed but tenant wedding row not joinable: explicit pause-state-unconfirmed RPC error", async () => {
    const photographerA = await insertPhotographer(supabase);
    const photographerB = await insertPhotographer(supabase);
    try {
      const weddingOnB = await insertWedding(supabase, photographerB, "E2E other-tenant wedding", {
        compassion: false,
        strategic: false,
      });
      const { data: threadRow, error: threadErr } = await supabase
        .from("threads")
        .insert({
          photographer_id: photographerA,
          title: "E2E cross-tenant wedding ref thread",
          wedding_id: weddingOnB,
          kind: "group",
          last_activity_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (threadErr || !threadRow?.id) throw new Error(`threads insert: ${threadErr?.message}`);
      const threadId = threadRow.id as string;
      const draftId = await insertPendingDraft(supabase, photographerA, threadId, "orphan join body");

      const { data, error } = await callClaim(supabase, draftId, photographerA);
      expect(data).toBeNull();
      expect(String(error?.message ?? "")).toContain(CLAIM_BLOCKED_WEDDING_PAUSE_STATE_UNCONFIRMED_MESSAGE);

      const { data: dRow } = await supabase.from("drafts").select("status").eq("id", draftId).single();
      expect(dRow?.status).toBe("pending_approval");
    } finally {
      await deletePhotographerCascade(supabase, photographerA);
      await deletePhotographerCascade(supabase, photographerB);
    }
  });

  it("non-pause: wrong photographer returns empty claim without exception", async () => {
    const photographerId = await insertPhotographer(supabase);
    const otherId = await insertPhotographer(supabase);
    try {
      const weddingId = await insertWedding(supabase, photographerId, "E2E tenant", {
        compassion: false,
        strategic: false,
      });
      const threadId = await insertThread(supabase, photographerId, "E2E tenant thread", weddingId);
      const draftId = await insertPendingDraft(supabase, photographerId, threadId, "x");

      const { data, error } = await callClaim(supabase, draftId, otherId);
      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);

      const { data: dRow } = await supabase.from("drafts").select("status").eq("id", draftId).single();
      expect(dRow?.status).toBe("pending_approval");
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
      await deletePhotographerCascade(supabase, otherId);
    }
  });

  it("non-pause: idempotent second claim returns empty (already approved)", async () => {
    const photographerId = await insertPhotographer(supabase);
    try {
      const weddingId = await insertWedding(supabase, photographerId, "E2E double", {
        compassion: false,
        strategic: false,
      });
      const threadId = await insertThread(supabase, photographerId, "E2E double thread", weddingId);
      const draftId = await insertPendingDraft(supabase, photographerId, threadId, "y");

      const first = await callClaim(supabase, draftId, photographerId);
      expect(first.error).toBeNull();
      expect(first.data?.[0]?.status).toBe("approved");

      const second = await callClaim(supabase, draftId, photographerId);
      expect(second.error).toBeNull();
      expect(second.data ?? []).toEqual([]);
    } finally {
      await deletePhotographerCascade(supabase, photographerId);
    }
  });
});
