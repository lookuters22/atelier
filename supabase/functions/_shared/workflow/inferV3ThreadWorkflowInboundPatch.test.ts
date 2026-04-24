import { describe, expect, it } from "vitest";
import {
  inferV3ThreadWorkflowInboundPatch,
  isV3ThreadWorkflowInboundPatchEmpty,
} from "./inferV3ThreadWorkflowInboundPatch.ts";
import { computeV3ThreadWorkflowNextDueAt, mergeV3ThreadWorkflow } from "./mergeV3ThreadWorkflow.ts";
import { emptyV3ThreadWorkflowV1 } from "./v3ThreadWorkflowTypes.ts";

describe("inferV3ThreadWorkflowInboundPatch", () => {
  it("detects wire chase (stress 1 shaped)", () => {
    const p = inferV3ThreadWorkflowInboundPatch(
      "I am sending the wire transfer today for the remaining balance.",
    );
    expect(p.payment_wire?.promised_at).toBeDefined();
    expect(p.payment_wire?.chase_due_at).toBeDefined();
    expect(isV3ThreadWorkflowInboundPatchEmpty(p)).toBe(false);
  });

  it("detects timeline on WhatsApp (stress 2)", () => {
    const p = inferV3ThreadWorkflowInboundPatch(
      "I already sent the full timeline to Danilo on WhatsApp last week.",
    );
    expect(p.timeline?.suppressed).toBe(true);
    expect(p.timeline?.received_channel).toBe("whatsapp");
  });

  it("detects stalled communication (stress 8)", () => {
    const p = inferV3ThreadWorkflowInboundPatch(
      "Following up — I never heard back on my question from March about the rehearsal time.",
    );
    expect(p.stalled_inquiry?.client_marked_at).toBeDefined();
    expect(p.stalled_inquiry?.nudge_due_at).toBeDefined();
  });

  it("detects questionnaire submitted (P18)", () => {
    const p = inferV3ThreadWorkflowInboundPatch(
      "Hi — we have completed the Google Form questionnaire you sent.",
    );
    expect(p.readiness?.questionnaire?.status).toBe("complete");
    expect(p.readiness?.questionnaire?.completed_at).toBeDefined();
  });

  it("detects email timeline attachment (P14)", () => {
    const p = inferV3ThreadWorkflowInboundPatch(
      "Please find attached the day-of timeline and run of show for your review.",
    );
    expect(p.timeline?.received_channel).toBe("email");
    expect(p.readiness?.timeline?.status).toBe("complete");
  });

  it("detects consultation booked", () => {
    const p = inferV3ThreadWorkflowInboundPatch("Our consultation is scheduled for next Tuesday at 3pm.");
    expect(p.readiness?.consultation?.status).toBe("complete");
  });
});

describe("mergeV3ThreadWorkflow + next due", () => {
  it("computes next_due as min of chase and nudge", () => {
    const merged = mergeV3ThreadWorkflow(emptyV3ThreadWorkflowV1(), {
      payment_wire: { promised_at: "2026-01-01T00:00:00.000Z", chase_due_at: "2026-01-03T12:00:00.000Z" },
      stalled_inquiry: {
        client_marked_at: "2026-01-01T00:00:00.000Z",
        nudge_due_at: "2026-01-04T00:00:00.000Z",
      },
    });
    expect(computeV3ThreadWorkflowNextDueAt(merged)).toBe("2026-01-03T12:00:00.000Z");
  });

  it("computes next_due including readiness milestone due_at", () => {
    const merged = mergeV3ThreadWorkflow(emptyV3ThreadWorkflowV1(), {
      readiness: {
        questionnaire: { status: "pending", due_at: "2026-01-02T00:00:00.000Z" },
      },
      payment_wire: { promised_at: "2026-01-01T00:00:00.000Z", chase_due_at: "2026-01-05T00:00:00.000Z" },
    });
    expect(computeV3ThreadWorkflowNextDueAt(merged)).toBe("2026-01-02T00:00:00.000Z");
  });
});
