import { describe, expect, it, vi, afterEach } from "vitest";
import { parseOperatorStudioAssistantLlmResponse } from "./parseOperatorStudioAssistantLlmResponse.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("parseOperatorStudioAssistantLlmResponse", () => {
  it("parses JSON with empty proposals", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({ reply: "Hi there", proposedActions: [] }),
    );
    expect(o.reply).toBe("Hi there");
    expect(o.proposedActions).toEqual([]);
  });

  it("drops invalid proposal entries and keeps the reply", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          { kind: "playbook_rule_candidate", proposedActionKey: "", topic: "t", proposedInstruction: "i", proposedDecisionMode: "auto", proposedScope: "global" },
        ],
      }),
    );
    expect(o.proposedActions).toEqual([]);
  });

  it("falls back to full text as reply when not JSON", () => {
    const o = parseOperatorStudioAssistantLlmResponse("Plain answer only");
    expect(o.reply).toBe("Plain answer only");
    expect(o.proposedActions).toEqual([]);
  });

  it("Slice 7: parses a task proposal and normalizes dueDate", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          { kind: "task", title: "Follow up with planner", dueDate: "2026-06-15T00:00:00.000Z" },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("task");
    if (o.proposedActions[0]!.kind === "task") {
      expect(o.proposedActions[0].title).toBe("Follow up with planner");
      expect(o.proposedActions[0].dueDate).toBe("2026-06-15");
    }
  });

  it("Slice 7+: task without dueDate defaults to today UTC in parsed proposal", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "Staged for today — confirm below.",
        proposedActions: [{ kind: "task", title: "Ping the florist" }],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    if (o.proposedActions[0]!.kind === "task") {
      expect(o.proposedActions[0].dueDate).toBe("2026-08-01");
    }
  });

  it("Slice 6+7: keeps both a rule and a task in one turn", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "playbook_rule_candidate",
            proposedActionKey: "k1",
            topic: "T",
            proposedInstruction: "I",
            proposedDecisionMode: "auto",
            proposedScope: "global",
          },
          { kind: "task", title: "Call couple", dueDate: "2026-01-10" },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(2);
  });

  it("drops memory_note when outcome is missing", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "studio",
            title: "Package default",
            summary: "Signature includes 10 hours.",
            fullContent: "Signature includes 10 hours coverage.",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(0);
  });

  it("Slice 8: parses a studio memory_note", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "studio",
            title: "Package default",
            outcome: "Signature package is 10 hours.",
            summary: "Signature includes 10 hours.",
            fullContent: "Signature includes 10 hours coverage.",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("memory_note");
  });

  it("Slice 8: parses a project memory_note with weddingId", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "project",
            title: "Venue constraint",
            outcome: "Ceremony hard end 4pm.",
            summary: "Ceremony ends by 4pm.",
            fullContent: "Ceremony must end by 4pm local time.",
            weddingId: "11111111-1111-4111-8111-111111111111",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    if (o.proposedActions[0]!.kind === "memory_note") {
      expect(o.proposedActions[0].memoryScope).toBe("project");
      expect(o.proposedActions[0].weddingId).toBe("11111111-1111-4111-8111-111111111111");
    }
  });

  it("drops project memory_note when weddingId is not a valid scope UUID", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "project",
            title: "Bad id",
            outcome: "o",
            summary: "s",
            fullContent: "f",
            weddingId: "not-a-project-uuid",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(0);
  });

  it("parses realistic verbal WhatsApp capture on a project (operator thread gap)", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply:
          "Staged advisory memory only — nothing saved until you confirm. Verbal WhatsApp agreement on add-on hours is context, not a contract amendment.",
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "project",
            title: "WhatsApp — extra coverage",
            outcome: "Verbally agreed to +2h coverage at same package rate.",
            summary: "They confirmed on WhatsApp yesterday.",
            fullContent:
              "Operator said the couple already agreed on WhatsApp to extend coverage by two hours at the existing hourly bundle rate.",
            weddingId: "11111111-1111-4111-8111-111111111111",
            captureChannel: "whatsapp",
            captureOccurredOn: "2026-04-21",
            audienceSourceTier: "client_visible",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    const m = o.proposedActions[0]!;
    expect(m.kind).toBe("memory_note");
    if (m.kind === "memory_note") {
      expect(m.captureChannel).toBe("whatsapp");
      expect(m.captureOccurredOn).toBe("2026-04-21");
      expect(m.weddingId).toBe("11111111-1111-4111-8111-111111111111");
    }
    expect(o.reply).toMatch(/advisory|confirm/i);
  });

  it("parses planner-private verbal note with internal_team and video_call", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply:
          "Saved as internal-team context only (advisory). Not a binding scope change — formal amendment may still be needed.",
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "project",
            title: "Call — planner only",
            outcome: "Planner mentioned budget ceiling verbally.",
            summary: "Private operational signal.",
            fullContent: "On Zoom the planner said privately they want to cap add-ons before signing.",
            weddingId: "22222222-2222-4222-8222-222222222222",
            captureChannel: "video_call",
            audienceSourceTier: "internal_team",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    const m = o.proposedActions[0]!;
    if (m.kind === "memory_note") {
      expect(m.captureChannel).toBe("video_call");
      expect(m.audienceSourceTier).toBe("internal_team");
    }
  });

  it("parses a person memory_note with personId", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "person",
            title: "Contact preference",
            outcome: "Email only for this contact.",
            summary: "Email only",
            fullContent: "Prefers email over phone",
            personId: "44444444-4444-4444-8444-444444444444",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    if (o.proposedActions[0]!.kind === "memory_note") {
      expect(o.proposedActions[0].memoryScope).toBe("person");
      expect(o.proposedActions[0].personId).toBe("44444444-4444-4444-8444-444444444444");
    }
  });

  it("parses memory_note with audienceSourceTier", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "studio",
            title: "Studio ops",
            outcome: "Private pricing note.",
            summary: "Internal",
            fullContent: "Margin discussion — not for client context.",
            audienceSourceTier: "operator_only",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    if (o.proposedActions[0]!.kind === "memory_note") {
      expect(o.proposedActions[0].audienceSourceTier).toBe("operator_only");
    }
  });

  it("Slice 11: parses authorized_case_exception with wedding + override", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "authorized_case_exception",
            overridesActionKey: "travel_fee",
            overridePayload: { decision_mode: "ask_first" },
            weddingId: "22222222-2222-4222-8222-222222222222",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("authorized_case_exception");
  });

  it("Ana: parses studio_profile_change_proposal (bounded queue)", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "Queued for your review — confirm to save.",
        proposedActions: [
          {
            kind: "studio_profile_change_proposal",
            rationale: "Add Italy to service area via extensions.",
            studio_business_profile_patch: {
              extensions: { countries: ["IT", "SM"] },
            },
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("studio_profile_change_proposal");
    if (o.proposedActions[0]!.kind === "studio_profile_change_proposal") {
      expect(o.proposedActions[0].rationale).toContain("Italy");
      expect(o.proposedActions[0].studio_business_profile_patch?.extensions).toEqual({ countries: ["IT", "SM"] });
    }
  });

  it("Ana: parses offer_builder_change_proposal (confirm-enqueue only)", () => {
    const pid = "a0eebc99-9c0b-4ef8-8bb2-000000000001";
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "I can queue a new title for that offer document — confirm to save.",
        proposedActions: [
          {
            kind: "offer_builder_change_proposal",
            rationale: "Operator asked to retitle the document.",
            project_id: pid,
            metadata_patch: { root_title: "Destination Collection" },
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("offer_builder_change_proposal");
    if (o.proposedActions[0]!.kind === "offer_builder_change_proposal") {
      expect(o.proposedActions[0].project_id).toBe(pid);
      expect(o.proposedActions[0].metadata_patch.root_title).toBe("Destination Collection");
    }
  });

  it("Ana: parses invoice_setup_change_proposal (confirm-enqueue only)", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "I can queue new payment terms — confirm to save.",
        proposedActions: [
          {
            kind: "invoice_setup_change_proposal",
            rationale: "Operator asked for Net 14.",
            template_patch: { paymentTerms: "Net 14 · Bank transfer" },
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("invoice_setup_change_proposal");
    if (o.proposedActions[0]!.kind === "invoice_setup_change_proposal") {
      expect(o.proposedActions[0].template_patch.paymentTerms).toBe("Net 14 · Bank transfer");
    }
  });

  it("Ana: parses project_commercial_amendment_proposal (bounded commercial record)", () => {
    const wid = "a0eebc99-9c0b-4ef8-8bb6-111111111111";
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "Queued structured amendment — confirm to save.",
        proposedActions: [
          {
            kind: "project_commercial_amendment_proposal",
            rationale: "Client accepted rush edit bundle on WhatsApp; record scope + price.",
            weddingId: wid,
            changeCategories: ["pricing", "scope"],
            deltas: {
              pricing: { summary: "Package +€400 for expedited edit turnaround." },
              scope: { additions: ["10 extra edited images"], removals: [] },
            },
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("project_commercial_amendment_proposal");
    if (o.proposedActions[0]!.kind === "project_commercial_amendment_proposal") {
      expect(o.proposedActions[0].weddingId).toBe(wid);
      expect(o.proposedActions[0].changeCategories).toEqual(["pricing", "scope"]);
      expect(o.proposedActions[0].deltas.pricing?.summary).toContain("€400");
    }
  });

  it("P13: parses publication_rights_record (distinct from memory_note)", () => {
    const wid = "c0eebc99-9c0b-4ef8-8bb6-333333333333";
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "Queued publication-rights record — operator must confirm.",
        proposedActions: [
          {
            kind: "publication_rights_record",
            weddingId: wid,
            permissionStatus: "withheld_pending_client_approval",
            permittedUsageChannels: [],
            attributionRequired: false,
            evidenceSource: "client_email_thread",
            operatorConfirmationSummary:
              "Do not post teasers or BTS until couple replies approving channels — from inbox triage.",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("publication_rights_record");
    if (o.proposedActions[0]!.kind === "publication_rights_record") {
      expect(o.proposedActions[0].weddingId).toBe(wid);
      expect(o.proposedActions[0].permissionStatus).toBe("withheld_pending_client_approval");
      expect(o.proposedActions[0].permittedUsageChannels).toEqual([]);
    }
  });

  it("P13: drops publication_rights_record when permission/channel shape is incoherent", () => {
    const wid = "e0eebc99-9c0b-4ef8-8bb6-555555555555";
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "x",
        proposedActions: [
          {
            kind: "publication_rights_record",
            weddingId: wid,
            permissionStatus: "withheld_pending_client_approval",
            permittedUsageChannels: ["instagram"],
            attributionRequired: false,
            evidenceSource: "client_email_thread",
            operatorConfirmationSummary: "LLM contradicted itself — must not enqueue without operator fix.",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(0);
  });

  it("F3: parses calendar_event_create", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "Staged — confirm to add to your calendar.",
        proposedActions: [
          {
            kind: "calendar_event_create",
            title: "Venue Call",
            startTime: "2026-05-04T14:00:00.000Z",
            endTime: "2026-05-04T15:00:00.000Z",
            eventType: "other",
            weddingId: null,
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("calendar_event_create");
  });

  it("F3: parses calendar_event_reschedule", () => {
    const id = "33333333-3333-4333-a333-333333333333";
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "Confirm to move the event.",
        proposedActions: [
          {
            kind: "calendar_event_reschedule",
            calendarEventId: id,
            startTime: "2026-05-04T16:00:00.000Z",
            endTime: "2026-05-04T17:00:00.000Z",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    if (o.proposedActions[0]!.kind === "calendar_event_reschedule") {
      expect(o.proposedActions[0].calendarEventId).toBe(id);
    }
  });
});
