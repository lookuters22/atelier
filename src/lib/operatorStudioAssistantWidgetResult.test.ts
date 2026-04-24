import { describe, expect, it, vi, afterEach } from "vitest";

afterEach(() => {
  vi.useRealTimers();
});
import {
  OPERATOR_STUDIO_ASSISTANT_CONTRACT_VIOLATION_MESSAGE,
  buildOperatorStudioAssistantAssistantDisplay,
} from "./operatorStudioAssistantWidgetResult.ts";

describe("buildOperatorStudioAssistantAssistantDisplay", () => {
  it("fails closed when clientFacingForbidden is missing", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay({ reply: "secret" }, { devMode: false });
    expect(d.kind).toBe("contract_violation");
    if (d.kind === "contract_violation") {
      expect(d.mainText).toBe(OPERATOR_STUDIO_ASSISTANT_CONTRACT_VIOLATION_MESSAGE);
    }
  });

  it("fails closed when clientFacingForbidden is false", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      { reply: "secret", clientFacingForbidden: false },
      { devMode: false },
    );
    expect(d.kind).toBe("contract_violation");
  });

  it("returns answer with ribbon when contract holds", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      { reply: "  ok  ", clientFacingForbidden: true },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.mainText).toBe("ok");
      expect(d.operatorRibbon).toContain("Internal assistant");
      expect(d.devRetrieval).toBeNull();
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.taskProposals).toEqual([]);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.projectCommercialAmendmentProposals).toEqual([]);
      expect(d.publicationRightsRecordProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("includes devRetrieval in dev when retrievalLog is present", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "x",
        clientFacingForbidden: true,
        retrievalLog: { scopesQueried: ["a"], selectedMemoryIds: ["m1"] },
      },
      { devMode: true },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.devRetrieval).toEqual({ scopes: ["a"], memoryIds: ["m1"] });
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.taskProposals).toEqual([]);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.projectCommercialAmendmentProposals).toEqual([]);
      expect(d.publicationRightsRecordProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("hides devRetrieval in production mode even if retrievalLog exists", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "x",
        clientFacingForbidden: true,
        retrievalLog: { scopesQueried: ["a"], selectedMemoryIds: [] },
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.devRetrieval).toBeNull();
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.taskProposals).toEqual([]);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.projectCommercialAmendmentProposals).toEqual([]);
      expect(d.publicationRightsRecordProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Slice 6: surfaces playbook rule proposals from the edge payload", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can add that as a rule candidate.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "playbook_rule_candidate",
            proposedActionKey: "no_flash",
            topic: "On-camera flash",
            proposedInstruction: "Never use on-camera flash during ceremonies.",
            proposedDecisionMode: "forbidden",
            proposedScope: "global",
            weddingId: null,
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.playbookRuleProposals).toHaveLength(1);
      expect(d.playbookRuleProposals[0]!.proposedActionKey).toBe("no_flash");
      expect(d.taskProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.projectCommercialAmendmentProposals).toEqual([]);
      expect(d.publicationRightsRecordProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Slice 7: surfaces task proposals from the edge payload", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I'll add a follow-up task.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "task",
            title: "Call the venue",
            dueDate: "2026-05-01",
            weddingId: null,
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.taskProposals).toHaveLength(1);
      expect(d.taskProposals[0]!.title).toBe("Call the venue");
      expect(d.taskProposals[0]!.dueDate).toBe("2026-05-01");
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.projectCommercialAmendmentProposals).toEqual([]);
      expect(d.publicationRightsRecordProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Slice 7+: task proposal without dueDate defaults to today UTC for the confirm card", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-20T00:00:00.000Z"));
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "Defaulted due date to today.",
        clientFacingForbidden: true,
        proposedActions: [{ kind: "task", title: "Send contract" }],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.taskProposals).toHaveLength(1);
      expect(d.taskProposals[0]!.dueDate).toBe("2026-02-20");
    }
  });

  it("Slice 8: surfaces memory_note proposals from the edge payload", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can save that as studio memory.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "studio",
            title: "No flash in church",
            outcome: "Unplugged ceremony — no on-camera flash.",
            summary: "We do not use flash during church ceremonies.",
            fullContent: "We do not use flash during church ceremonies.",
            weddingId: null,
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.memoryNoteProposals).toHaveLength(1);
      expect(d.memoryNoteProposals[0]!.memoryScope).toBe("studio");
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.taskProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.projectCommercialAmendmentProposals).toEqual([]);
      expect(d.publicationRightsRecordProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("surfaces memory_note with verbal capture metadata when valid", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "ok",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "studio",
            title: "WhatsApp",
            outcome: "Client sent timeline",
            summary: "Off email",
            fullContent: "They shared the day-of timeline on WhatsApp.",
            captureChannel: "whatsapp",
            captureOccurredOn: "2026-04-12",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      const mem = d.memoryNoteProposals[0]!;
      expect(mem.captureChannel).toBe("whatsapp");
      expect(mem.captureOccurredOn).toBe("2026-04-12");
    }
  });

  it("drops memory_note when captureOccurredOn is set without captureChannel", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "ok",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "studio",
            title: "Bad",
            outcome: "o",
            summary: "s",
            fullContent: "f",
            captureOccurredOn: "2026-04-12",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.memoryNoteProposals).toHaveLength(0);
    }
  });

  it("surfaces person-scoped memory_note with personId", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "ok",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "person",
            title: "Prefers natural light",
            outcome: "Prefers natural light only.",
            summary: "Natural only",
            fullContent: "Asked for very natural portraits",
            personId: "55555555-5555-4555-9555-555555555555",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.memoryNoteProposals).toHaveLength(1);
      const mem = d.memoryNoteProposals[0]!;
      expect(mem.memoryScope).toBe("person");
      expect(mem.personId).toBe("55555555-5555-4555-9555-555555555555");
      expect(d.publicationRightsRecordProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("drops person-scoped memory_note when personId is not a valid UUID (no invented CRM id)", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "ok",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "person",
            title: "Bad",
            outcome: "o",
            summary: "s",
            fullContent: "f",
            personId: "client-john-smith",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.memoryNoteProposals).toHaveLength(0);
    }
  });

  it("surfaces memory_note with audienceSourceTier when valid", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "ok",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "studio",
            title: "Vendor",
            outcome: "Load-in window 9–10.",
            summary: "Dock B",
            fullContent: "Coordinator-only logistics.",
            audienceSourceTier: "internal_team",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.memoryNoteProposals).toHaveLength(1);
      expect(d.memoryNoteProposals[0]!.audienceSourceTier).toBe("internal_team");
      expect(d.publicationRightsRecordProposals).toEqual([]);
    }
  });

  it("drops memory_note when audienceSourceTier is invalid", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "ok",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "studio",
            title: "Bad tier",
            outcome: "o",
            summary: "s",
            fullContent: "f",
            audienceSourceTier: "public",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.memoryNoteProposals).toHaveLength(0);
    }
  });

  it("Slice 11: surfaces authorized_case_exception proposals (case-scoped only)", () => {
    const wid = "11111111-1111-4111-8111-111111111111";
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can add a one-off case exception for this project.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "authorized_case_exception",
            overridesActionKey: "travel_fee",
            overridePayload: { decision_mode: "ask_first" },
            weddingId: wid,
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.authorizedCaseExceptionProposals).toHaveLength(1);
      expect(d.authorizedCaseExceptionProposals[0]!.overridesActionKey).toBe("travel_fee");
      expect(d.authorizedCaseExceptionProposals[0]!.weddingId).toBe(wid);
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.projectCommercialAmendmentProposals).toEqual([]);
      expect(d.publicationRightsRecordProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Ana: surfaces studio_profile_change_proposal from the edge payload (bounded patches)", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can queue a currency change for review.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "studio_profile_change_proposal",
            rationale: "Operator asked to use EUR for pricing display.",
            settings_patch: { currency: "EUR" },
            studio_business_profile_patch: { service_types: ["wedding", "commercial"] },
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.studioProfileChangeProposals).toHaveLength(1);
      const sp = d.studioProfileChangeProposals[0]!;
      expect(sp.rationale).toContain("EUR");
      expect(sp.settings_patch?.currency).toBe("EUR");
      expect(sp.studio_business_profile_patch?.service_types).toEqual(["wedding", "commercial"]);
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.projectCommercialAmendmentProposals).toEqual([]);
      expect(d.publicationRightsRecordProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Ana: surfaces offer_builder_change_proposal (bounded name / title)", () => {
    const pid = "a0eebc99-9c0b-4ef8-8bb2-000000000001";
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can queue a rename for review.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "offer_builder_change_proposal",
            rationale: "Operator asked to rename the premium offer.",
            project_id: pid,
            metadata_patch: { name: "Editorial Weddings" },
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.offerBuilderChangeProposals).toHaveLength(1);
      const ob = d.offerBuilderChangeProposals[0]!;
      expect(ob.project_id).toBe(pid);
      expect(ob.metadata_patch.name).toBe("Editorial Weddings");
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.projectCommercialAmendmentProposals).toEqual([]);
      expect(d.publicationRightsRecordProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Ana: surfaces project_commercial_amendment_proposal (bounded deltas)", () => {
    const wid = "b0eebc99-9c0b-4ef8-8bb6-222222222222";
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can queue a commercial amendment for this project.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "project_commercial_amendment_proposal",
            rationale: "Upsell: second shooter added verbally.",
            weddingId: wid,
            changeCategories: ["team", "pricing"],
            deltas: {
              team: { summary: "Add associate photographer for ceremony", headcount_delta: 1 },
              pricing: { summary: "+€600 for second shooter" },
            },
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.projectCommercialAmendmentProposals).toHaveLength(1);
      const a = d.projectCommercialAmendmentProposals[0]!;
      expect(a.weddingId).toBe(wid);
      expect(a.deltas.team?.headcount_delta).toBe(1);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.publicationRightsRecordProposals).toEqual([]);
    }
  });

  it("P13: surfaces publication_rights_record (structured; memory_note alone is not a substitute)", () => {
    const wid = "d0eebc99-9c0b-4ef8-8bb6-444444444444";
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "Confirm to save publication / usage permissions for this project.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "publication_rights_record",
            weddingId: wid,
            permissionStatus: "permitted_narrow",
            permittedUsageChannels: ["instagram"],
            attributionRequired: true,
            attributionDetail: "Tag studio + planner; no couple tags on solo portraits.",
            exclusionNotes: "Exclude jewelry-detail set from any public reel.",
            evidenceSource: "client_email_thread",
            operatorConfirmationSummary:
              "Email approves Instagram-only teasers with credits; broader portfolio use still off-limits.",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.publicationRightsRecordProposals).toHaveLength(1);
      const pr = d.publicationRightsRecordProposals[0]!;
      expect(pr.weddingId).toBe(wid);
      expect(pr.permissionStatus).toBe("permitted_narrow");
      expect(pr.permittedUsageChannels).toEqual(["instagram"]);
      expect(pr.attributionRequired).toBe(true);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.projectCommercialAmendmentProposals).toEqual([]);
    }
  });

  it("Ana: surfaces invoice_setup_change_proposal (bounded template_patch)", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can queue a new invoice prefix for review.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "invoice_setup_change_proposal",
            rationale: "Operator asked to change the invoice prefix to INV.",
            template_patch: { invoicePrefix: "INV" },
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.invoiceSetupChangeProposals).toHaveLength(1);
      const inv = d.invoiceSetupChangeProposals[0]!;
      expect(inv.template_patch.invoicePrefix).toBe("INV");
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.projectCommercialAmendmentProposals).toEqual([]);
      expect(d.publicationRightsRecordProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("F3: surfaces calendar_event_create and reschedule proposals", () => {
    const eid = "aaaaaaaa-bbbb-4ccc-bddd-eeeeeeeeeeee";
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "Confirm to add or move the event.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "calendar_event_create",
            title: "Venue call",
            startTime: "2026-05-03T15:00:00.000Z",
            endTime: "2026-05-03T16:00:00.000Z",
            eventType: "other",
            weddingId: null,
          },
          {
            kind: "calendar_event_reschedule",
            calendarEventId: eid,
            startTime: "2026-05-03T16:00:00.000Z",
            endTime: "2026-05-03T17:00:00.000Z",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.calendarEventCreateProposals).toHaveLength(1);
      expect(d.calendarEventCreateProposals[0]!.title).toBe("Venue call");
      expect(d.calendarEventRescheduleProposals).toHaveLength(1);
      expect(d.calendarEventRescheduleProposals[0]!.calendarEventId).toBe(eid);
      expect(d.publicationRightsRecordProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Slice 11+: drops authorized_case_exception when weddingId is not a valid UUID (safe-write gate)", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "x",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "authorized_case_exception",
            overridesActionKey: "x",
            overridePayload: { decision_mode: "ask_first" },
            weddingId: "not-a-uuid",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.projectCommercialAmendmentProposals).toEqual([]);
      expect(d.publicationRightsRecordProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("S1: surfaces escalation_resolve proposals", () => {
    const eid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "When you agree, confirm to queue resolution.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "escalation_resolve",
            escalationId: eid,
            resolutionSummary: "Approved exception per studio policy.",
            photographerReplyRaw: "We confirmed on email.",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.escalationResolveProposals).toHaveLength(1);
      const er = d.escalationResolveProposals[0]!;
      expect(er.escalationId).toBe(eid);
      expect(er.resolutionSummary).toContain("Approved");
      expect(er.photographerReplyRaw).toBe("We confirmed on email.");
    }
  });

  it("S1: drops escalation_resolve with invalid escalation id", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "x",
        clientFacingForbidden: true,
        proposedActions: [{ kind: "escalation_resolve", escalationId: "bad-id", resolutionSummary: "ok" }],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });
});
