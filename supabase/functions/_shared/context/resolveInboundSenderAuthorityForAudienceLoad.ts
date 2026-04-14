import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  InboundSenderAuthoritySnapshot,
  ThreadParticipantAudienceRow,
} from "../../../../src/types/decisionContext.types.ts";
import { extractBareEmailFromIngress } from "../identity/inboundSenderIdentity.ts";
import { buildEffectiveSenderParticipantsForAuthority } from "./buildEffectiveSenderParticipantsForAuthority.ts";
import { deriveInboundSenderAuthority } from "./deriveInboundSenderAuthority.ts";
import { fetchUniqueWeddingPersonIdForNormalizedEmail } from "./fetchUniqueWeddingPersonIdForNormalizedEmail.ts";
import type { WeddingPersonRoleRow } from "./resolveAudienceVisibility.ts";

/**
 * When `thread_participants.is_sender` is missing, optionally derive authority from an exact
 * `contact_points` email match scoped to persons on the effective wedding. Audience snapshot always
 * uses real DB `threadParticipants`; synthetic rows exist only inside `deriveInboundSenderAuthority`
 * when this path promotes or appends an authority-only sender row.
 */
export async function resolveInboundSenderAuthorityForAudienceLoad(
  supabase: SupabaseClient,
  photographerId: string,
  effectiveWeddingId: string | null,
  threadId: string,
  threadParticipants: ThreadParticipantAudienceRow[],
  weddingPeopleByPersonId: Map<string, WeddingPersonRoleRow>,
  approvalContactPersonIds: string[],
  inboundSenderEmailFromIngress: string | null | undefined,
): Promise<InboundSenderAuthoritySnapshot> {
  const base = deriveInboundSenderAuthority(
    threadParticipants,
    weddingPeopleByPersonId,
    approvalContactPersonIds,
  );

  if (threadParticipants.some((p) => p.is_sender)) {
    return base;
  }

  const raw =
    inboundSenderEmailFromIngress != null ? String(inboundSenderEmailFromIngress).trim() : "";
  const normalized = raw.length > 0 ? extractBareEmailFromIngress(raw) : null;

  if (!normalized || !effectiveWeddingId || weddingPeopleByPersonId.size === 0) {
    return base;
  }

  const weddingPersonIds = [...weddingPeopleByPersonId.keys()];
  const resolvedPersonId = await fetchUniqueWeddingPersonIdForNormalizedEmail(
    supabase,
    photographerId,
    normalized,
    weddingPersonIds,
  );

  if (!resolvedPersonId) {
    return base;
  }

  const effectiveParticipants = buildEffectiveSenderParticipantsForAuthority(
    threadParticipants,
    threadId,
    resolvedPersonId,
  );
  const derived = deriveInboundSenderAuthority(
    effectiveParticipants,
    weddingPeopleByPersonId,
    approvalContactPersonIds,
  );
  return { ...derived, source: "wedding_contact_email" };
}
