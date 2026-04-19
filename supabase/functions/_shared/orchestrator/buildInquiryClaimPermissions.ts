/**
 * Deterministic **claim permission planner** for inquiry-stage orchestrator replies.
 * Produces a small contract: what Ana may confirm vs soft-confirm vs explore vs defer.
 *
 * Thread memory / inbound vibe must **not** upgrade permissions — only playbook, CRM-shaped gates,
 * and the inquiry reply plan (strategy) do.
 */
import type {
  DecisionContext,
  PlaybookRuleContextRow,
} from "../../../../src/types/decisionContext.types.ts";
import type {
  InquiryClaimPermissionMap,
  InquiryClaimPermissionLevel,
} from "../../../../src/types/inquiryClaimPermissions.types.ts";
import type { InquiryReplyPlan } from "../../../../src/types/inquiryReplyPlan.types.ts";
import {
  playbookExplicitAvailabilityConfirmation,
  playbookSupportsDestinationServices,
} from "./auditUnsupportedBusinessAssertions.ts";
import { buildUnknownPolicySignals } from "./commercialPolicySignals.ts";

export const INQUIRY_CLAIM_PERMISSIONS_SECTION_TITLE =
  "=== Claim permissions (authoritative for this turn) ===";

function playbookBlobFromRules(rules: PlaybookRuleContextRow[]): string {
  return rules
    .filter((r) => r.is_active !== false)
    .map((r) => `${r.topic ?? ""} ${r.instruction ?? ""}`)
    .join("\n")
    .toLowerCase();
}

function playbookDocumentsProposalProcess(blob: string): boolean {
  if (blob.length < 20) return false;
  return (
    /\bproposal\b/.test(blob) &&
    /\b(?:process|structure|outline|steps|typically|usually begin|start with|how we (?:shape|send)|walk through)\b/i.test(
      blob,
    )
  );
}

function playbookDocumentsDeliverableInclusions(blob: string): boolean {
  return (
    /\b(?:always )?include\b/i.test(blob) &&
    /\b(?:gallery|preview|album|film|analog|deliverable)\b/i.test(blob)
  );
}

export type BuildInquiryClaimPermissionsInput = {
  decisionContext: DecisionContext;
  playbookRules: PlaybookRuleContextRow[];
  inquiryReplyPlan: InquiryReplyPlan;
  rawMessage: string;
};

/**
 * Returns null outside inquiry stage — callers skip contract facts + contract audit.
 */
export function buildInquiryClaimPermissions(input: BuildInquiryClaimPermissionsInput): InquiryClaimPermissionMap {
  const { playbookRules, inquiryReplyPlan: plan, rawMessage } = input;
  const blob = playbookBlobFromRules(playbookRules);
  const activeCount = playbookRules.filter((r) => r.is_active !== false).length;

  const unknown = buildUnknownPolicySignals(playbookRules, rawMessage);
  const numericLockdown = unknown.some((s) => s.includes("NUMERIC_COMMERCIAL_POLICY_NO_PLAYBOOK_SNAPSHOT"));

  const availPlaybook = playbookExplicitAvailabilityConfirmation(blob);
  let availability: InquiryClaimPermissionLevel;
  if (!availPlaybook) {
    availability = "defer";
  } else if (plan.confirm_availability && plan.mention_booking_terms === "verified_specific") {
    availability = "confirm";
  } else if (plan.confirm_availability) {
    availability = "soft_confirm";
  } else {
    availability = "explore";
  }

  const destOk = playbookSupportsDestinationServices(blob);
  const destination_fit: InquiryClaimPermissionLevel = destOk ? "confirm" : "explore";
  const destination_logistics: InquiryClaimPermissionLevel = destOk ? "confirm" : "explore";

  let offering_fit: InquiryClaimPermissionLevel;
  if (numericLockdown || activeCount === 0) {
    offering_fit = "explore";
  } else {
    offering_fit = "soft_confirm";
  }

  const proposal_process: InquiryClaimPermissionLevel = playbookDocumentsProposalProcess(blob)
    ? "confirm"
    : "explore";

  const deliverable_inclusions: InquiryClaimPermissionLevel = playbookDocumentsDeliverableInclusions(blob)
    ? "confirm"
    : "explore";

  /**
   * Mirrors inquiry CTA + {@link InquiryReplyPlan#cta_intensity}: direct booking steer vs optional vs email-first.
   */
  let booking_next_step: InquiryClaimPermissionLevel;
  const concreteCta = plan.cta_type === "call" || plan.cta_type === "packages";
  if (!concreteCta) {
    booking_next_step = "explore";
  } else if (plan.cta_intensity === "direct") {
    booking_next_step = "confirm";
  } else if (plan.cta_intensity === "soft") {
    booking_next_step = "soft_confirm";
  } else {
    booking_next_step = "explore";
  }

  return {
    schemaVersion: 1,
    availability,
    destination_fit,
    destination_logistics,
    offering_fit,
    proposal_process,
    booking_next_step,
    deliverable_inclusions,
  };
}

export function formatClaimPermissionsForPersonaFacts(permissions: InquiryClaimPermissionMap): string {
  const lines = [
    INQUIRY_CLAIM_PERMISSIONS_SECTION_TITLE,
    "**Precedence:** This block is the **business-claim contract** for this email. It outranks warmth, thread vibe, or continuity—you are **not** deciding what is true; you are realizing these permission levels. Voice changes **phrasing inside** a level, never the level itself.",
    "",
    "Level meanings:",
    "- `confirm` — May state as settled studio fact (must still match Authoritative CRM / Verified policy where applicable).",
    "- `soft_confirm` — Cautious alignment only (e.g. “sounds aligned with what you described”, “something we can likely shape together”). **No** hard certainty: avoid “exactly”, “absolutely”, “we love to photograph”, “this is the kind we specialize in”, “core to how we work”.",
    "- `explore` — Discuss as possibility / talk through / shape in a proposal **without** presenting as existing studio policy or standard practice.",
    "- `defer` — Do **not** claim; acknowledge, check, or defer to call / contract / team.",
    "",
    "**Rules:** Do not upgrade a lower permission into a higher one. Do not treat `defer` as something you may state. Do not turn `explore` into confirmed studio truth. When `soft_confirm`, never sound like brochure certainty.",
    "",
    "Per-domain permissions (this turn):",
    `- availability: ${permissions.availability}`,
    `- destination_fit: ${permissions.destination_fit}`,
    `- destination_logistics: ${permissions.destination_logistics}`,
    `- offering_fit: ${permissions.offering_fit}`,
    `- proposal_process: ${permissions.proposal_process}`,
    `- booking_next_step: ${permissions.booking_next_step} (operational next-step / CTA strength — see level meanings above)`,
    `- deliverable_inclusions: ${permissions.deliverable_inclusions}`,
  ];
  return lines.join("\n");
}
