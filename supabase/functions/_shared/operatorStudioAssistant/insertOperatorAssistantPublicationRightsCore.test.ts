import { describe, expect, it, vi } from "vitest";
import { insertPublicationRightsRecordForOperatorAssistant } from "./insertOperatorAssistantPublicationRightsCore.ts";

describe("insertPublicationRightsRecordForOperatorAssistant", () => {
  it("inserts project_publication_rights and audit", async () => {
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "weddings") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { id: "aaaaaaaa-bbbb-4ccc-bddd-111111111111" }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "project_publication_rights") {
        return {
          insert: vi.fn(() => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "pr-1" },
                  error: null,
                }),
            }),
          })),
        };
      }
      if (table === "operator_assistant_write_audit") {
        return {
          insert: vi.fn(() => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "audit-1" },
                  error: null,
                }),
            }),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const supabase = { from: fromMock } as never;

    const out = await insertPublicationRightsRecordForOperatorAssistant(supabase, "photo-1", {
      weddingId: "aaaaaaaa-bbbb-4ccc-bddd-111111111111",
      personId: null,
      clientThreadId: null,
      permissionStatus: "withheld_pending_client_approval",
      permittedUsageChannels: [],
      attributionRequired: false,
      attributionDetail: null,
      exclusionNotes: null,
      validUntil: null,
      evidenceSource: "client_email_thread",
      operatorConfirmationSummary: "No publish until couple signs off — from inbox review.",
    });

    expect(out.id).toBe("pr-1");
    expect(out.auditId).toBe("audit-1");
  });
});
