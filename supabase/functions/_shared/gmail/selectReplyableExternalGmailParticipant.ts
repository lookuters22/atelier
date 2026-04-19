/**
 * Gmail reply recipient resolution for Edge workers — mirrors the intent of
 * `src/lib/inboxReplyRecipient.ts#findMostRecentReplyableExternalParticipant`, plus
 * requires a non-empty `provider_message_id` so replies can anchor to a real Gmail message.
 */
import {
  extractFirstEmailFromAddressString,
  isLikelyNonReplyableSystemLocalPart,
  mailboxMatchesAnySelfIdentity,
  normalizeMailboxForComparison,
} from "./mailboxNormalize.ts";

export type GmailThreadMessageForReplySelection = {
  id?: string;
  direction: string;
  sender: string | null;
  provider_message_id?: string | null;
};

export type ReplyableExternalGmailParticipantOk = {
  kind: "ok";
  /** Original `messages.sender` / RFC To display (e.g. `Name <email>`). */
  displayTo: string;
  normalizedMailbox: string;
  anchorProviderMessageId: string;
  sourceMessageId?: string;
};

export type ReplyableExternalGmailParticipantErr = {
  kind: "error";
  code: "no_replyable_external_recipient_found" | "missing_self_mailbox_identities";
  detail?: string;
};

export type ReplyableExternalGmailParticipantResult =
  | ReplyableExternalGmailParticipantOk
  | ReplyableExternalGmailParticipantErr;

/**
 * Walk newest → oldest (expects `messagesAsc` sorted by `sent_at` ascending).
 * Skips outbound, empty senders, unparseable addresses, system-like local parts,
 * any studio-owned mailbox in `selfMailboxes`, and inbound rows missing `provider_message_id`.
 */
export function selectReplyableExternalGmailParticipant(
  messagesAsc: GmailThreadMessageForReplySelection[],
  selfMailboxes: readonly string[],
): ReplyableExternalGmailParticipantResult {
  const identities = selfMailboxes.map((s) => String(s).trim()).filter(Boolean);
  if (identities.length === 0) {
    return {
      kind: "error",
      code: "missing_self_mailbox_identities",
      detail: "self_mailboxes_required_for_reply_selection",
    };
  }

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
    if (mailboxMatchesAnySelfIdentity(extracted, identities)) continue;
    const pid = typeof m.provider_message_id === "string" ? m.provider_message_id.trim() : "";
    if (!pid) continue;

    return {
      kind: "ok",
      displayTo: display,
      normalizedMailbox: normalizeMailboxForComparison(extracted),
      anchorProviderMessageId: pid,
      sourceMessageId: typeof m.id === "string" ? m.id : undefined,
    };
  }

  return {
    kind: "error",
    code: "no_replyable_external_recipient_found",
    detail: "no_inbound_from_external_with_provider_message_id",
  };
}
