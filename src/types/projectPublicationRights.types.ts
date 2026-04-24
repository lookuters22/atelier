/**
 * v1 structured publication / usage / credit surface (P13).
 * Distinct from advisory memory, playbook rules, commercial amendments, and case exceptions.
 */

export const PUBLICATION_RIGHTS_PERMISSION_STATUSES = [
  "withheld_pending_client_approval",
  "permitted_narrow",
  "permitted_broad",
] as const;

export type PublicationRightsPermissionStatus = (typeof PUBLICATION_RIGHTS_PERMISSION_STATUSES)[number];

export function isPublicationRightsPermissionStatus(s: string): s is PublicationRightsPermissionStatus {
  return (PUBLICATION_RIGHTS_PERMISSION_STATUSES as readonly string[]).includes(s);
}

/** Bounded usage channel tags — not per-file asset scope in v1. */
export const PUBLICATION_RIGHTS_USAGE_CHANNELS = [
  "instagram",
  "social_other",
  "studio_portfolio",
  "editorial",
  "magazine_submission",
  "commercial",
  "print_album",
  "internal_reference_only",
] as const;

export type PublicationRightsUsageChannel = (typeof PUBLICATION_RIGHTS_USAGE_CHANNELS)[number];

export function isPublicationRightsUsageChannel(s: string): s is PublicationRightsUsageChannel {
  return (PUBLICATION_RIGHTS_USAGE_CHANNELS as readonly string[]).includes(s);
}

export const PUBLICATION_RIGHTS_EVIDENCE_SOURCES = [
  "client_email_thread",
  "signed_release",
  "verbal_operator_confirmed",
] as const;

export type PublicationRightsEvidenceSource = (typeof PUBLICATION_RIGHTS_EVIDENCE_SOURCES)[number];

export function isPublicationRightsEvidenceSource(s: string): s is PublicationRightsEvidenceSource {
  return (PUBLICATION_RIGHTS_EVIDENCE_SOURCES as readonly string[]).includes(s);
}
