/**
 * Deterministic visual / attachment verification requests for orchestrator proposals.
 * Runs after banking/compliance, before non-commercial risk. Does not OCR or inspect files.
 */
import type { OrchestratorVisualAssetVerificationClass } from "../../../../src/types/decisionContext.types.ts";
import { ORCHESTRATOR_VAV_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

const MAX_COMBINED_CHARS = 8000;

export const VISUAL_ASSET_VERIFICATION_BLOCKER = "visual_asset_verification" as const;

/**
 * Strict instructions for the optional hold candidate — acknowledgment and review-park only;
 * no spelling/layout/print-readiness confirmation.
 */
export const VISUAL_ASSET_VERIFICATION_HOLD_RATIONALE =
  "Approval-hold candidate only: acknowledge receipt and place the thread under visual review with human confirmation pending. The draft must not confirm spelling, layout, or print-readiness, and must not claim the attachment was inspected or reviewed.";

export type VisualAssetVerificationDetection =
  | { hit: false }
  | {
      hit: true;
      primaryClass: OrchestratorVisualAssetVerificationClass;
      escalation_reason_code: (typeof ORCHESTRATOR_VAV_ESCALATION_REASON_CODES)[OrchestratorVisualAssetVerificationClass];
    };

function normalizeCombinedText(rawMessage: string, threadContextSnippet: string | undefined): string {
  const t = `${rawMessage}\n${threadContextSnippet ?? ""}`.trim().toLowerCase();
  const collapsed = t.replace(/\s+/g, " ");
  return collapsed.length > MAX_COMBINED_CHARS ? collapsed.slice(-MAX_COMBINED_CHARS) : collapsed;
}

/** Strong layout / proof / design-review phrases — not generic "photo" or "album" praise. */
function matchesLayoutProofReview(text: string): boolean {
  return (
    /\balbum spread\b/.test(text) ||
    /\balbum cover mockup\b/.test(text) ||
    /\bmockup\s+pdf\b/.test(text) ||
    /\bmarked[- ]up proof\b/.test(text) ||
    /\bmarked[- ]up spread\b/.test(text) ||
    /\bproof for review\b/.test(text) ||
    /\bframe review\b/.test(text) ||
    /\bvisual proof\b/.test(text) ||
    /\bspread review\b/.test(text) ||
    /\blayout review\b/.test(text) ||
    /\bdesign proof\b/.test(text) ||
    /\bproof spread\b/.test(text) ||
    (/\bcanva\b/.test(text) && /\b(link|review|mockup|design|layout)\b/.test(text)) ||
    /\battached\b.*\bmockup\b/.test(text) ||
    /\breview the (?:mockup|proof|spread|layout|marked[- ]up)\b/.test(text) ||
    /\bcheck this (?:canva|layout|frame|visual)\b/.test(text) ||
    /\bvisual (?:proof|mockup|review)\b/.test(text)
  );
}

/**
 * Spelling / print / publication confirmation requires co-occurring visual-asset cues
 * (no standalone "confirm before print" without design/PDF/mockup context).
 */
function hasVisualAssetCue(text: string): boolean {
  return /\b(mockup|proof|pdf|cover|spread|layout|frame|canva|attached|album cover|design|visual|marked[- ]up|typo|spelling|dieline)\b/.test(
    text,
  );
}

function matchesPrePrintPublicationVerification(text: string): boolean {
  const asksConfirm =
    /\bconfirm\b.*\b(spelling|typo|name[s]?|text|copy)\b.*\b(print|printing|publication|publish|deliver|delivery)\b/.test(
      text,
    ) ||
    (/\bconfirm\b.*\b(print|printing|publication|publish|deliver)\b/.test(text) &&
      /\b(spelling|typo|name[s]?|text)\b/.test(text)) ||
    /\bconfirm\b.*\bbefore\s+(?:we\s+)?(?:print|publish|deliver)\b/.test(text);
  if (!asksConfirm) return false;
  return hasVisualAssetCue(text);
}

/**
 * Deterministic scan of inbound + optional thread context (bounded length).
 */
export function detectVisualAssetVerificationOrchestratorRequest(
  rawMessage: string,
  threadContextSnippet?: string,
): VisualAssetVerificationDetection {
  const text = normalizeCombinedText(rawMessage, threadContextSnippet);

  if (matchesLayoutProofReview(text)) {
    return {
      hit: true,
      primaryClass: "layout_proof_review",
      escalation_reason_code: ORCHESTRATOR_VAV_ESCALATION_REASON_CODES.layout_proof_review,
    };
  }
  if (matchesPrePrintPublicationVerification(text)) {
    return {
      hit: true,
      primaryClass: "pre_print_publication_verification",
      escalation_reason_code: ORCHESTRATOR_VAV_ESCALATION_REASON_CODES.pre_print_publication_verification,
    };
  }

  return { hit: false };
}
