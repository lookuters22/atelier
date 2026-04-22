import type { InvoiceSetupState } from "../lib/invoiceSetupTypes.ts";

/**
 * v1 **invoice setup change proposal** wire shape (review-first; **no** raw template JSON / full `template` blob).
 *
 * **Enqueue:** `invoice_setup_change_proposals` via widget confirm (see `insertInvoiceSetupChangeProposal`). **Not in this file:** review/apply RPCs.
 *
 * Maps to fields inside `studio_invoice_setup.template` (`InvoiceTemplatePersistedV1`), not the table row directly.
 */
export const INVOICE_SETUP_CHANGE_PROPOSAL_SCHEMA_VERSION = 1 as const;

export type InvoiceSetupChangeProposalSource = "operator_assistant" | "operator" | "system";

/**
 * Allowlisted keys for v1 — same text/branding fields as `InvoiceSetupState` except **logo**.
 *
 * **`logoDataUrl` is intentionally excluded:** data URLs are large, unsuitable for chat/proposal payloads, and
 * belong in the settings UI or a future asset/clear-only contract — not unbounded proposal text.
 */
export const INVOICE_SETUP_PROPOSAL_TEMPLATE_KEYS = [
  "legalName",
  "invoicePrefix",
  "paymentTerms",
  "accentColor",
  "footerNote",
] as const;

export type InvoiceSetupProposalTemplateKey = (typeof INVOICE_SETUP_PROPOSAL_TEMPLATE_KEYS)[number];

/**
 * Partial update to the persisted template (apply path TBD). Only these keys; no nested JSON.
 */
export type InvoiceSetupTemplatePatchV1 = Partial<
  Pick<InvoiceSetupState, "legalName" | "invoicePrefix" | "paymentTerms" | "accentColor" | "footerNote">
>;

export type InvoiceSetupChangeProposalV1 = {
  schema_version: typeof INVOICE_SETUP_CHANGE_PROPOSAL_SCHEMA_VERSION;
  source: InvoiceSetupChangeProposalSource;
  /** ISO 8601 */
  proposed_at: string;
  /** Operator-visible reason (not shown to end clients as an automation message). */
  rationale: string;
  /** At least one allowlisted field must be present with a valid value (see validator). */
  template_patch: InvoiceSetupTemplatePatchV1;
};
