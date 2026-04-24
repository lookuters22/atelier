import { describe, expect, it, vi } from "vitest";
import { composeOperatorAssistantMemorySummaryForStorage } from "../../../../src/lib/composeOperatorAssistantMemorySummary.ts";
import { insertMemoryForOperatorAssistant } from "./insertOperatorAssistantMemoryCore.ts";

describe("insertMemoryForOperatorAssistant", () => {
  it("inserts into memories (not tasks or playbook tables)", async () => {
    let insertedRow: Record<string, unknown> | undefined;
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "memories") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            insertedRow = row;
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "mem-1" },
                    error: null,
                  }),
              }),
            };
          }),
        };
      }
      if (table === "operator_assistant_write_audit") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "audit-mem-1" },
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;

    const out = await insertMemoryForOperatorAssistant(supabase, "photo-1", {
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "Studio default",
      outcome: "Default policy",
      summary: composeOperatorAssistantMemorySummaryForStorage("Default policy", "S".repeat(20), 400),
      fullContent: "Full body",
      weddingId: null,
      captureChannel: null,
      captureOccurredOn: null,
      audienceSourceTier: "client_visible",
    });

    expect(out.id).toBe("mem-1");
    expect(out.auditId).toBe("audit-mem-1");
    expect(insertedRow?.type).toBe("operator_assistant_note");
    expect(insertedRow?.capture_channel).toBeNull();
    expect(insertedRow?.capture_occurred_on).toBeNull();
    expect(insertedRow?.audience_source_tier).toBe("client_visible");
  });

  it("uses operator_verbal_capture when captureChannel is set", async () => {
    let insertedRow: Record<string, unknown> | undefined;
    let auditDetail: Record<string, unknown> | undefined;
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "memories") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            insertedRow = row;
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "mem-v" },
                    error: null,
                  }),
              }),
            };
          }),
        };
      }
      if (table === "operator_assistant_write_audit") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            auditDetail = (row as { detail?: Record<string, unknown> }).detail as Record<string, unknown>;
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "audit-v" },
                    error: null,
                  }),
              }),
            };
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;

    await insertMemoryForOperatorAssistant(supabase, "photo-1", {
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "WhatsApp",
      outcome: "Sent timeline",
      summary: composeOperatorAssistantMemorySummaryForStorage("Sent timeline", "via WhatsApp", 400),
      fullContent: "Client sent timeline on WhatsApp.",
      weddingId: null,
      captureChannel: "whatsapp",
      captureOccurredOn: "2026-04-10",
      audienceSourceTier: "client_visible",
    });

    expect(insertedRow?.type).toBe("operator_verbal_capture");
    expect(insertedRow?.capture_channel).toBe("whatsapp");
    expect(insertedRow?.capture_occurred_on).toBe("2026-04-10");
    expect(auditDetail?.captureChannel).toBe("whatsapp");
    expect(auditDetail?.captureOccurredOn).toBe("2026-04-10");
    expect(auditDetail?.memoryType).toBe("operator_verbal_capture");
    expect(auditDetail?.audienceSourceTier).toBe("client_visible");
    expect(auditDetail?.proposalOrigin).toBe("assistant_proposed_confirmed");
  });

  it("sets memories.audience_source_tier from validated payload", async () => {
    let insertedRow: Record<string, unknown> | undefined;
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "memories") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            insertedRow = row;
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "mem-tier" },
                    error: null,
                  }),
              }),
            };
          }),
        };
      }
      if (table === "operator_assistant_write_audit") {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "audit-tier" },
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;
    await insertMemoryForOperatorAssistant(supabase, "photo-1", {
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "studio",
      title: "Internal",
      outcome: "Vendor logistics",
      summary: composeOperatorAssistantMemorySummaryForStorage("Vendor logistics", "Dock B", 400),
      fullContent: "Dock B only",
      weddingId: null,
      captureChannel: null,
      captureOccurredOn: null,
      audienceSourceTier: "internal_team",
    });
    expect(insertedRow?.audience_source_tier).toBe("internal_team");
  });

  it("verifies wedding ownership before insert when memoryScope is project", async () => {
    const order: string[] = [];
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "weddings") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => {
                  order.push("weddings");
                  return Promise.resolve({ data: { id: "w1" }, error: null });
                },
              }),
            }),
          }),
        };
      }
      if (table === "memories") {
        return {
          insert: vi.fn(() => ({
            select: () => ({
              single: () => {
                order.push("memories");
                return Promise.resolve({ data: { id: "m2" }, error: null });
              },
            }),
          })),
        };
      }
      if (table === "operator_assistant_write_audit") {
        return {
          insert: () => ({
            select: () => ({
              single: () => {
                order.push("audit");
                return Promise.resolve({ data: { id: "audit-m2" }, error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;
    await insertMemoryForOperatorAssistant(supabase, "photo-1", {
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "project",
      title: "On site",
      outcome: "Ceremony unplugged",
      summary: composeOperatorAssistantMemorySummaryForStorage("Ceremony unplugged", "Summary text here", 400),
      fullContent: "Longer content",
      weddingId: "w1",
      captureChannel: null,
      captureOccurredOn: null,
      audienceSourceTier: "client_visible",
    });
    expect(order).toEqual(["weddings", "memories", "audit"]);
  });

  it("verifies people ownership before insert when memoryScope is person", async () => {
    const order: string[] = [];
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "people") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => {
                  order.push("people");
                  return Promise.resolve({ data: { id: "p1" }, error: null });
                },
              }),
            }),
          }),
        };
      }
      if (table === "memories") {
        return {
          insert: vi.fn(() => ({
            select: () => ({
              single: () => {
                order.push("memories");
                return Promise.resolve({ data: { id: "m3" }, error: null });
              },
            }),
          })),
        };
      }
      if (table === "operator_assistant_write_audit") {
        return {
          insert: () => ({
            select: () => ({
              single: () => {
                order.push("audit");
                return Promise.resolve({ data: { id: "audit-m3" }, error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;
    await insertMemoryForOperatorAssistant(supabase, "photo-1", {
      proposalOrigin: "assistant_proposed_confirmed",
      memoryScope: "person",
      title: "Planner pref",
      outcome: "Email-first",
      summary: composeOperatorAssistantMemorySummaryForStorage("Email-first", "Likes email", 400),
      fullContent: "Likes email summaries",
      weddingId: null,
      personId: "p1",
      captureChannel: null,
      captureOccurredOn: null,
      audienceSourceTier: "client_visible",
    });
    expect(order).toEqual(["people", "memories", "audit"]);
  });
});
