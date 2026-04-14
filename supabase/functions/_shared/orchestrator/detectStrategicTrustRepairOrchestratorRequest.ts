/**
 * Deterministic **routing / safety** gate for **contradiction**, **expectation mismatch**, and
 * **credibility-risk** inbound text (prior statement vs current claim). Not sentiment analysis and
 * not a reputational judgment — same posture as ISR / CCM / SPD: route away from routine primary reply.
 *
 * **Distinct** from {@link detectNonCommercialOrchestratorRisk} (legal / artistic / PR lanes).
 */
import type { OrchestratorStrategicTrustRepairClass } from "../../../../src/types/decisionContext.types.ts";
import { ORCHESTRATOR_STR_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

const MAX_COMBINED_CHARS = 8000;

export const STRATEGIC_TRUST_REPAIR_BLOCKER = "strategic_trust_repair" as const;

export type StrategicTrustRepairDetection =
  | { hit: false }
  | {
      hit: true;
      primaryClass: OrchestratorStrategicTrustRepairClass;
      escalation_reason_code: (typeof ORCHESTRATOR_STR_ESCALATION_REASON_CODES)[OrchestratorStrategicTrustRepairClass];
    };

function normalizeCombinedText(rawMessage: string, threadContextSnippet: string | undefined): string {
  const t = `${rawMessage}\n${threadContextSnippet ?? ""}`.trim().toLowerCase();
  const collapsed = t.replace(/\s+/g, " ");
  return collapsed.length > MAX_COMBINED_CHARS ? collapsed.slice(-MAX_COMBINED_CHARS) : collapsed;
}

/** Prior communication or earlier state (not standalone “trust” sentiment). */
function hasPriorReference(text: string): boolean {
  return (
    /\b(you said|you've said|you told|you've told|we were told|we had been told|told us|they told us|said you were|said you couldn't)\b/.test(
      text,
    ) ||
    /\b(last time we (?:were )?told|last time you (?:said|told)|earlier you (?:said|told)|previously you (?:said|told))\b/.test(
      text,
    ) ||
    /\b(ana|he|she|they|we|it|someone|everyone|email|message) said\b/.test(text) ||
    /\b(last week|yesterday|last month|previously|earlier|last time)\b/.test(text)
  );
}

/** Explicit contradiction / mismatch language. */
function hasMismatchLexical(text: string): boolean {
  return (
    /\b(contradict|contradiction|contradicts|inconsistent|inconsistency|mixed messages?)\b/.test(text) ||
    /\b(which is accurate|what's accurate|whats accurate|doesn't match|does not match|didn't match|did not match)\b/.test(
      text,
    ) ||
    /\b(not what (?:we |I )?(?:were )?told|something different|a different story|two different)\b/.test(text) ||
    /\b(now you say|now suddenly|suddenly there is|suddenly you're)\b/.test(text)
  );
}

/** Earlier vs later framing (same message), e.g. last week … but today … */
function hasTemporalContrast(text: string): boolean {
  return (
    /\b(last week|yesterday|last month|previously|earlier|last time)\b[\s\S]{0,220}\b(but|however|yet)\b[\s\S]{0,140}\b(today|now|this email|the email says|your email)\b/.test(
      text,
    ) ||
    /\b(today|now)\b[\s\S]{0,120}\b(but|however)\b[\s\S]{0,220}\b(last week|yesterday|previously|earlier|last time)\b/.test(
      text,
    )
  );
}

/** Trust-affect only when paired with a temporal contrast (avoids bare “I'm confused”). */
function hasTrustAffectWithTemporalContrast(text: string): boolean {
  return (
    /\b(confused|misled|uncomfortable|feeling misled|doesn't feel right|does not feel right)\b/.test(text) &&
    hasTemporalContrast(text)
  );
}

/**
 * Availability / commitment reversal: fully booked vs exception — requires prior time/attribution
 * plus contrast or the booking+exception pair with a connector.
 */
function hasBookingExpectationReversal(text: string): boolean {
  if (!/\bfully booked\b/.test(text)) return false;
  const exceptionCue =
    /\b(make an exception|happy to (?:make an )?exception|happily\b[\s\S]{0,24}\bexception|sudden(?:ly)?\b[\s\S]{0,60}\bavailability|availability now|now (?:have )?availability|room for (?:us|our))\b/.test(
      text,
    );
  if (!exceptionCue) return false;
  return hasTemporalContrast(text) || /\bbut\b/.test(text);
}

export function detectStrategicTrustRepairOrchestratorRequest(
  rawMessage: string,
  threadContextSnippet?: string,
): StrategicTrustRepairDetection {
  const text = normalizeCombinedText(rawMessage, threadContextSnippet);

  if (!hasPriorReference(text)) {
    return { hit: false };
  }

  const mismatch =
    hasMismatchLexical(text) ||
    hasTrustAffectWithTemporalContrast(text) ||
    hasBookingExpectationReversal(text);

  if (!mismatch) {
    return { hit: false };
  }

  return {
    hit: true,
    primaryClass: "contradiction_or_expectation_repair_request",
    escalation_reason_code:
      ORCHESTRATOR_STR_ESCALATION_REASON_CODES.contradiction_or_expectation_repair_request,
  };
}
