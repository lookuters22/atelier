import {
  extractFirstEmailFromAddressString,
  isLikelyNonReplyableSystemLocalPart,
  mailboxMatchesAnySelfIdentity,
  mergeSelfMailboxList,
  normalizeMailboxForComparison,
} from "./mailboxNormalize";

export type InboxMessageForReply = {
  direction: "in" | "out";
  sender: string;
};

export type ReplyableParticipantResult = {
  /** Original sender string to use in To (e.g. `Name <email>`). */
  displayTo: string;
  /** Normalized mailbox for comparison. */
  normalizedMailbox: string;
};

/**
 * From canonical thread messages (newest → oldest), pick the most recent replyable external participant.
 * Skips outbound rows (sender is operator). Skips self / +variants / obvious system addresses.
 *
 * **Send mail as:** Pass known studio aliases via `additionalSelfMailboxes` when the UI has them.
 * Otherwise only `connectedAccountEmail` is treated as self. The `gmail-send` Edge function remains
 * authoritative: it resolves full Gmail send-as identities and rejects self `To` even if the UI prefills wrong.
 */
export function findMostRecentReplyableExternalParticipant(
  messagesAsc: InboxMessageForReply[],
  connectedAccountEmail: string | null | undefined,
  additionalSelfMailboxes?: readonly string[] | null,
): ReplyableParticipantResult | null {
  const selfMailboxes = mergeSelfMailboxList(
    (connectedAccountEmail ?? "").trim(),
    additionalSelfMailboxes ?? [],
  );
  if (selfMailboxes.length === 0) return null;

  for (let i = messagesAsc.length - 1; i >= 0; i--) {
    const m = messagesAsc[i];
    if (!m || m.direction !== "in") continue;
    const display = (m.sender ?? "").trim();
    if (!display) continue;
    const extracted = extractFirstEmailFromAddressString(display);
    if (!extracted) continue;
    const at = extracted.lastIndexOf("@");
    const local = at > 0 ? extracted.slice(0, at) : extracted;
    if (isLikelyNonReplyableSystemLocalPart(local)) continue;
    if (mailboxMatchesAnySelfIdentity(extracted, selfMailboxes)) continue;
    return {
      displayTo: display,
      normalizedMailbox: normalizeMailboxForComparison(extracted),
    };
  }
  return null;
}
