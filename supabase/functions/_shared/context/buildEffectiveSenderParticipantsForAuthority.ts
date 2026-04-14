/**
 * In-memory participant list used only to run {@link deriveInboundSenderAuthority} when
 * `thread_participants.is_sender` is missing but ingress email matches exactly one wedding-scoped
 * `contact_points` row.
 *
 * **Not a persistence model:** synthetic rows are never written to `thread_participants` and must
 * not be merged into `DecisionAudienceSnapshot.threadParticipants` — only authority derivation reads
 * the effective list.
 */
import type { ThreadParticipantAudienceRow } from "../../../../src/types/decisionContext.types.ts";

const SYNTHETIC_SENDER_ID_PREFIX = "authority_fallback_sender:" as const;

export function buildEffectiveSenderParticipantsForAuthority(
  threadParticipants: ThreadParticipantAudienceRow[],
  threadId: string,
  resolvedPersonId: string,
): ThreadParticipantAudienceRow[] {
  const existing = threadParticipants.find((p) => p.person_id === resolvedPersonId);
  if (existing) {
    return threadParticipants.map((p) =>
      p.person_id === resolvedPersonId ? { ...p, is_sender: true } : p,
    );
  }
  return [
    ...threadParticipants,
    {
      id: `${SYNTHETIC_SENDER_ID_PREFIX}${resolvedPersonId}`,
      person_id: resolvedPersonId,
      thread_id: threadId,
      visibility_role: "",
      is_cc: false,
      is_recipient: false,
      is_sender: true,
    },
  ];
}
