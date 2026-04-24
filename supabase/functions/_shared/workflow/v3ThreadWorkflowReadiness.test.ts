import { describe, expect, it } from "vitest";
import {
  collectReadinessDueAtIsoTimes,
  formatReadinessNotesForQueueExplanation,
  readinessMilestoneEffective,
  readinessMilestoneIsSatisfied,
} from "./v3ThreadWorkflowReadiness.ts";
import { parseV3ThreadWorkflowV1 } from "./v3ThreadWorkflowTypes.ts";

describe("v3ThreadWorkflowReadiness (P14/P18-shaped)", () => {
  it("treats legacy timeline receipt as timeline satisfied without readiness.timeline", () => {
    const wf = parseV3ThreadWorkflowV1({
      v: 1,
      timeline: { received_at: "2026-03-01T10:00:00.000Z", received_channel: "whatsapp" },
    });
    expect(readinessMilestoneIsSatisfied("timeline", wf)).toBe(true);
    expect(readinessMilestoneEffective("timeline", wf, Date.parse("2026-04-01T00:00:00.000Z")).kind).toBe(
      "satisfied",
    );
  });

  it("questionnaire pending + past due is overdue (stress: form never verified)", () => {
    const wf = parseV3ThreadWorkflowV1({
      v: 1,
      readiness: {
        questionnaire: { status: "pending", due_at: "2026-03-15T00:00:00.000Z" },
      },
    });
    const now = Date.parse("2026-04-01T00:00:00.000Z");
    expect(readinessMilestoneIsSatisfied("questionnaire", wf)).toBe(false);
    expect(readinessMilestoneEffective("questionnaire", wf, now).kind).toBe("overdue");
    const notes = formatReadinessNotesForQueueExplanation(wf, now);
    expect(notes.some((l) => /overdue/i.test(l) && /questionnaire/i.test(l))).toBe(true);
  });

  it("questionnaire complete produces no overdue note (P18 resolved)", () => {
    const wf = parseV3ThreadWorkflowV1({
      v: 1,
      readiness: {
        questionnaire: { status: "complete", completed_at: "2026-03-20T00:00:00.000Z" },
      },
    });
    const now = Date.parse("2026-04-01T00:00:00.000Z");
    expect(readinessMilestoneIsSatisfied("questionnaire", wf)).toBe(true);
    expect(formatReadinessNotesForQueueExplanation(wf, now)).toEqual([]);
  });

  it("timeline pending with future due is pending_upcoming, not overdue (P14 — not late yet)", () => {
    const wf = parseV3ThreadWorkflowV1({
      v: 1,
      readiness: { timeline: { status: "pending", due_at: "2026-05-01T00:00:00.000Z" } },
    });
    const now = Date.parse("2026-04-01T00:00:00.000Z");
    expect(readinessMilestoneEffective("timeline", wf, now).kind).toBe("pending_upcoming");
    const notes = formatReadinessNotesForQueueExplanation(wf, now);
    expect(notes.some((l) => /pending/i.test(l) && /Timeline/i.test(l))).toBe(true);
  });

  it("collectReadinessDueAtIsoTimes includes pending milestone due_at for next_due index", () => {
    const wf = parseV3ThreadWorkflowV1({
      v: 1,
      readiness: {
        consultation: { status: "pending", due_at: "2026-06-10T12:00:00.000Z" },
      },
    });
    expect(collectReadinessDueAtIsoTimes(wf)).toEqual(["2026-06-10T12:00:00.000Z"]);
  });

  it("does not index due when milestone already satisfied", () => {
    const wf = parseV3ThreadWorkflowV1({
      v: 1,
      readiness: {
        pre_event_briefing: { status: "complete", completed_at: "2026-04-01T00:00:00.000Z" },
      },
    });
    expect(collectReadinessDueAtIsoTimes(wf)).toEqual([]);
  });

  it("R&D-style stress: long gap before timeline — overdue when due passed and still pending", () => {
    const wf = parseV3ThreadWorkflowV1({
      v: 1,
      readiness: {
        timeline: { status: "pending", due_at: "2025-08-01T00:00:00.000Z" },
      },
    });
    const now = Date.parse("2026-02-01T00:00:00.000Z");
    expect(readinessMilestoneEffective("timeline", wf, now).kind).toBe("overdue");
  });
});

describe("parseV3ThreadWorkflowV1 readiness", () => {
  it("drops invalid readiness status", () => {
    const wf = parseV3ThreadWorkflowV1({
      v: 1,
      readiness: { questionnaire: { status: "bogus" } },
    });
    expect(wf.readiness?.questionnaire).toBeUndefined();
  });

  it("parses valid readiness milestone", () => {
    const wf = parseV3ThreadWorkflowV1({
      v: 1,
      readiness: { questionnaire: { status: "pending", due_at: "2026-01-01T00:00:00.000Z" } },
    });
    expect(wf.readiness?.questionnaire?.status).toBe("pending");
  });
});
