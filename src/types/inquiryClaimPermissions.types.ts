/**
 * V1 structured claim permissions for **inquiry-stage** client orchestrator replies.
 * Separates what Ana may assert (per verified playbook/CRM surfaces) from how she phrases it (voice).
 *
 * Planner is deterministic; thread memory must not raise permission levels.
 */

export type InquiryClaimPermissionLevel = "confirm" | "soft_confirm" | "explore" | "defer";

/** V1 — small domain set aligned with inquiry overclaim failure modes. */
export type InquiryClaimPermissionMapV1 = {
  schemaVersion: 1;
  /** Calendar / date-ease / “open on our side” style claims. */
  availability: InquiryClaimPermissionLevel;
  /** Destination weddings / “we photograph abroad” capability fit. */
  destination_fit: InquiryClaimPermissionLevel;
  /** Travel, multi-day logistics, structuring travel — often paired with destination. */
  destination_logistics: InquiryClaimPermissionLevel;
  /** “Kind of work we do” / specialty / inclusion fit language. */
  offering_fit: InquiryClaimPermissionLevel;
  /** How proposals are structured, presets, “natural part of proposal”, etc. */
  proposal_process: InquiryClaimPermissionLevel;
  /**
   * Operational next-step / funnel guidance (call, packages, consultation, booking links).
   * - `confirm` — direct CTAs (“the next step is a call”, “you can book here”, “we’ll start with a consultation”) are allowed.
   * - `soft_confirm` — cautious invitations only; no definitive “the next step is…” or settled “we usually begin with a call”.
   * - `explore` — discuss next steps / possibilities only; no concrete scheduling or stated studio funnel habits.
   * - `defer` — same or stricter than explore; do not steer a settled operational path.
   */
  booking_next_step: InquiryClaimPermissionLevel;
  /** Galleries, previews, deliverables “we include”. */
  deliverable_inclusions: InquiryClaimPermissionLevel;
};

export type InquiryClaimPermissionMap = InquiryClaimPermissionMapV1;
