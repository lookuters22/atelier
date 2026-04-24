import { describe, expect, it } from "vitest";
import type { WeddingPersonRoleRow } from "./resolveAudienceVisibility.ts";
import {
  BILLING_PAYER_ACTION_CONSTRAINT_SENDER_NOT_PAYER,
  BILLING_PAYER_ACTION_CONSTRAINT_SPLIT_PARTIES,
  billingPayerMismatchActionConstraints,
  buildBillingPayerWorkflowSnapshot,
  hasDistinctPayerAndBillingContactParties,
} from "./billingPayerWorkflowContext.ts";

function wp(partial: Partial<WeddingPersonRoleRow> & Pick<WeddingPersonRoleRow, "person_id">): WeddingPersonRoleRow {
  return {
    person_id: partial.person_id,
    role_label: partial.role_label ?? "",
    is_payer: partial.is_payer ?? false,
    is_billing_contact: partial.is_billing_contact ?? false,
  };
}

describe("hasDistinctPayerAndBillingContactParties", () => {
  it("false when only payer or only billing is set", () => {
    expect(hasDistinctPayerAndBillingContactParties(["a"], [])).toBe(false);
    expect(hasDistinctPayerAndBillingContactParties([], ["b"])).toBe(false);
  });

  it("false when same sole person is both", () => {
    expect(hasDistinctPayerAndBillingContactParties(["javier"], ["javier"])).toBe(false);
  });

  it("true when payer and billing sets differ (stress: Jessica vs Stanislav-shaped)", () => {
    expect(hasDistinctPayerAndBillingContactParties(["jessica"], ["stanislav"])).toBe(true);
  });
});

describe("buildBillingPayerWorkflowSnapshot", () => {
  it("B&A-shaped: bride sends, father is payer — sender may not be payer", () => {
    const m = new Map<string, WeddingPersonRoleRow>([
      ["belen", wp({ person_id: "belen", role_label: "Bride", is_payer: false })],
      ["javier", wp({ person_id: "javier", role_label: "Father of bride", is_payer: true })],
    ]);
    const s = buildBillingPayerWorkflowSnapshot({
      weddingPeopleByPersonId: m,
      inboundSenderPersonId: "belen",
    });
    expect(s.payerPersonIds).toEqual(["javier"]);
    expect(s.counterpartyMismatchRisk).toBe("sender_may_not_be_payer");
    expect(billingPayerMismatchActionConstraints(s)).toContain(BILLING_PAYER_ACTION_CONSTRAINT_SENDER_NOT_PAYER);
  });

  it("J&A-shaped: payer and billing contact are different people — split parties + billing mismatch when payer sends", () => {
    const m = new Map<string, WeddingPersonRoleRow>([
      [
        "jessica",
        wp({ person_id: "jessica", role_label: "Bride", is_payer: true, is_billing_contact: false }),
      ],
      [
        "stanislav",
        wp({ person_id: "stanislav", role_label: "Father", is_payer: false, is_billing_contact: true }),
      ],
    ]);
    const s = buildBillingPayerWorkflowSnapshot({
      weddingPeopleByPersonId: m,
      inboundSenderPersonId: "jessica",
    });
    expect(s.hasDistinctPayerAndBillingContactParties).toBe(true);
    expect(s.counterpartyMismatchRisk).toBe("split_payer_and_billing_contact_parties");
    const c = billingPayerMismatchActionConstraints(s);
    expect(c).toContain(BILLING_PAYER_ACTION_CONSTRAINT_SPLIT_PARTIES);
    expect(c.some((x) => x.includes("is_billing_contact"))).toBe(true);
  });

  it("aligned: sender is the only payer — no constraints", () => {
    const m = new Map<string, WeddingPersonRoleRow>([
      ["javier", wp({ person_id: "javier", is_payer: true, is_billing_contact: true })],
    ]);
    const s = buildBillingPayerWorkflowSnapshot({
      weddingPeopleByPersonId: m,
      inboundSenderPersonId: "javier",
    });
    expect(s.counterpartyMismatchRisk).toBe("none");
    expect(billingPayerMismatchActionConstraints(s)).toHaveLength(0);
  });

  it("constraints contain no account numbers or street-address patterns (audience-safe ops hints only)", () => {
    const m = new Map<string, WeddingPersonRoleRow>([
      ["a", wp({ person_id: "a", is_payer: true })],
      ["b", wp({ person_id: "b", is_billing_contact: true })],
    ]);
    const s = buildBillingPayerWorkflowSnapshot({
      weddingPeopleByPersonId: m,
      inboundSenderPersonId: "nope",
    });
    const joined = billingPayerMismatchActionConstraints(s).join(" ");
    expect(joined.toLowerCase()).not.toMatch(/\biban\b|\bswift\b|\b\d{5}\b/);
  });
});
