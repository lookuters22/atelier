import { describe, expect, it, vi } from "vitest";
import { runMatchmakerAgent } from "./matchmaker.ts";

const emptyResult = {
  suggested_wedding_id: null,
  confidence_score: 0,
  reasoning: "",
} as const;

describe("runMatchmakerAgent", () => {
  it("returns conservative match without fetch when inbound is empty or whitespace", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const roster = [{ id: "w1", couple_names: "A & B" }];

    await expect(runMatchmakerAgent("", roster)).resolves.toEqual(emptyResult);
    await expect(runMatchmakerAgent("  \n\t  ", roster)).resolves.toEqual(emptyResult);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns conservative match without fetch when roster is empty", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(runMatchmakerAgent("Hello about our June wedding", [])).resolves.toEqual(emptyResult);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
