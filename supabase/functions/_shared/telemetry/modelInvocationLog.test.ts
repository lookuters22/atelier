import { describe, expect, it, vi } from "vitest";
import { createModelInvocationLogger, logModelInvocation } from "./modelInvocationLog.ts";

describe("modelInvocationLog", () => {
  it("createModelInvocationLogger stamps run_id, event_id, and monotonic invocation_index", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createModelInvocationLogger({
      runId: "run-1",
      eventId: "evt-1",
      workflow: "wf",
    });
    logger({ source: "s", model: "m", phase: "p1" });
    logger({ source: "s", model: "m", phase: "p2", workflow: "override" });
    expect(logSpy).toHaveBeenCalledTimes(2);
    const first = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    const second = JSON.parse(logSpy.mock.calls[1][0] as string) as Record<string, unknown>;
    expect(first).toMatchObject({
      type: "model_invocation",
      run_id: "run-1",
      event_id: "evt-1",
      invocation_index: 1,
      workflow: "wf",
      phase: "p1",
    });
    expect(second).toMatchObject({
      invocation_index: 2,
      workflow: "override",
      phase: "p2",
    });
    logSpy.mockRestore();
  });

  it("logModelInvocation omits optional correlation fields", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logModelInvocation({ source: "s", model: "m", phase: "p" });
    const line = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(line.type).toBe("model_invocation");
    expect(line.run_id).toBeUndefined();
    logSpy.mockRestore();
  });
});
