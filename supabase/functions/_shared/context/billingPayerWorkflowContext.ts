/**
 * Billing / payer workflow signals from `wedding_people.is_payer` and `is_billing_contact`.
 * Structural only — no addresses, currencies, or payment rails (see REAL_THREADS §6b / P5–P6).
 */
import type { BillingPayerWorkflowSnapshot } from "../../../../src/types/decisionContext.types.ts";
import type { WeddingPersonRoleRow } from "./resolveAudienceVisibility.ts";

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) {
    if (!b.has(x)) return false;
  }
  return true;
}

/** True when both roles are populated and refer to different person sets (e.g. Jessica vs Stanislav). */
export function hasDistinctPayerAndBillingContactParties(
  payerPersonIds: string[],
  billingContactPersonIds: string[],
): boolean {
  const P = new Set(payerPersonIds);
  const B = new Set(billingContactPersonIds);
  if (P.size === 0 || B.size === 0) return false;
  return !setsEqual(P, B);
}

/**
 * Builds a tenant-safe snapshot for decision / orchestrator layers.
 * Uses person ids only — no names or contact points.
 */
export function buildBillingPayerWorkflowSnapshot(input: {
  weddingPeopleByPersonId: Map<string, WeddingPersonRoleRow>;
  inboundSenderPersonId: string | null;
}): BillingPayerWorkflowSnapshot {
  const payerPersonIds: string[] = [];
  const billingContactPersonIds: string[] = [];
  for (const [personId, row] of input.weddingPeopleByPersonId) {
    if (row.is_payer === true) payerPersonIds.push(personId);
    if (row.is_billing_contact === true) billingContactPersonIds.push(personId);
  }
  const distinctParties = hasDistinctPayerAndBillingContactParties(
    payerPersonIds,
    billingContactPersonIds,
  );
  const sender = input.inboundSenderPersonId;

  const senderNotPayer =
    sender != null && payerPersonIds.length > 0 && !payerPersonIds.includes(sender);
  const senderNotBilling =
    sender != null &&
    billingContactPersonIds.length > 0 &&
    !billingContactPersonIds.includes(sender);

  let counterpartyMismatchRisk: BillingPayerWorkflowSnapshot["counterpartyMismatchRisk"] = "none";
  if (distinctParties) {
    counterpartyMismatchRisk = "split_payer_and_billing_contact_parties";
  } else if (senderNotPayer && senderNotBilling) {
    counterpartyMismatchRisk = "sender_may_not_be_payer_nor_billing_contact";
  } else if (senderNotPayer) {
    counterpartyMismatchRisk = "sender_may_not_be_payer";
  } else if (senderNotBilling) {
    counterpartyMismatchRisk = "sender_may_not_be_billing_contact";
  }

  return {
    payerPersonIds,
    billingContactPersonIds,
    inboundSenderPersonId: sender,
    counterpartyMismatchRisk,
    hasDistinctPayerAndBillingContactParties: distinctParties,
  };
}

/** Stable markers for orchestrator / QA (no PII). */
export const BILLING_PAYER_ACTION_CONSTRAINT_SENDER_NOT_PAYER =
  "CRM billing roles: `is_payer` is set on a different wedding person than the thread sender — do not assume this sender is the paying party or default invoice counterparty without verification." as const;

export const BILLING_PAYER_ACTION_CONSTRAINT_SENDER_NOT_BILLING_CONTACT =
  "CRM billing roles: `is_billing_contact` is set on a different person than the thread sender — formal invoices or billing correspondence may need a different addressee; avoid assuming this sender receives billing." as const;

export const BILLING_PAYER_ACTION_CONSTRAINT_SENDER_NOT_PAYER_NOR_BILLING =
  "CRM billing roles: payer and billing-contact flags do not match the thread sender — treat payment and billing routing as distinct from this conversation unless confirmed." as const;

export const BILLING_PAYER_ACTION_CONSTRAINT_SPLIT_PARTIES =
  "CRM billing roles: payer and billing-contact flags reference different people — do not collapse payment vs billing-address routing into a single counterparty." as const;

export function billingPayerMismatchActionConstraints(
  snapshot: BillingPayerWorkflowSnapshot,
): string[] {
  const sender = snapshot.inboundSenderPersonId;
  const out: string[] = [];
  if (snapshot.hasDistinctPayerAndBillingContactParties) {
    out.push(BILLING_PAYER_ACTION_CONSTRAINT_SPLIT_PARTIES);
  }
  if (sender == null) {
    return [...new Set(out)];
  }
  const senderNotPayer =
    snapshot.payerPersonIds.length > 0 && !snapshot.payerPersonIds.includes(sender);
  const senderNotBilling =
    snapshot.billingContactPersonIds.length > 0 &&
    !snapshot.billingContactPersonIds.includes(sender);
  if (senderNotPayer && senderNotBilling) {
    out.push(BILLING_PAYER_ACTION_CONSTRAINT_SENDER_NOT_PAYER_NOR_BILLING);
  } else if (senderNotPayer) {
    out.push(BILLING_PAYER_ACTION_CONSTRAINT_SENDER_NOT_PAYER);
  } else if (senderNotBilling) {
    out.push(BILLING_PAYER_ACTION_CONSTRAINT_SENDER_NOT_BILLING_CONTACT);
  }
  return [...new Set(out)];
}
