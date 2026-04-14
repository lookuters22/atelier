/**
 * Bounded multi-actor authority refinement (V3) — deterministic markers for planner vs payer vs signer
 * conflicts on high-signal logistical/scope asks. Not a general NLP authorization engine.
 *
 * **Current-turn only:** planner/payer triggers are evaluated on `rawMessage` alone so historical
 * thread snippets cannot smear intent across turns.
 */
import type {
  DecisionAudienceSnapshot,
  InboundSenderAuthoritySnapshot,
  OrchestratorAuthorityPolicyClass,
} from "../../../../src/types/decisionContext.types.ts";
import { ORCHESTRATOR_AP1_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

export type AuthorityMemoryRow = {
  type: string;
  title: string;
  summary: string;
  /** When present (orchestrator path), used for verify-note pattern scan only — not forwarded to persona. */
  full_content?: string;
};

/**
 * True when an approval-contact person appears on `threadParticipants` and is **not** the inbound
 * sender — i.e. they are on-thread for visibility/recipients but did not author this message.
 */
export function approvalContactNonSenderOnThread(audience: DecisionAudienceSnapshot): boolean {
  if (audience.approvalContactPersonIds.length === 0) return false;
  const ac = new Set(audience.approvalContactPersonIds);
  for (const p of audience.threadParticipants) {
    if (ac.has(p.person_id) && !p.is_sender) return true;
  }
  return false;
}

/** Timeline / logistics topic + material reduction (not vague “we’re running late”). */
export function matchesPlannerTimelineMaterialReductionIntent(text: string): boolean {
  const t = text.toLowerCase();
  const topic =
    /\b(timeline|day\s*-?\s*of|schedule|ceremony|portrait|couple\s+portrait|getting\s+ready|pre-ceremony|photo\s+block|coverage\s+block)\b/.test(
      t,
    );
  if (!topic) return false;
  const reduction =
    /\b(cut|cuts|cutting|reduc(?:e|ing|ed)|shrink|shorten|trim|trimming|narrow)\b/.test(t) ||
    /\bfrom\s+\d+\s*(?:min|minutes?)\s+to\s+\d+/.test(t) ||
    /\b\d+\s*(?:min|minutes?)\s+to\s+\d+/.test(t) ||
    /\bfewer\s+minutes\b/.test(t) ||
    /\bless\s+time\b/.test(t) ||
    /\bdrop(ped|ping)?\b/.test(t);
  return reduction;
}

/** Paid scope / hours / fee confirmation asks (payer-not-signer slice). */
export function matchesPaidScopeOrCoverageIncreaseIntent(text: string): boolean {
  const t = text.toLowerCase();
  if (
    /\b(?:extra|additional|add(?:ed)?|more)\s+(?:hour|hours|coverage)\b/.test(t) ||
    /\badd\s*-?\s*on\s+(?:hour|hours|coverage|fee|fees)\b/.test(t) ||
    /\bscope\s+(?:upgrade|extension|increase|add)\b/.test(t) ||
    /\bpackage\s+(?:upgrade|add(?:ed)?)\b/.test(t) ||
    (/\bconfirm\b/.test(t) && /\$\s*\d+/.test(t)) ||
    (/\$\s*\d+/.test(t) && /\b(?:add|extra|hour|hours|fee|addon|add-on)\b/.test(t))
  ) {
    return true;
  }
  return false;
}

/**
 * Verify-note / case memory indicates payer or non-signer actors may not bind scope/pricing alone.
 */
export function verifyMemoryNarrowsPayerOrScopeAuthority(memories: readonly AuthorityMemoryRow[]): boolean {
  for (const m of memories) {
    const blob = [m.type, m.title, m.summary, m.full_content ?? ""].join("\n").toLowerCase();
    if (
      /\bpayer\s+status\s+does\s+not\s+(authorize|approve)\b/.test(blob) ||
      (/\b(?:approval\s+contact|change\s+order|signed\s+change)\b/.test(blob) &&
        /\b(scope|hours|add-on|fee|pricing|coverage)\b/.test(blob)) ||
      /\b(?:must|must\s+be)\s+(?:approved|confirmed)\s+by\b/.test(blob) ||
      /\bwithout\s+(?:written\s+)?(?:bride|groom|couple|signer)\b/.test(blob) ||
      /\bmob\b.*\b(?:do\s+not|does\s+not)\s+authorize\b/.test(blob) ||
      /\bdo\s+not\s+let\b.*\b(add|anything|scope)\b/.test(blob)
    ) {
      return true;
    }
  }
  return false;
}

export type MultiActorAuthorityRefinementResult =
  | { hit: false }
  | {
      hit: true;
      primaryClass: OrchestratorAuthorityPolicyClass;
      escalation_reason_code: (typeof ORCHESTRATOR_AP1_ESCALATION_REASON_CODES)[OrchestratorAuthorityPolicyClass];
      /** Grounded lines for `OrchestratorContextInjection.action_constraints` (persona must not infer authority). */
      injectionConstraints: string[];
    };

export function detectMultiActorAuthorityRefinement(params: {
  /** Current inbound turn only — used for planner/payer trigger patterns. */
  rawMessage: string;
  authority: InboundSenderAuthoritySnapshot;
  selectedMemories: readonly AuthorityMemoryRow[];
  /** Structured audience; drives approval-contact loop-in (no message-body “cc” parsing). */
  audience: DecisionAudienceSnapshot;
}): MultiActorAuthorityRefinementResult {
  const { rawMessage, authority, selectedMemories, audience } = params;
  const currentTurn = rawMessage.trim();
  const memoryRestricts = verifyMemoryNarrowsPayerOrScopeAuthority(selectedMemories);
  const signerPresentNotSender = approvalContactNonSenderOnThread(audience);

  if (authority.bucket === "planner" && matchesPlannerTimelineMaterialReductionIntent(currentTurn)) {
    const audienceLine = signerPresentNotSender
      ? " Structured audience: an approval contact on this thread is present but is not the sender — explicitly address them (and/or the couple) to confirm before treating the schedule change as final; on-thread visibility is not approval."
      : "";
    return {
      hit: true,
      primaryClass: "multi_actor_planner_timeline_reduction_signer",
      escalation_reason_code:
        ORCHESTRATOR_AP1_ESCALATION_REASON_CODES.multi_actor_planner_timeline_reduction_signer,
      injectionConstraints: [
        `Multi-actor authority (planner schedule change): a planner proposed a timeline/schedule adjustment that reduces or materially changes couple/creative time — do not treat this as final client approval or as binding on the contract.${audienceLine} Acknowledge the planner's note; explicitly ask the couple and/or the named approval contact (signer) to confirm before updating the CRM file or photographer team brief.`,
      ],
    };
  }

  const payerScopeIntent =
    authority.bucket === "payer" &&
    matchesPaidScopeOrCoverageIncreaseIntent(currentTurn) &&
    !authority.isApprovalContact;

  if (payerScopeIntent) {
    const memLine = memoryRestricts
      ? " Loaded verify-note memory restricts payer/non-signer authority for scope or pricing changes — treat that as higher-priority operational guidance than payer status alone."
      : "";
    return {
      hit: true,
      primaryClass: "multi_actor_payer_scope_spend_signer",
      escalation_reason_code:
        ORCHESTRATOR_AP1_ESCALATION_REASON_CODES.multi_actor_payer_scope_spend_signer,
      injectionConstraints: [
        `Multi-actor authority (payer scope/spend): the sender is a payer but not the binding approval contact for this request — do not auto-confirm add-on hours, fees, or scope upgrades.${memLine} Require signer/approval-contact confirmation before treating pricing or scope as agreed.`,
      ],
    };
  }

  return { hit: false };
}
