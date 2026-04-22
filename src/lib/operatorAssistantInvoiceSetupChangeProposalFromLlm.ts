/**
 * Parse / build operator-assistant **invoice_setup_change_proposal** actions (Ana slice).
 * Shared by the edge JSON parser and the widget normalizer (fail-closed).
 */
import { validateInvoiceSetupChangeProposalV1 } from "./invoiceSetupChangeProposalBounds.ts";
import {
  INVOICE_SETUP_CHANGE_PROPOSAL_SCHEMA_VERSION,
  INVOICE_SETUP_PROPOSAL_TEMPLATE_KEYS,
  type InvoiceSetupChangeProposalV1,
  type InvoiceSetupTemplatePatchV1,
} from "../types/invoiceSetupChangeProposal.types.ts";
import type { OperatorAssistantProposedActionInvoiceSetupChangeProposal } from "../types/operatorAssistantProposedAction.types.ts";

const RATIONALE_MAX = 8_000;
const TEMPLATE_KEY_SET = new Set<string>(INVOICE_SETUP_PROPOSAL_TEMPLATE_KEYS as readonly string[]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function filterTemplatePatch(raw: unknown): InvoiceSetupTemplatePatchV1 | undefined {
  if (!isPlainObject(raw)) return undefined;
  const out: InvoiceSetupTemplatePatchV1 = {};
  for (const k of Object.keys(raw)) {
    if (!TEMPLATE_KEY_SET.has(k)) continue;
    const v = raw[k];
    if (k === "footerNote") {
      if (typeof v === "string") out.footerNote = v;
      continue;
    }
    if (typeof v === "string") {
      if (k === "legalName") out.legalName = v;
      if (k === "invoicePrefix") out.invoicePrefix = v;
      if (k === "paymentTerms") out.paymentTerms = v;
      if (k === "accentColor") out.accentColor = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Build the wire payload for `insertInvoiceSetupChangeProposal` at confirm time (fresh `proposed_at`).
 */
export function buildInvoiceSetupChangeProposalV1ForConfirm(
  p: OperatorAssistantProposedActionInvoiceSetupChangeProposal,
): InvoiceSetupChangeProposalV1 {
  return {
    schema_version: INVOICE_SETUP_CHANGE_PROPOSAL_SCHEMA_VERSION,
    source: "operator_assistant",
    proposed_at: new Date().toISOString(),
    rationale: p.rationale,
    template_patch: { ...p.template_patch },
  };
}

/**
 * LLM + widget: validate proposed-action shape; full `InvoiceSetupChangeProposalV1` must validate when assembled.
 */
export function tryParseLlmProposedInvoiceSetupChange(
  item: unknown,
):
  | { ok: true; value: OperatorAssistantProposedActionInvoiceSetupChangeProposal }
  | { ok: false; reason: string } {
  if (item == null || typeof item !== "object" || (item as { kind?: unknown }).kind !== "invoice_setup_change_proposal") {
    return { ok: false, reason: "not an invoice_setup_change_proposal" };
  }
  const o = item as Record<string, unknown>;
  if (typeof o.rationale !== "string" || !o.rationale.trim()) {
    return { ok: false, reason: "rationale is required" };
  }
  const rationale = o.rationale.trim();
  if (rationale.length > RATIONALE_MAX) {
    return { ok: false, reason: `rationale exceeds ${RATIONALE_MAX} characters` };
  }
  if (!isPlainObject(o.template_patch)) {
    return { ok: false, reason: "template_patch must be an object" };
  }
  const template_patch = filterTemplatePatch(o.template_patch);
  if (!template_patch) {
    return { ok: false, reason: "template_patch must include at least one allowlisted key with a string" };
  }

  const proposal: OperatorAssistantProposedActionInvoiceSetupChangeProposal = {
    kind: "invoice_setup_change_proposal",
    rationale,
    template_patch,
  };

  const assembled = buildInvoiceSetupChangeProposalV1ForConfirm(proposal);
  const v = validateInvoiceSetupChangeProposalV1(assembled);
  if (!v.ok) {
    return { ok: false, reason: v.error };
  }
  return { ok: true, value: proposal };
}

/**
 * Client-side normalizer (same rules as the edge `parseOperatorStudioAssistantLlmResponse` path).
 */
export function normalizeInvoiceSetupChangeProposalsForWidget(
  raw: unknown,
): OperatorAssistantProposedActionInvoiceSetupChangeProposal[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorAssistantProposedActionInvoiceSetupChangeProposal[] = [];
  for (const x of raw) {
    const p = tryParseLlmProposedInvoiceSetupChange(x);
    if (p.ok) {
      out.push(p.value);
    }
  }
  return out;
}
