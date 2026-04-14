/**
 * Identity / entity routing Phase 2 — deterministic cues beyond DB-linked multi-wedding threads.
 * No LLM; conservative conjunctions only. When Phase 1 (`thread_weddings` 2+ ids) applies, this returns no hit.
 */
import type { OrchestratorIdentityEntityPhase2Class } from "../../../../src/types/decisionContext.types.ts";
import { ORCHESTRATOR_IE2_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";
import { deriveRegistrableDomainFromEmail } from "../identity/inboundSenderIdentity.ts";
import { isThreadWeddingIdentityAmbiguous } from "../context/threadWeddingIdentityAmbiguous.ts";

const MAX_COMBINED_CHARS = 8000;

export const IDENTITY_ENTITY_AMBIGUITY_BLOCKER = "identity_entity_ambiguity" as const;

export type IdentityEntityRoutingDetection =
  | { hit: false }
  | {
      hit: true;
      primaryClass: OrchestratorIdentityEntityPhase2Class;
      escalation_reason_code: (typeof ORCHESTRATOR_IE2_ESCALATION_REASON_CODES)[OrchestratorIdentityEntityPhase2Class];
    };

const CONSUMER_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "icloud.com",
  "live.com",
  "aol.com",
  "googlemail.com",
  "protonmail.com",
  "proton.me",
  "msn.com",
  "me.com",
]);

function normalizeCombinedText(rawMessage: string, threadContextSnippet: string | undefined): string {
  const t = `${rawMessage}\n${threadContextSnippet ?? ""}`.trim().toLowerCase();
  const collapsed = t.replace(/\s+/g, " ");
  return collapsed.length > MAX_COMBINED_CHARS ? collapsed.slice(-MAX_COMBINED_CHARS) : collapsed;
}

/**
 * `From name@domain` / `from x@y.z` at word boundary — extract registrable domain (last two labels min).
 */
function extractSenderDomainFromFromLine(text: string): string | null {
  const m = text.match(/\bfrom\s+[^\s<,@]+@([a-z0-9.-]+\.[a-z]{2,})\b/i);
  return m ? m[1].toLowerCase() : null;
}

function isNonConsumerDomain(domain: string): boolean {
  return !CONSUMER_EMAIL_DOMAINS.has(domain);
}

/**
 * Must co-occur with non-consumer From domain — "following up on" plus explicit business/third-party cues.
 * Not generic couple chat on a custom domain.
 */
function matchesB2bFollowUpLanguage(text: string): boolean {
  if (!/\bfollowing up on\b/.test(text)) return false;
  return (
    /\b(safari|package|\bpr\b|timelines?|press\b|vendor|agency|commission|referral|supplier|tour|itinerary|b2b|corporate|deadline|timeline)\b/.test(
      text,
    ) || /\bpackage\s+pr\b/.test(text)
  );
}

function matchesB2bCorporateSender(
  text: string,
  inboundSenderEmail: string | null | undefined,
): boolean {
  if (!matchesB2bFollowUpLanguage(text)) return false;

  const domainFromIngress =
    inboundSenderEmail != null && String(inboundSenderEmail).trim().length > 0
      ? deriveRegistrableDomainFromEmail(String(inboundSenderEmail))
      : null;
  if (domainFromIngress && isNonConsumerDomain(domainFromIngress)) {
    return true;
  }

  const domainFromBody = extractSenderDomainFromFromLine(text);
  if (domainFromBody && isNonConsumerDomain(domainFromBody)) {
    return true;
  }
  return false;
}

/** Text-only multiple booking / event contrast when CRM does not already list 2+ thread weddings. */
function matchesMultiBookingTextCues(text: string): boolean {
  if (/\bwedding in\b[\s\S]{0,120}\bvs\b[\s\S]{0,120}\bwedding in\b/i.test(text)) {
    return true;
  }
  // "our [place] wedding in [month] vs the [place] wedding in [month]" (stress test 2 shaped)
  if (
    /\bour\s+[a-z]+\s+wedding\s+in\s+[a-z]+[\s\S]{0,100}\bvs\b[\s\S]{0,100}\b(?:the\s+)?[a-z]+\s+wedding\s+in\s+[a-z]+/i.test(
      text,
    )
  ) {
    return true;
  }
  if (
    /\b(cambodia|italy|bali|france|greece|mexico|portugal|spain|thailand|vietnam|japan|morocco|india|australia|canada)\b[\s\S]{0,100}\bwedding\b[\s\S]{0,80}\bvs\b[\s\S]{0,100}\b(cambodia|italy|bali|france|greece|mexico|portugal|spain|thailand|vietnam|japan|morocco|india|australia|canada)\b[\s\S]{0,100}\bwedding\b/i.test(
      text,
    )
  ) {
    return true;
  }
  return false;
}

export type DetectIdentityEntityRoutingAmbiguityParams = {
  rawMessage: string;
  threadContextSnippet?: string;
  threadId: string | null;
  candidateWeddingIds?: string[];
  /** Channel ingress sender email when available (preferred over `From …@` in body text). */
  inboundSenderEmail?: string | null;
};

/**
 * Deterministic scan. Returns no hit when Phase 1 multi-wedding DB ambiguity already applies.
 */
export function detectIdentityEntityRoutingAmbiguity(
  params: DetectIdentityEntityRoutingAmbiguityParams,
): IdentityEntityRoutingDetection {
  const { rawMessage, threadContextSnippet, threadId, candidateWeddingIds = [], inboundSenderEmail } =
    params;

  if (isThreadWeddingIdentityAmbiguous({ threadId, candidateWeddingIds })) {
    return { hit: false };
  }

  const text = normalizeCombinedText(rawMessage, threadContextSnippet);

  if (matchesB2bCorporateSender(text, inboundSenderEmail)) {
    return {
      hit: true,
      primaryClass: "b2b_corporate_sender",
      escalation_reason_code: ORCHESTRATOR_IE2_ESCALATION_REASON_CODES.b2b_corporate_sender,
    };
  }

  if (matchesMultiBookingTextCues(text)) {
    return {
      hit: true,
      primaryClass: "multi_booking_text_cues",
      escalation_reason_code: ORCHESTRATOR_IE2_ESCALATION_REASON_CODES.multi_booking_text_cues,
    };
  }

  return { hit: false };
}
