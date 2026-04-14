import { describe, expect, it, vi } from "vitest";
import { runTriageAgent } from "./triage.ts";

describe("runTriageAgent", () => {
  it("returns concierge without fetch when message is empty or whitespace-only", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(runTriageAgent("")).resolves.toBe("concierge");
    await expect(runTriageAgent("  \n\t  ")).resolves.toBe("concierge");

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
