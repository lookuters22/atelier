import type {
  AudienceVisibilityClass,
  DecisionAudienceSnapshot,
  ThreadParticipantAudienceRow,
} from "../../../../src/types/decisionContext.types.ts";

export type WeddingPersonRoleRow = {
  person_id: string;
  role_label: string;
  is_payer: boolean;
};

/** Single-character buckets for outgoing recipient classification. */
export type ParticipantAudienceBucket = "planner" | "client_family" | "vendor" | "unknown";

const REDACTION_FALSE_CLASSES: ReadonlySet<AudienceVisibilityClass> = new Set([
  "planner_only",
  "internal_only",
]);

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Classify a thread participant using `wedding_people` when present, else `visibility_role` text.
 * Payer is never treated as planner-safe for commission-style facts (per V3 RBAC plan).
 */
export function classifyParticipantBucket(
  participant: ThreadParticipantAudienceRow,
  wp: WeddingPersonRoleRow | undefined,
): ParticipantAudienceBucket {
  const combined = [
    normalize(participant.visibility_role),
    wp ? normalize(wp.role_label) : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (wp?.is_payer === true) {
    return "client_family";
  }

  const plannerHints =
    /\b(planner|coordinator|wedding\s*planner|day\s*of|studio|photographer|internal|staff|manager|owner)\b/i;
  const clientHints =
    /\b(couple|client|bride|groom|family|guest|fianc[eé])\b/i;
  const vendorHints = /\b(vendor|venue|florist|caterer|dj|band|supplier)\b/i;

  if (plannerHints.test(combined) && !clientHints.test(combined)) {
    return "planner";
  }
  if (vendorHints.test(combined)) {
    return "vendor";
  }
  if (clientHints.test(combined)) {
    return "client_family";
  }

  if (wp) {
    const rl = normalize(wp.role_label);
    if (plannerHints.test(rl)) return "planner";
    if (vendorHints.test(rl)) return "vendor";
    if (clientHints.test(rl)) return "client_family";
  }

  return "unknown";
}

/**
 * Outgoing recipients: To/CC on the thread (not the sender of the last message).
 */
export function outgoingRecipientParticipants(
  threadParticipants: ThreadParticipantAudienceRow[],
): ThreadParticipantAudienceRow[] {
  return threadParticipants.filter((p) => (p.is_recipient || p.is_cc) && !p.is_sender);
}

export function resolveAudienceVisibility(
  threadParticipants: ThreadParticipantAudienceRow[],
  weddingPeopleByPersonId: Map<string, WeddingPersonRoleRow>,
): Pick<
  DecisionAudienceSnapshot,
  "visibilityClass" | "clientVisibleForPrivateCommercialRedaction"
> {
  const outgoing = outgoingRecipientParticipants(threadParticipants);

  if (outgoing.length === 0) {
    return {
      visibilityClass: "client_visible",
      clientVisibleForPrivateCommercialRedaction: true,
    };
  }

  const buckets = outgoing.map((p) =>
    classifyParticipantBucket(p, weddingPeopleByPersonId.get(p.person_id)),
  );

  const hasClient =
    buckets.some((b) => b === "client_family" || b === "unknown");
  const hasPlanner = buckets.some((b) => b === "planner");
  const hasVendor = buckets.some((b) => b === "vendor");

  let visibilityClass: AudienceVisibilityClass;

  if (hasClient && hasPlanner) {
    visibilityClass = "mixed_audience";
  } else if (hasClient) {
    visibilityClass = "client_visible";
  } else if (hasPlanner && hasVendor) {
    visibilityClass = "mixed_audience";
  } else if (hasPlanner && !hasVendor) {
    visibilityClass = "planner_only";
  } else if (hasVendor && !hasPlanner) {
    visibilityClass = "vendor_only";
  } else {
    visibilityClass = "internal_only";
  }

  const clientVisibleForPrivateCommercialRedaction = !REDACTION_FALSE_CLASSES.has(visibilityClass);

  return { visibilityClass, clientVisibleForPrivateCommercialRedaction };
}

export function applyVisibilityClassOverride(
  base: Pick<
    DecisionAudienceSnapshot,
    "visibilityClass" | "clientVisibleForPrivateCommercialRedaction"
  >,
  override: AudienceVisibilityClass,
): Pick<
  DecisionAudienceSnapshot,
  "visibilityClass" | "clientVisibleForPrivateCommercialRedaction"
> {
  return {
    visibilityClass: override,
    clientVisibleForPrivateCommercialRedaction: !REDACTION_FALSE_CLASSES.has(override),
  };
}
