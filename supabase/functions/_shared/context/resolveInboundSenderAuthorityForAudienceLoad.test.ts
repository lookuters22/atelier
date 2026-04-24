import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { resolveInboundSenderAuthorityForAudienceLoad } from "./resolveInboundSenderAuthorityForAudienceLoad.ts";
import type { ThreadParticipantAudienceRow } from "../../../../src/types/decisionContext.types.ts";
import type { WeddingPersonRoleRow } from "./resolveAudienceVisibility.ts";

function contactPointsClient(
  responses: Array<{ data: { person_id: string; value_normalized: string }[]; error: null }>,
): SupabaseClient {
  let call = 0;
  return {
    from: () => ({
      select: () => ({
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
  } as unknown as SupabaseClient;
}

function sender(over: Partial<ThreadParticipantAudienceRow> & { person_id: string }): ThreadParticipantAudienceRow {
  return {
    id: "tp1",
    thread_id: "t1",
    visibility_role: "bride",
    is_cc: false,
    is_recipient: false,
    is_sender: true,
    ...over,
  };
}

function nonSender(over: Partial<ThreadParticipantAudienceRow> & { person_id: string }): ThreadParticipantAudienceRow {
  return {
    id: "tp2",
    thread_id: "t1",
    visibility_role: "guest",
    is_cc: false,
    is_recipient: true,
    is_sender: false,
    ...over,
  };
}

describe("resolveInboundSenderAuthorityForAudienceLoad", () => {
  it("keeps thread_sender when is_sender row exists (no contact_points needed)", async () => {
    const wp: WeddingPersonRoleRow = {
      person_id: "p1",
      role_label: "Bride",
      is_payer: false,
      is_billing_contact: false,
    };
    const m = new Map([["p1", wp]]);
    const supabase = { from: () => ({}) } as unknown as SupabaseClient;
    const r = await resolveInboundSenderAuthorityForAudienceLoad(
      supabase,
      "photo",
      "w1",
      "t1",
      [sender({ person_id: "p1" })],
      m,
      [],
      "bride@example.com",
    );
    expect(r.source).toBe("thread_sender");
  });

  it("resolves via wedding_contact_email when no is_sender and unique contact match", async () => {
    const wp: WeddingPersonRoleRow = {
      person_id: "p1",
      role_label: "Bride",
      is_payer: false,
      is_billing_contact: false,
    };
    const m = new Map([["p1", wp]]);
    const supabase = contactPointsClient([
      { data: [{ person_id: "p1", value_normalized: "bride@example.com" }], error: null },
    ]);
    const r = await resolveInboundSenderAuthorityForAudienceLoad(
      supabase,
      "photo",
      "w1",
      "t1",
      [nonSender({ person_id: "p1", visibility_role: "bride" })],
      m,
      [],
      "bride@example.com",
    );
    expect(r.source).toBe("wedding_contact_email");
    expect(r.bucket).toBe("client_primary");
    expect(r.personId).toBe("p1");
  });

  it("stays unresolved when no is_sender and ambiguous contact matches", async () => {
    const wp1: WeddingPersonRoleRow = {
      person_id: "a",
      role_label: "A",
      is_payer: false,
      is_billing_contact: false,
    };
    const wp2: WeddingPersonRoleRow = {
      person_id: "b",
      role_label: "B",
      is_payer: false,
      is_billing_contact: false,
    };
    const m = new Map<string, WeddingPersonRoleRow>([
      ["a", wp1],
      ["b", wp2],
    ]);
    const supabase = contactPointsClient([
      {
        data: [
          { person_id: "a", value_normalized: "same@example.com" },
          { person_id: "b", value_normalized: "same@example.com" },
        ],
        error: null,
      },
    ]);
    const r = await resolveInboundSenderAuthorityForAudienceLoad(
      supabase,
      "photo",
      "w1",
      "t1",
      [nonSender({ person_id: "a" })],
      m,
      [],
      "dup@example.com",
    );
    expect(r.source).toBe("unresolved");
  });

  it("stays unresolved when no is_sender and no ingress email", async () => {
    const wp: WeddingPersonRoleRow = {
      person_id: "p1",
      role_label: "Bride",
      is_payer: false,
      is_billing_contact: false,
    };
    const m = new Map([["p1", wp]]);
    const supabase = { from: () => ({}) } as unknown as SupabaseClient;
    const r = await resolveInboundSenderAuthorityForAudienceLoad(
      supabase,
      "photo",
      "w1",
      "t1",
      [nonSender({ person_id: "p1" })],
      m,
      [],
      null,
    );
    expect(r.source).toBe("unresolved");
  });

  it("replay-style: synthetic sender yields client_primary with wedding_contact_email", async () => {
    const wp: WeddingPersonRoleRow = {
      person_id: "pX",
      role_label: "Groom",
      is_payer: false,
      is_billing_contact: false,
    };
    const m = new Map([["pX", wp]]);
    const supabase = contactPointsClient([
      { data: [{ person_id: "pX", value_normalized: "groom@example.com" }], error: null },
    ]);
    const r = await resolveInboundSenderAuthorityForAudienceLoad(
      supabase,
      "photo",
      "w1",
      "t1",
      [nonSender({ person_id: "other", visibility_role: "planner" })],
      m,
      [],
      "groom@example.com",
    );
    expect(r.source).toBe("wedding_contact_email");
    expect(r.bucket).toBe("client_primary");
    expect(r.personId).toBe("pX");
  });
});
