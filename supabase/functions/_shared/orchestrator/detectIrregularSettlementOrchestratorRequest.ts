/**
 * Deterministic **routing / safety** signal for inbound text that matches **narrow patterns**
 * associated with *potentially improper* settlement or tax-avoidance **requests** (e.g. cash to
 * sidestep VAT, off-books handling, invoice wording aimed at hiding tax).
 *
 * **This is not a legal conclusion** and does not classify criminality or tax liability.
 * It exists only to route threads away from routine automated client replies so a human can
 * review — same posture as other orchestrator gates (BC, VAV, AP1).
 *
 * Kept **separate** from {@link detectBankingComplianceOrchestratorException}: that path covers
 * payment-rail failures and compliance documents, not settlement/tax-avoidance-shaped asks.
 */
import type { OrchestratorIrregularSettlementClass } from "../../../../src/types/decisionContext.types.ts";
import { ORCHESTRATOR_ISR_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

const MAX_COMBINED_CHARS = 8000;

export const IRREGULAR_SETTLEMENT_BLOCKER = "irregular_settlement_avoidance" as const;

export type IrregularSettlementDetection =
  | { hit: false }
  | {
      hit: true;
      primaryClass: OrchestratorIrregularSettlementClass;
      escalation_reason_code: (typeof ORCHESTRATOR_ISR_ESCALATION_REASON_CODES)[OrchestratorIrregularSettlementClass];
    };

function normalizeCombinedText(rawMessage: string, threadContextSnippet: string | undefined): string {
  const t = `${rawMessage}\n${threadContextSnippet ?? ""}`.trim().toLowerCase();
  const collapsed = t.replace(/\s+/g, " ");
  return collapsed.length > MAX_COMBINED_CHARS ? collapsed.slice(-MAX_COMBINED_CHARS) : collapsed;
}

/** Off-books / shadow accounting phrasing (standalone strong cue). */
function matchesOffBooks(text: string): boolean {
  return /\boff\s*[- ]?\s*the\s+books\b/.test(text) || /\boff\s+books\b/.test(text);
}

/** Cash-like settlement + VAT/tax avoidance language (both required). */
function matchesCashWithVatOrTaxAvoidance(text: string): boolean {
  const cashLike =
    /\b(?:in\s+)?cash\b/.test(text) ||
    /\bpay\s+(?:in\s+)?cash\b/.test(text) ||
    /\bpaid\s+in\s+cash\b/.test(text) ||
    /\benvelope\b/.test(text);
  if (!cashLike) return false;
  const avoidVatTax =
    /\bavoid\s+(?:the\s+)?(?:vat|value\s*added\s*tax|sales\s+tax|tax)\b/.test(text) ||
    /\b(?:vat|value\s*added\s*tax|sales\s+tax)\b[\s\S]{0,80}\b(?:avoid|evade|evading|evasion|without|sidestep)\b/.test(
      text,
    ) ||
    /\b(?:avoid|evade|evading|evasion|without|sidestep)\b[\s\S]{0,80}\b(?:vat|value\s*added\s*tax|sales\s+tax)\b/.test(
      text,
    ) ||
    /\bwithout\s+(?:charging\s+)?(?:vat|value\s*added\s*tax|sales\s+tax)\b/.test(text) ||
    (/\bno\s+vat\b/.test(text) && /\b(?:charge|pay|payment|commission|fee)\b/.test(text));
  return avoidVatTax;
}

/** Settlement outside normal invoicing (narrow). Exclude “pay off the invoice” / “write off …”. */
function matchesOutsideOrOffInvoice(text: string): boolean {
  if (/\boutside\s+(?:the\s+)?invoice\b/.test(text)) return true;
  if (/(?<!(?:pay|write|wrote|set|signed)\s)\boff\s+(?:the\s+)?invoice\b/.test(text)) return true;
  if (/\bnot\s+on\s+(?:the\s+)?invoice\b/.test(text)) return true;
  if (/\b(?:pay|paying|payment)\s+(?:us\s+)?privately\b/.test(text)) return true;
  if (/\bprivate(?:ly)?\s+(?:payment|pay)\b/.test(text)) return true;
  return false;
}

/**
 * Invoice / billing wording combined with hiding or restructuring tax visibility.
 * Conservative: requires invoice (or bill) near manipulation verbs and tax/VAT mention.
 */
function matchesInvoiceTaxVisibilityManipulation(text: string): boolean {
  const hasInvoice = /\binvoice\b/.test(text) || /\bbill(?:ing)?\b/.test(text);
  if (!hasInvoice) return false;
  const manip =
    /\b(?:hide|hiding|omit|split|separate|different|differently|lower|reduce|don'?t\s+show|do\s+not\s+show)\b/.test(
      text,
    );
  if (!manip) return false;
  return /\b(?:vat|value\s*added\s*tax|sales\s+tax|declared|taxable)\b/.test(text);
}

/** Under-reporting / declared-amount avoidance (narrow). */
function matchesDeclaredAmountAvoidance(text: string): boolean {
  return (
    /\bunder[- ]?report/.test(text) ||
    /\bunderreport/.test(text) ||
    /\blower\s+(?:the\s+)?(?:declared|taxable|reported)\b/.test(text)
  );
}

export function detectIrregularSettlementOrchestratorRequest(
  rawMessage: string,
  threadContextSnippet?: string,
): IrregularSettlementDetection {
  const text = normalizeCombinedText(rawMessage, threadContextSnippet);

  if (
    matchesOffBooks(text) ||
    matchesCashWithVatOrTaxAvoidance(text) ||
    matchesOutsideOrOffInvoice(text) ||
    matchesInvoiceTaxVisibilityManipulation(text) ||
    matchesDeclaredAmountAvoidance(text)
  ) {
    return {
      hit: true,
      primaryClass: "settlement_or_tax_avoidance_request",
      escalation_reason_code: ORCHESTRATOR_ISR_ESCALATION_REASON_CODES.settlement_or_tax_avoidance_request,
    };
  }
  return { hit: false };
}
