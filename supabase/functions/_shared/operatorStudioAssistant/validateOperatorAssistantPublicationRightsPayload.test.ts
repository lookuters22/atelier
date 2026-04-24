import { describe, expect, it } from "vitest";
import {
  tryParseLlmProposedPublicationRightsRecord,
  validateOperatorAssistantPublicationRightsPayload,
} from "./validateOperatorAssistantPublicationRightsPayload.ts";

const W = "11111111-1111-4111-8111-111111111111";

describe("validateOperatorAssistantPublicationRightsPayload", () => {
  it("accepts withheld_pending_client_approval with empty channels (do not publish until approval)", () => {
    const v = validateOperatorAssistantPublicationRightsPayload({
      weddingId: W,
      permissionStatus: "withheld_pending_client_approval",
      permittedUsageChannels: [],
      attributionRequired: false,
      evidenceSource: "client_email_thread",
      operatorConfirmationSummary: "Client has not approved any public posting yet — hold all channels.",
    });
    expect(v.ok).toBe(true);
  });

  it("rejects withheld when channels are non-empty", () => {
    const v = validateOperatorAssistantPublicationRightsPayload({
      weddingId: W,
      permissionStatus: "withheld_pending_client_approval",
      permittedUsageChannels: ["instagram"],
      attributionRequired: false,
      evidenceSource: "client_email_thread",
      operatorConfirmationSummary: "Summary line long enough here.",
    });
    expect(v.ok).toBe(false);
  });

  it("accepts permitted_narrow with exactly one channel (Instagram only)", () => {
    const v = validateOperatorAssistantPublicationRightsPayload({
      weddingId: W,
      permissionStatus: "permitted_narrow",
      permittedUsageChannels: ["instagram"],
      attributionRequired: true,
      attributionDetail: "Credit: Studio Name + Galia Lahav",
      evidenceSource: "client_email_thread",
      operatorConfirmationSummary: "Raw files OK for Instagram only; no other social without new approval.",
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.permittedUsageChannels).toEqual(["instagram"]);
      expect(v.value.attributionRequired).toBe(true);
    }
  });

  it("rejects permitted_narrow without channels", () => {
    const v = validateOperatorAssistantPublicationRightsPayload({
      weddingId: W,
      permissionStatus: "permitted_narrow",
      permittedUsageChannels: [],
      attributionRequired: false,
      evidenceSource: "verbal_operator_confirmed",
      operatorConfirmationSummary: "Need at least one channel for narrow grant.",
    });
    expect(v.ok).toBe(false);
  });

  it("accepts permitted_broad with exclusions / no-tag notes (stress-shaped)", () => {
    const v = validateOperatorAssistantPublicationRightsPayload({
      weddingId: W,
      permissionStatus: "permitted_broad",
      permittedUsageChannels: [],
      attributionRequired: true,
      attributionDetail: "WedLuxe / Over The Moon: 13+ vendor credits required — see planner list.",
      exclusionNotes:
        "Do not tag couple on solo portraits; exclude mother+jewelry set from guest gallery; no Dominik solo posts.",
      validUntil: "2027-12-31",
      evidenceSource: "signed_release",
      operatorConfirmationSummary:
        "Magazine run approved with full vendor credit block; guest gallery excludes sensitive frames per email thread.",
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.exclusionNotes).toContain("Dominik");
      expect(v.value.validUntil).toBe("2027-12-31");
    }
  });

  it("memory advisory path stays separate: validator is not memory_note", () => {
    const v = validateOperatorAssistantPublicationRightsPayload({
      weddingId: W,
      permissionStatus: "permitted_narrow",
      permittedUsageChannels: ["editorial"],
      attributionRequired: false,
      evidenceSource: "client_email_thread",
      operatorConfirmationSummary: "Structured rights row — not stored as memories.scope narrative alone.",
    });
    expect(v.ok).toBe(true);
  });
});

describe("tryParseLlmProposedPublicationRightsRecord", () => {
  it("parses LLM-shaped publication_rights_record", () => {
    const r = tryParseLlmProposedPublicationRightsRecord({
      kind: "publication_rights_record",
      weddingId: W,
      permissionStatus: "permitted_narrow",
      permittedUsageChannels: ["magazine_submission"],
      attributionRequired: true,
      evidenceSource: "client_email_thread",
      operatorConfirmationSummary: "Editorial submission only; portfolio use still forbidden until follow-up.",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.kind).toBe("publication_rights_record");
      expect(r.value.permittedUsageChannels).toEqual(["magazine_submission"]);
    }
  });

  it("rejects wrong kind", () => {
    const r = tryParseLlmProposedPublicationRightsRecord({
      kind: "memory_note",
      weddingId: W,
      permissionStatus: "permitted_broad",
      permittedUsageChannels: [],
      attributionRequired: false,
      evidenceSource: "client_email_thread",
      operatorConfirmationSummary: "Should use memory parser instead.",
    });
    expect(r.ok).toBe(false);
  });
});
