/**
 * Phase-1 inbound sender authority from structured thread + wedding graph data only.
 *
 * **Planner bucket:** Included alongside `client_primary` / `payer` in downstream *commercial-terms*
 * allow-lists as a **narrow proposal-safety approximation** — i.e. do not treat vendors, assistants,
 * or unresolved senders as if they can drive contract/payment changes unchallenged. This is **not**
 * a claim of universal contract authority for planners; later phases may split planner vs payer/client
 * for specific action types.
 */
import type {
  InboundSenderAuthorityBucket,
  InboundSenderAuthoritySnapshot,
  ThreadParticipantAudienceRow,
} from "../../../../src/types/decisionContext.types.ts";
import {
  classifyParticipantBucket,
  type WeddingPersonRoleRow,
} from "./resolveAudienceVisibility.ts";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/** Conservative hints for assistant / family-team (not vendors). */
const ASSISTANT_OR_TEAM_HINTS =
  /\b(assistant|aide|coordinator\s+assistant|moh|maid\s+of\s+honou?r|best\s+man|parent|mother|father|mom|dad|sibling|brother|sister|cousin|aunt|uncle|friend\s+of\s+the\s+couple)\b/i;

function mapToAuthorityBucket(
  partBucket: ReturnType<typeof classifyParticipantBucket>,
  sender: ThreadParticipantAudienceRow,
  wp: WeddingPersonRoleRow | undefined,
): InboundSenderAuthorityBucket {
  if (partBucket === "client_family") {
    if (wp?.is_payer === true) return "payer";
    return "client_primary";
  }
  if (partBucket === "planner") return "planner";
  if (partBucket === "vendor") return "vendor";

  if (partBucket === "unknown") {
    const combined = [
      normalize(sender.visibility_role),
      wp ? normalize(wp.role_label) : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (ASSISTANT_OR_TEAM_HINTS.test(combined)) {
      return "assistant_or_team";
    }
  }

  return "unknown";
}

export function deriveInboundSenderAuthority(
  threadParticipants: ThreadParticipantAudienceRow[],
  weddingPeopleByPersonId: Map<string, WeddingPersonRoleRow>,
  approvalContactPersonIds: string[],
): InboundSenderAuthoritySnapshot {
  const sender = threadParticipants.find((p) => p.is_sender);
  if (!sender) {
    return {
      bucket: "unknown",
      personId: null,
      isApprovalContact: false,
      source: "unresolved",
    };
  }

  const wp = weddingPeopleByPersonId.get(sender.person_id);
  const partBucket = classifyParticipantBucket(sender, wp);
  const bucket = mapToAuthorityBucket(partBucket, sender, wp);
  const isApprovalContact = approvalContactPersonIds.includes(sender.person_id);

  return {
    bucket,
    personId: sender.person_id,
    isApprovalContact,
    source: "thread_sender",
  };
}
