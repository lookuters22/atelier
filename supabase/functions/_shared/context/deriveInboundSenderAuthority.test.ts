import { describe, expect, it } from "vitest";
import { deriveInboundSenderAuthority } from "./deriveInboundSenderAuthority.ts";
import type { ThreadParticipantAudienceRow } from "../../../../src/types/decisionContext.types.ts";
import type { WeddingPersonRoleRow } from "./resolveAudienceVisibility.ts";

function senderRow(over: Partial<ThreadParticipantAudienceRow> & { person_id: string }): ThreadParticipantAudienceRow {
  return {
    id: "tp1",
    thread_id: "t1",
    visibility_role: over.visibility_role ?? "",
    is_cc: over.is_cc ?? false,
    is_recipient: over.is_recipient ?? false,
    is_sender: over.is_sender ?? true,
    ...over,
  };
}

describe("deriveInboundSenderAuthority", () => {
  it("unresolved when no sender row", () => {
    const r = deriveInboundSenderAuthority([], new Map(), []);
    expect(r.source).toBe("unresolved");
    expect(r.bucket).toBe("unknown");
    expect(r.personId).toBeNull();
  });

  it("payer when wedding_people.is_payer", () => {
    const p = senderRow({ person_id: "p1", visibility_role: "guest" });
    const wp: WeddingPersonRoleRow = {
      person_id: "p1",
      role_label: "Father of bride",
      is_payer: true,
      is_billing_contact: false,
    };
    const m = new Map<string, WeddingPersonRoleRow>([["p1", wp]]);
    const r = deriveInboundSenderAuthority([p], m, []);
    expect(r.bucket).toBe("payer");
    expect(r.source).toBe("thread_sender");
  });

  it("client_primary when client_family and not payer", () => {
    const p = senderRow({ person_id: "p1", visibility_role: "bride" });
    const wp: WeddingPersonRoleRow = {
      person_id: "p1",
      role_label: "Bride",
      is_payer: false,
      is_billing_contact: false,
    };
    const m = new Map([["p1", wp]]);
    const r = deriveInboundSenderAuthority([p], m, []);
    expect(r.bucket).toBe("client_primary");
  });

  it("planner from role_label", () => {
    const p = senderRow({ person_id: "p2", visibility_role: "planner" });
    const wp: WeddingPersonRoleRow = {
      person_id: "p2",
      role_label: "Wedding planner",
      is_payer: false,
      is_billing_contact: false,
    };
    const r = deriveInboundSenderAuthority([p], new Map([["p2", wp]]), []);
    expect(r.bucket).toBe("planner");
  });

  it("vendor from role", () => {
    const p = senderRow({ person_id: "p3", visibility_role: "vendor" });
    const r = deriveInboundSenderAuthority([p], new Map(), []);
    expect(r.bucket).toBe("vendor");
  });

  it("assistant_or_team from MOH in visibility_role", () => {
    const p = senderRow({ person_id: "p4", visibility_role: "maid of honor" });
    const r = deriveInboundSenderAuthority([p], new Map(), []);
    expect(r.bucket).toBe("assistant_or_team");
  });

  it("isApprovalContact when person id listed", () => {
    const p = senderRow({ person_id: "p5", visibility_role: "bride" });
    const wp: WeddingPersonRoleRow = {
      person_id: "p5",
      role_label: "Bride",
      is_payer: false,
      is_billing_contact: false,
    };
    const r = deriveInboundSenderAuthority([p], new Map([["p5", wp]]), ["p5"]);
    expect(r.isApprovalContact).toBe(true);
  });

  it("billing_contact only (not payer) stays client_primary authority bucket", () => {
    const p = senderRow({ person_id: "p6", visibility_role: "guest" });
    const wp: WeddingPersonRoleRow = {
      person_id: "p6",
      role_label: "Billing contact",
      is_payer: false,
      is_billing_contact: true,
    };
    const r = deriveInboundSenderAuthority([p], new Map([["p6", wp]]), []);
    expect(r.bucket).toBe("client_primary");
  });
});
