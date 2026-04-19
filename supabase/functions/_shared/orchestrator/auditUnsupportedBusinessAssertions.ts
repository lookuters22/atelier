/**
 * Deterministic post-persona audit: strong business / availability claims in prose must be
 * supported by verified facts (playbook + CRM + business profile identity), not thread memory alone.
 *
 * Layers:
 * 1. **Explicit triggers** — known toxic phrases (absolutes, brochure hype).
 * 2. **Claim families** — paraphrases of settled studio truth (capability, process, logistics, availability).
 * 3. **Combo heuristic** — studio subject + certainty marker + business verb + scope term in one sentence,
 *    unless exploratory hedges are present.
 *
 * Exploratory hedges (`talk through`, `happy to discuss`, `in a proposal`, etc.) keep useful non-binding copy.
 */
import type { DecisionContext } from "../../../../src/types/decisionContext.types.ts";
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";

export const UNSUPPORTED_ASSERTION_VIOLATION_PREFIX = "unsupported_business_assertion:";

export type PersonaVerifiedGroundingBlob = {
  playbookBlobLc: string;
  verifiedFactsBlobLc: string;
};

export function buildPersonaVerifiedGroundingBlob(
  decisionContext: DecisionContext,
  playbookRules: PlaybookRuleContextRow[],
  studioIdentityExcerpt: string | null,
): PersonaVerifiedGroundingBlob {
  const active = playbookRules.filter((r) => r.is_active !== false);
  const playbookBlobLc = active
    .map((r) => `${r.topic ?? ""} ${r.instruction ?? ""}`)
    .join("\n")
    .toLowerCase();

  const snap = decisionContext.crmSnapshot ?? emptyCrmSnapshot();
  const crmBits = [
    snap.couple_names,
    snap.location,
    snap.wedding_date,
    snap.stage,
    snap.package_name,
  ]
    .filter((x) => typeof x === "string" && x.trim().length > 0)
    .map((x) => String(x).toLowerCase());

  const id = (studioIdentityExcerpt ?? "").toLowerCase();
  const verifiedFactsBlobLc = [...crmBits, id].join(" ").trim();

  return { playbookBlobLc, verifiedFactsBlobLc };
}

export function playbookExplicitAvailabilityConfirmation(playbookBlobLc: string): boolean {
  if (playbookBlobLc.length < 10) return false;
  return (
    /\bavailability\b.*\b(confirm|confirmed|verify|check|hold)\b/.test(playbookBlobLc) ||
    /\b(confirm|confirmed|verify)\b.*\b(availability|date|calendar)\b/.test(playbookBlobLc) ||
    /\bdate\b.*\b(confirmed|available)\b/.test(playbookBlobLc) ||
    /\bcalendar\b.*\b(confirm|confirmed|open|hold)\b/.test(playbookBlobLc) ||
    /\bwe\b.*\bconfirm\b.*\b(your\s+)?date\b/.test(playbookBlobLc)
  );
}

export function playbookSupportsDestinationServices(playbookBlobLc: string): boolean {
  const p = playbookBlobLc;
  if (p.length < 25) return false;
  return (
    (/\bdestination\b/.test(p) && /\b(photograph|photo|coverage|travel|package|wedding)\b/.test(p)) ||
    /\binternational\s+wedding\b/.test(p) ||
    /\btravel\s+(?:fee|included|covered|policy)\b/.test(p) ||
    (/\bphotograph\b/.test(p) && /\b(?:destination|abroad|international)\b/.test(p))
  );
}

/** Split into rough sentences / clauses for per-unit family checks. */
export function splitDraftIntoAuditUnits(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const parts = normalized.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [normalized];
}

/**
 * Exploratory / non-binding hedges: when present, we skip combo-heuristic hits and some family checks
 * for that unit (not absolute triggers like "we absolutely").
 */
function hasExploratoryHedge(unit: string): boolean {
  return /\b(?:talk through|walk through|happy to (?:discuss|talk|shape|explore)|glad to (?:discuss|talk)|shape (?:that )?with you|with you in a proposal|in a proposal\b|discuss how (?:that|it) could fit|could fit the day|might fit|if the date (?:is )?still open on our side|whether the date (?:is )?still open on our side|based on (?:the )?(?:scope|location)|scope and location|relation to scope|we can explore|we'd love to (?:discuss|hear|learn))\b/i.test(
    unit,
  );
}

/** Whole-unit allowlist: clearly soft, non-settled copy. */
function isPrimarilyExploratoryAllowlist(unit: string): boolean {
  const u = unit.trim();
  if (!u) return true;
  if (/^that sounds aligned with what you described\b/i.test(u)) return true;
  if (/^we can talk through\b/i.test(u)) return true;
  if (/\bwe'd be happy to (?:discuss|shape|talk)\b/i.test(u) && !/\b(?:usually|typically|always|specialize|include)\b/i.test(u)) return true;
  if (/\bfor destination work, we'd normally (?:talk through|discuss)\b/i.test(u)) return true;
  if (/\bif the date (?:is )?still open on our side\b/i.test(u)) return true;
  return false;
}

type Trigger = {
  id: string;
  re: RegExp;
  allowIfAnyInVerified?: (playbookLc: string, factsLc: string) => boolean;
};

const ALWAYS_UNGROUNDED_HYPE: Trigger[] = [
  { id: "heart_of_what_we_do", re: /\bat the heart of what we do\b/i },
  { id: "core_to_how_we_work", re: /\bcore to how we work\b/i },
  { id: "exactly_kind_of_work_we_love", re: /\bexactly the kind of work we love\b/i },
  {
    id: "this_is_exactly_the_kind",
    re: /\bthis is exactly the kind of\b[^.!?]{0,80}\b(we love|work)\b/i,
  },
  { id: "standard_for_us", re: /\bstandard for us\b/i },
  { id: "regularly_handle", re: /\bwe regularly (?:handle|do|photograph|shoot|cover)\b/i },
  {
    id: "always_include_offering",
    re: /\b(?:something |)we always (?:include|offer|provide|deliver)\b/i,
  },
  { id: "not_an_addon", re: /\bnot an add-on\b/i },
];

const ABSOLUTE_STUDIO_TRIGGERS: Trigger[] = [
  { id: "we_absolutely", re: /\bwe\s+absolutely\b/i, allowIfAnyInVerified: () => false },
  {
    id: "were_absolutely",
    re: /\bwe're absolutely\b|\bwe are absolutely\b/i,
    allowIfAnyInVerified: () => false,
  },
  { id: "i_absolutely", re: /\bI\s+absolutely\b/i, allowIfAnyInVerified: () => false },
  {
    id: "can_absolutely_accommodate",
    re: /\b(?:can|could)\s+absolutely\s+accommodate\b/i,
    allowIfAnyInVerified: () => false,
  },
  {
    id: "we_always_offering",
    re: /\bwe always\b[^.!?]{0,80}\b(?:photograph|shoot|cover|include|offer|deliver|structure|shape)\b/i,
    allowIfAnyInVerified: () => false,
  },
];

/** Concrete calendar / date-easy wording — blocked unless playbook documents explicit availability confirmation. */
const AVAILABILITY_TRIGGERS: Trigger[] = [
  { id: "well_within_availability", re: /\bwell within our availability\b/i },
  { id: "within_our_availability", re: /\bwithin our availability\b/i },
  {
    id: "we_are_available_for_date",
    re: /\bwe (?:are|were)\s+available (?:for|on)\s+(?:that|your|the|our)\b/i,
  },
  { id: "were_available_for_date", re: /\bwe're\s+available (?:for|on)\s+(?:that|your|the)\b/i },
  { id: "date_is_open", re: /\bthe date is open\b/i },
  { id: "your_date_is_open", re: /\byour date is open\b/i },
  { id: "accommodate_that_date", re: /\baccommodate that date\b/i },
  {
    id: "month_year_well_within",
    re: /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b[^.!?]{0,40}\b(?:is |are )?well within\b/i,
  },
  { id: "year_well_within_availability", re: /\b\d{4}\b[^.!?]{0,50}\bwell within our availability\b/i },
  { id: "no_problem_on_our_end", re: /\bno problem on our end\b/i },
  { id: "should_be_no_problem", re: /\b(?:should be|will be) no problem\b/i },
  {
    id: "date_no_problem",
    re: /\b(?:that |the )?date\b[^.!?]{0,30}\b(?:should be )?no problem\b/i,
  },
  {
    id: "accommodate_without_issue",
    re: /\baccommodate (?:this |that )?without issue\b|\bwithout issue on our end\b/i,
  },
  {
    id: "able_to_accommodate_without_issue",
    re: /\b(?:we(?:'d| would) be )?able to accommodate\b[^.!?]{0,40}\bwithout issue\b/i,
  },
  { id: "easy_on_our_end", re: /\beasy on our end\b|\bstraightforward on our end\b/i },
];

/**
 * Calendar / date-ease / “open on our side” concrete wording — **text only** (no playbook gate).
 * Used by inquiry claim-permission contract audit.
 */
export function detectConcreteAvailabilityAssertionText(emailDraft: string): boolean {
  const text = emailDraft.trim();
  if (!text) return false;
  for (const t of AVAILABILITY_TRIGGERS) {
    if (t.re.test(text)) return true;
  }
  return hasBareOpenOnOurSideClaim(text);
}

/** "Open on our side" as a settled fact — allowed when conditional ("if still open on our side"). */
export function hasBareOpenOnOurSideClaim(text: string): boolean {
  const re = /\b(?:still )?open on our side\b/gi;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    const before = text.slice(Math.max(0, i - 60), i);
    if (!/\bif\b/i.test(before)) return true;
  }
  return false;
}

/** Settled capability / fit — paraphrases of "this is what we do / specialize in". */
const FAMILY_CAPABILITY_FIT: Array<{ id: string; re: RegExp }> = [
  {
    id: "in_line_how_we_usually_work",
    re: /\b(?:very much )?in line with how we (?:usually|typically|often) work\b/i,
  },
  {
    id: "fit_kind_of_weddings_we_photograph",
    re: /\b(?:beautiful |great |perfect )?fit for the kind of weddings we (?:photograph|shoot|cover)\b/i,
  },
  {
    id: "celebration_we_specialize",
    re: /\b(?:the )?sort of celebration we (?:specialize|specialise)\b/i,
  },
  {
    id: "this_is_sort_we_specialize",
    re: /\bthis is (?:very much )?the sort of\b[^.!?]{0,60}\bwe (?:specialize|specialise)\b/i,
  },
  {
    id: "kind_of_work_we_specialize",
    re: /\bkind of (?:celebration|wedding|work) we (?:specialize|specialise)\b/i,
  },
  {
    id: "comfortable_incorporating",
    re: /\bwe(?:'re| are) (?:fully )?comfortable (?:building|incorporating|including)\b/i,
  },
  {
    id: "build_into_coverage",
    re: /\bbuild (?:this |that )?into (?:coverage|our coverage|the coverage)\b/i,
  },
  { id: "commonly_include", re: /\bsomething we commonly include\b/i },
  { id: "typically_offer", re: /\bsomething we (?:typically|usually) offer\b/i },
  { id: "within_our_scope_settled", re: /\b(?:very much )?within our scope\b/i },
  { id: "natural_fit_what_we_do", re: /\bnatural fit (?:for )?what we (?:do|offer)\b/i },
];

/** Settled process / proposal structure claims. */
const FAMILY_PROCESS_PROPOSAL: Array<{ id: string; re: RegExp }> = [
  { id: "natural_part_of_proposal", re: /\b(?:a )?natural part of (?:the )?proposal\b/i },
  { id: "would_be_natural_part", re: /\bwould be a natural part\b/i },
  {
    id: "normally_structure",
    re: /\bwe(?:'d| would) normally structure\b/i,
  },
  { id: "usually_structure_weddings", re: /\bwe usually structure\b[^.!?]{0,50}\bweddings?\b/i },
  { id: "dont_use_preset", re: /\bwe don't use preset\b/i },
  { id: "no_preset_structure", re: /\bno preset structure\b/i },
  { id: "usually_begin_with", re: /\bwe usually begin with\b/i },
  { id: "proposals_always_shaped", re: /\bour proposals are always\b/i },
  { id: "shape_proposals_this_way", re: /\bshape proposals (?:this|that) way\b/i },
];

/** Logistics / destination as settled studio practice. */
const FAMILY_LOGISTICS_DESTINATION: Array<{ id: string; re: RegExp }> = [
  { id: "handle_destination_logistics_regularly", re: /\bhandle destination logistics (?:regularly|often|frequently)\b/i },
  {
    id: "often_photograph_destination",
    re: /\bwe (?:often|frequently|regularly) photograph\b[^.!?]{0,40}\bdestination\b/i,
  },
  {
    id: "destination_weddings_outside",
    re: /\bdestination weddings outside\b/i,
  },
  {
    id: "international_work_frequently",
    re: /\binternational work is something we do (?:frequently|often|regularly)\b/i,
  },
  {
    id: "photograph_outside_serbia",
    re: /\bphotograph\b[^.!?]{0,50}\boutside serbia\b/i,
  },
  /** "We'd structure travel" as settled — but not "we'd normally talk through travel" (hedge) */
  {
    id: "we_structure_travel_around",
    re: /\bwe(?:'ll| will|'d| would) structure (?:travel|logistics) around\b/i,
  },
];

/** Combo: studio + certainty + action + scope in one unit — settled-truth shape. */
const RE_STUDIO_SUBJECT = /\b(?:we|we're|we are|our team|I|I'm|I am)\b/i;
const RE_CERTAINTY_MARKERS =
  /\b(?:very much|usually|typically|always|regularly|naturally|fully|definitely|commonly|frequently|often|standard|part of our|built into our)\b/i;
const RE_BUSINESS_ACTION =
  /\b(?:specialize|specialise|offer|handle|structure|photograph|shoot|cover|accommodate|incorporat|include|deliver)\b/i;
const RE_SCOPE_TERMS =
  /\b(?:destination|international|abroad|logistics|travel|proposal|proposals|coverage|analog|gallery|preview|wedding|celebration|serbia|availability|calendar|smaller weddings)\b/i;

function comboSettledTruthHeuristic(unit: string): boolean {
  if (hasExploratoryHedge(unit) || isPrimarilyExploratoryAllowlist(unit)) return false;
  if (!RE_STUDIO_SUBJECT.test(unit)) return false;
  if (!RE_CERTAINTY_MARKERS.test(unit)) return false;
  if (!RE_BUSINESS_ACTION.test(unit)) return false;
  if (!RE_SCOPE_TERMS.test(unit)) return false;
  /** Avoid flagging short pleasantries */
  if (unit.length < 40) return false;
  return true;
}

function pushFamilyViolations(
  violations: string[],
  units: string[],
  families: Array<{ id: string; re: RegExp }>,
  message: string,
  skipUnit: (u: string) => boolean,
) {
  for (const unit of units) {
    if (skipUnit(unit)) continue;
    for (const { id, re } of families) {
      if (re.test(unit)) {
        violations.push(`${UNSUPPORTED_ASSERTION_VIOLATION_PREFIX}${id}: ${message}`);
      }
    }
  }
}

export function auditUnsupportedBusinessAssertions(
  emailDraft: string,
  grounding: PersonaVerifiedGroundingBlob,
): string[] {
  const text = emailDraft.trim();
  if (!text) return [];

  const { playbookBlobLc, verifiedFactsBlobLc } = grounding;
  const violations: string[] = [];
  const units = splitDraftIntoAuditUnits(text);

  const skipForFamilies = (u: string) =>
    isPrimarilyExploratoryAllowlist(u) || (hasExploratoryHedge(u) && !/\b(?:specialize|specialise|usually structure|commonly include|within our scope)\b/i.test(u));

  for (const t of ALWAYS_UNGROUNDED_HYPE) {
    if (t.re.test(text)) {
      violations.push(
        `${UNSUPPORTED_ASSERTION_VIOLATION_PREFIX}${t.id}: phrasing is strong studio-positioning not grounded in verified playbook/CRM — soften or remove.`,
      );
    }
  }

  for (const t of ABSOLUTE_STUDIO_TRIGGERS) {
    if (t.re.test(text)) {
      const allowed = t.allowIfAnyInVerified?.(playbookBlobLc, verifiedFactsBlobLc) ?? false;
      if (!allowed) {
        violations.push(
          `${UNSUPPORTED_ASSERTION_VIOLATION_PREFIX}${t.id}: absolute / settled studio claim in prose without matching verified policy — hedge (e.g. talk through in a proposal) or remove.`,
        );
      }
    }
  }

  const availOk = playbookExplicitAvailabilityConfirmation(playbookBlobLc);
  if (!availOk) {
    for (const t of AVAILABILITY_TRIGGERS) {
      if (t.re.test(text)) {
        violations.push(
          `${UNSUPPORTED_ASSERTION_VIOLATION_PREFIX}${t.id}: concrete availability / date-ease claim without explicit availability confirmation in verified playbook — use exploratory phrasing instead.`,
        );
      }
    }
    if (hasBareOpenOnOurSideClaim(text)) {
      violations.push(
        `${UNSUPPORTED_ASSERTION_VIOLATION_PREFIX}open_on_our_side: calendar/open claim on our side without verified availability confirmation — use conditional/exploratory wording (e.g. if the date is still open on our side).`,
      );
    }
  }

  pushFamilyViolations(
    violations,
    units,
    FAMILY_CAPABILITY_FIT,
    "settled capability/fit claim — use exploratory language unless playbook/CRM supports it.",
    skipForFamilies,
  );

  pushFamilyViolations(
    violations,
    units,
    FAMILY_PROCESS_PROPOSAL,
    "settled process/proposal claim — hedge (e.g. shape with them in a proposal) unless verified.",
    skipForFamilies,
  );

  const destOk = playbookSupportsDestinationServices(playbookBlobLc);
  if (!destOk) {
    pushFamilyViolations(
      violations,
      units,
      FAMILY_LOGISTICS_DESTINATION,
      "settled destination/logistics practice claim without verified destination/travel policy — soften.",
      skipForFamilies,
    );
  }

  for (const unit of units) {
    if (comboSettledTruthHeuristic(unit)) {
      violations.push(
        `${UNSUPPORTED_ASSERTION_VIOLATION_PREFIX}family_combo_settled_truth: sentence reads like settled studio practice (we + certainty + offering verb + scope) without exploratory hedge — soften unless verified.`,
      );
      break;
    }
  }

  if (
    /\bphotograph\b/i.test(text) &&
    /\bdestination\b/i.test(text) &&
    /\b(?:we|I)\b/i.test(text) &&
    /\b(absolutely|certainly|definitely|always|love to)\b/i.test(text)
  ) {
    if (!playbookSupportsDestinationServices(playbookBlobLc)) {
      violations.push(
        `${UNSUPPORTED_ASSERTION_VIOLATION_PREFIX}destination_capability_hype: firm destination / coverage claim without verified offering context — soften.`,
      );
    }
  }

  return [...new Set(violations)];
}
