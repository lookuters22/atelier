import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyOperatorWhatsAppEscalationResolutionBundle } from "./classifyOperatorWhatsAppEscalationResolutionBundle.ts";

describe("classifyOperatorWhatsAppEscalationResolutionBundle", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "Deno",
      { env: { get: (k: string) => (k === "OPENAI_API_KEY" ? "sk-test-key" : undefined) } },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns without fetch when reply is empty after trim", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.reject(new Error("should not call")),
    );
    const r = await classifyOperatorWhatsAppEscalationResolutionBundle("question?", "   \n  ");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(r).toEqual({
      ok: true,
      resolves: false,
      resolution_summary: "",
      learning_outcome: "one_off_case",
    });
  });

  it("includes action_key and wedding scope in the user message (parity with learning classifier)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                resolves: true,
                resolution_summary: "Done.",
                learning_outcome: "one_off_case",
              }),
            },
          },
        ],
      }),
    } as Response);

    await classifyOperatorWhatsAppEscalationResolutionBundle("Offer discount?", "Yes.", {
      learningContext: {
        actionKey: "discount_quote",
        weddingId: "550e8400-e29b-41d4-a716-446655440000",
      },
    });

    expect(fetchSpy).toHaveBeenCalled();
    const init = fetchSpy.mock.calls[0]?.[1] as { body?: string } | undefined;
    const body = init?.body ? (JSON.parse(init.body) as { messages?: Array<{ content?: string }> }) : null;
    const userContent = body?.messages?.find((m) => m.content?.includes("Pending question"))?.content ?? "";
    expect(userContent).toContain("action_key: discount_quote");
    expect(userContent).toContain("wedding_id present");
  });

  it("parses successful OpenAI JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                resolves: true,
                resolution_summary: "Approved 10% discount.",
                learning_outcome: "reusable_playbook",
              }),
            },
          },
        ],
      }),
    } as Response);

    const r = await classifyOperatorWhatsAppEscalationResolutionBundle("Offer discount?", "Yes, 10% is fine.");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resolves).toBe(true);
      expect(r.resolution_summary).toBe("Approved 10% discount.");
      expect(r.learning_outcome).toBe("reusable_playbook");
    }
  });

  it("returns ok false when resolves true but summary empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                resolves: true,
                resolution_summary: "   ",
                learning_outcome: "one_off_case",
              }),
            },
          },
        ],
      }),
    } as Response);

    const r = await classifyOperatorWhatsAppEscalationResolutionBundle("q", "yes");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("resolves_true_empty_summary");
  });

  it("returns ok false on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    } as Response);

    const r = await classifyOperatorWhatsAppEscalationResolutionBundle("q", "reply");
    expect(r.ok).toBe(false);
  });
});
