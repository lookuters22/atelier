import { describe, expect, it } from "vitest";
import {
  classifyParticipantBucket,
  outgoingRecipientParticipants,
  resolveAudienceVisibility,
} from "./resolveAudienceVisibility.ts";
import type { ThreadParticipantAudienceRow } from "../../../../src/types/decisionContext.types.ts";

function tp(
  partial: Partial<ThreadParticipantAudienceRow> & Pick<ThreadParticipantAudienceRow, "person_id">,
): ThreadParticipantAudienceRow {
  return {
    id: partial.id ?? "id",
    thread_id: partial.thread_id ?? "thread",
    visibility_role: partial.visibility_role ?? "",
    participant_role: partial.participant_role,
    is_cc: partial.is_cc ?? false,
    is_recipient: partial.is_recipient ?? true,
    is_sender: partial.is_sender ?? false,
    person_id: partial.person_id,
  };
}

describe("resolveAudienceVisibility", () => {
  it("planner_only: recipients are planners — no redaction flag", () => {
    const participants = [
      tp({ person_id: "a", visibility_role: "wedding planner", is_sender: false }),
      tp({ person_id: "b", visibility_role: "coordinator", is_sender: false }),
    ];
    const m = new Map();
    const r = resolveAudienceVisibility(participants, m);
    expect(r.visibilityClass).toBe("planner_only");
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(false);
  });

  it("client_visible: couple role in visibility_role", () => {
    const participants = [
      tp({ person_id: "c", visibility_role: "bride", is_sender: false }),
    ];
    const r = resolveAudienceVisibility(participants, new Map());
    expect(r.visibilityClass).toBe("client_visible");
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(true);
  });

  it("mixed_audience: planner + client recipients", () => {
    const participants = [
      tp({ person_id: "p", visibility_role: "planner", is_sender: false }),
      tp({ person_id: "c", visibility_role: "client", is_sender: false }),
    ];
    const r = resolveAudienceVisibility(participants, new Map());
    expect(r.visibilityClass).toBe("mixed_audience");
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(true);
  });

  it("payer via wedding_people is_payer — treated as client-family (redaction)", () => {
    const participants = [tp({ person_id: "pay", visibility_role: "guest", is_sender: false })];
    const m = new Map([
      [
        "pay",
        { person_id: "pay", role_label: "family", is_payer: true, is_billing_contact: false },
      ],
    ]);
    const r = resolveAudienceVisibility(participants, m);
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(true);
    expect(["client_visible", "mixed_audience"]).toContain(r.visibilityClass);
  });

  it("billing contact via wedding_people is_billing_contact — treated as client-family (visibility)", () => {
    const participants = [tp({ person_id: "acct", visibility_role: "guest", is_sender: false })];
    const m = new Map([
      [
        "acct",
        { person_id: "acct", role_label: "Accounts", is_payer: false, is_billing_contact: true },
      ],
    ]);
    const r = resolveAudienceVisibility(participants, m);
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(true);
    expect(["client_visible", "mixed_audience"]).toContain(r.visibilityClass);
  });

  it("outgoingRecipientParticipants excludes sender-only rows", () => {
    const participants = [
      tp({ person_id: "s", is_sender: true, is_recipient: false, is_cc: false }),
      tp({ person_id: "r", is_sender: false, is_recipient: true, is_cc: false }),
    ];
    expect(outgoingRecipientParticipants(participants)).toHaveLength(1);
  });

  it("participant_role=planner classifies planner thread without free-text hints", () => {
    const participants = [
      tp({
        person_id: "p1",
        visibility_role: "",
        participant_role: "planner",
        is_sender: false,
      }),
    ];
    const r = resolveAudienceVisibility(participants, new Map());
    expect(r.visibilityClass).toBe("planner_only");
    expect(r.clientVisibleForPrivateCommercialRedaction).toBe(false);
  });

  it("participant_role=client forces client_visible (not planner_only)", () => {
    const participants = [
      tp({
        person_id: "c1",
        visibility_role: "coordinator",
        participant_role: "client",
        is_sender: false,
      }),
    ];
    const r = resolveAudienceVisibility(participants, new Map());
    expect(r.visibilityClass).toBe("client_visible");
  });
});

describe("classifyParticipantBucket", () => {
  it("classifies vendor", () => {
    expect(
      classifyParticipantBucket(tp({ person_id: "v", visibility_role: "florist" }), undefined),
    ).toBe("vendor");
  });
});
