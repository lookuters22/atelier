import { describe, expect, it } from "vitest";
import { todayActionHref } from "./todayActionFeed";
import { escalationResolutionTarget, resolutionTargetToTodayActionResolution } from "./resolutionTarget";

describe("escalationResolutionTarget", () => {
  it("prefers pipeline when wedding and thread are present", () => {
    const t = escalationResolutionTarget({
      id: "e1",
      wedding_id: "w1",
      thread_id: "t1",
    });
    expect(t).toEqual({
      type: "pipeline_escalation",
      weddingId: "w1",
      threadId: "t1",
      escalationId: "e1",
    });
  });

  it("uses inbox when only thread is present", () => {
    const t = escalationResolutionTarget({
      id: "e2",
      wedding_id: null,
      thread_id: "t2",
    });
    expect(t).toEqual({
      type: "inbox_escalation",
      threadId: "t2",
      escalationId: "e2",
    });
  });

  it("falls back to today when no thread", () => {
    const t = escalationResolutionTarget({
      id: "e3",
      wedding_id: "w1",
      thread_id: null,
    });
    expect(t).toEqual({ type: "today_escalation", escalationId: "e3" });
  });
});

describe("resolutionTargetToTodayActionResolution", () => {
  it("never uses /escalations for pipeline_escalation", () => {
    const r = resolutionTargetToTodayActionResolution({
      type: "pipeline_escalation",
      weddingId: "w",
      threadId: "t",
      escalationId: "e",
    });
    expect(todayActionHref(r)).not.toContain("/escalations");
  });
});
