/**
 * Deterministic **routing / safety** gate for **client_primary** / **payer** inbound that matches
 * narrow patterns for **large** commercial concession asks (hard caps, big reductions, bulk+price,
 * trim-package-to-budget language).
 *
 * **Not** a legal or pricing decision — does not approve discounts or validate quotes.
 * **Distinct** from {@link detectAuthorityPolicyRisk}: AP1 is “wrong role”; CCM is “right sender,
 * magnitude too high for routine automated client reply.”
 *
 * Keep disjoint from irregular settlement (ISR) and banking compliance (BC); orchestrator runs
 * those branches before this detector’s branch.
 */
import type {
  InboundSenderAuthoritySnapshot,
  OrchestratorHighMagnitudeClientConcessionClass,
} from "../../../../src/types/decisionContext.types.ts";
import { ORCHESTRATOR_CCM_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

const MAX_COMBINED_CHARS = 8000;

export const HIGH_MAGNITUDE_CLIENT_CONCESSION_BLOCKER = "high_magnitude_client_concession" as const;

const CLIENT_OR_PAYER = new Set<InboundSenderAuthoritySnapshot["bucket"]>(["client_primary", "payer"]);

export type HighMagnitudeClientConcessionDetection =
  | { hit: false }
  | {
      hit: true;
      primaryClass: OrchestratorHighMagnitudeClientConcessionClass;
      escalation_reason_code: (typeof ORCHESTRATOR_CCM_ESCALATION_REASON_CODES)[OrchestratorHighMagnitudeClientConcessionClass];
    };

function normalizeCombinedText(rawMessage: string, threadContextSnippet: string | undefined): string {
  const t = `${rawMessage}\n${threadContextSnippet ?? ""}`.trim().toLowerCase();
  const collapsed = t.replace(/\s+/g, " ");
  return collapsed.length > MAX_COMBINED_CHARS ? collapsed.slice(-MAX_COMBINED_CHARS) : collapsed;
}

function parseNumericTokens(text: string): number[] {
  const out: number[] = [];
  const sym = /(?:€|\$|£)\s*([\d][\d.,]*)/g;
  let m: RegExpExecArray | null;
  while ((m = sym.exec(text)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isNaN(n) && n > 0) out.push(n);
  }
  const kStyle = /\b(\d[\d.,]*)\s*k\b/gi;
  while ((m = kStyle.exec(text)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, "")) * 1000;
    if (!Number.isNaN(n) && n > 0) out.push(n);
  }
  return out;
}

/** st7-shaped: reduce to target + cannot approve higher anchor (two currency amounts). */
function matchesReduceToWithRejectAnchor(text: string): boolean {
  if (!/\breduc(?:e|ing)\s+the\s+(?:price|package|quote|fee)\s+to\b/.test(text)) return false;
  if (!/\b(?:cannot|can't)\s+approve\b/.test(text)) return false;
  const nums = parseNumericTokens(text);
  if (nums.length < 2) return false;
  const sorted = [...nums].sort((a, b) => a - b);
  /** Require meaningful spread (e.g. 18k vs 21.7k). */
  return sorted[sorted.length - 1] / sorted[0] >= 1.1;
}

/** Explicit drop from one stated price to another (same message). */
function matchesFromPriceToPriceDrop(text: string): boolean {
  if (!/\bfrom\b[\s\S]{0,120}\bto\b/.test(text)) return false;
  const nums = parseNumericTokens(text);
  if (nums.length < 2) return false;
  const hi = Math.max(...nums);
  const lo = Math.min(...nums);
  if (lo <= 0 || hi <= lo) return false;
  return (hi - lo) / hi >= 0.12;
}

/** Hard cap / max budget + amount. */
function matchesHardCapOrMaxBudget(text: string): boolean {
  const capPhrase =
    /\b(?:hard\s+cap|maximum\s+(?:we|i)\s+can\s+pay|max(?:imum)?\s+(?:is|we|i)\s+can|budget\s+(?:is\s+)?(?:only|just|max)|can\s+only\s+pay|i\s+can\s+only\s+(?:do|pay)|all[- ]in\s+(?:max|cap))\b/.test(
      text,
    );
  if (!capPhrase) return false;
  return parseNumericTokens(text).length >= 1;
}

/** Large percentage discount ask (floor 20%). */
function matchesLargePercentageOff(text: string): boolean {
  const pct = /\b(\d{2,})\s*%\s*(?:off|discount|reduction)\b/.exec(text);
  if (pct) return parseInt(pct[1], 10) >= 20;
  const atLeast = /\b(?:at\s+least|minimum)\s+(\d{2,})\s*%\b/.exec(text);
  if (atLeast) return parseInt(atLeast[1], 10) >= 20;
  return false;
}

/** Trim / scale package to fit budget (conjunction). */
function matchesPackageTrimToBudget(text: string): boolean {
  const trim =
    /\b(?:reduce|trim|scale\s+down|cut\s+down)\s+(?:the\s+)?package\b/.test(text) ||
    /\bpackage\b[\s\S]{0,80}\b(?:fit|match)\b[\s\S]{0,60}\b(?:budget|cap|price|afford)\b/.test(text);
  if (!trim) return false;
  return (
    /\b(?:budget|cap|price|afford|only|€|\$|£)\b/.test(text) && parseNumericTokens(text).length >= 1
  );
}

/** st4-shaped: volume/bulk + product + price negotiation. */
function matchesBulkOrderPricePush(text: string): boolean {
  const volume =
    /\b(?:three|four|five|six|3|4|5|6|multiple|bulk|jumbo)\b/.test(text) &&
    /\b(?:album|albums|reflections|order|units)\b/.test(text);
  if (!volume) return false;
  return /\b(?:work\s+on\s+the\s+price|discount|better\s+price|lower\s+price|price\s+point)\b/.test(
    text,
  );
}

export type DetectHighMagnitudeClientConcessionParams = {
  rawMessage: string;
  threadContextSnippet?: string;
  authority: InboundSenderAuthoritySnapshot;
};

export function detectHighMagnitudeClientConcessionOrchestratorRequest(
  params: DetectHighMagnitudeClientConcessionParams,
): HighMagnitudeClientConcessionDetection {
  const { rawMessage, threadContextSnippet, authority } = params;
  if (!CLIENT_OR_PAYER.has(authority.bucket)) {
    return { hit: false };
  }

  const text = normalizeCombinedText(rawMessage, threadContextSnippet);

  if (
    matchesReduceToWithRejectAnchor(text) ||
    matchesFromPriceToPriceDrop(text) ||
    matchesHardCapOrMaxBudget(text) ||
    matchesLargePercentageOff(text) ||
    matchesPackageTrimToBudget(text) ||
    matchesBulkOrderPricePush(text)
  ) {
    return {
      hit: true,
      primaryClass: "high_magnitude_client_concession_request",
      escalation_reason_code:
        ORCHESTRATOR_CCM_ESCALATION_REASON_CODES.high_magnitude_client_concession_request,
    };
  }
  return { hit: false };
}
