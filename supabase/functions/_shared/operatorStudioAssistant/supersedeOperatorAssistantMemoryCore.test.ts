import { describe, expect, it, vi } from "vitest";
import type { MemoryHeader } from "../memory/fetchMemoryHeaders.ts";
import { selectRelevantMemoryIdsDeterministic } from "../memory/selectRelevantMemoriesForDecisionContext.ts";
import {
  MemorySupersessionError,
  supersedeMemoryForOperatorAssistant,
} from "./supersedeOperatorAssistantMemoryCore.ts";

type MemRow = {
  id: string;
  photographer_id: string;
  archived_at: string | null;
  supersedes_memory_id: string | null;
};

function memoriesTableMock(
  rowsById: Record<string, MemRow | undefined>,
  hooks?: {
    onUpdate?: (payload: Record<string, unknown>, id: string) => void;
  },
) {
  return {
    select: (cols: string) => ({
      eq: (col1: string, val1: string) => ({
        eq: (col2: string, val2: string) => ({
          maybeSingle: async () => {
            if (col1 === "id" && col2 === "photographer_id") {
              const row = rowsById[val1];
              if (!row || row.photographer_id !== val2) {
                return { data: null, error: null };
              }
              const c = cols.replace(/\s+/g, "");
              if (c === "supersedes_memory_id") {
                return {
                  data: { supersedes_memory_id: row.supersedes_memory_id },
                  error: null,
                };
              }
              return { data: row, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
    }),
    update: (payload: Record<string, unknown>) => ({
      eq: (col1: string, val1: string) => ({
        eq: (col2: string, val2: string) => ({
          select: () => ({
            maybeSingle: async () => {
              if (col1 === "id" && col2 === "photographer_id") {
                hooks?.onUpdate?.(payload, val1);
                const row = rowsById[val1];
                if (!row || row.photographer_id !== val2) {
                  return { data: null, error: null };
                }
                row.supersedes_memory_id = payload.supersedes_memory_id as string;
                return { data: { id: val1 }, error: null };
              }
              return { data: null, error: null };
            },
          }),
        }),
      }),
    }),
  };
}

describe("supersedeMemoryForOperatorAssistant", () => {
  const photographerId = "photo-1";
  const newId = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
  const oldId = "11111111-2222-4333-8444-555555555555";

  it("updates superseding row only and records audit", async () => {
    const rows: Record<string, MemRow | undefined> = {
      [newId]: {
        id: newId,
        photographer_id: photographerId,
        archived_at: null,
        supersedes_memory_id: null,
      },
      [oldId]: {
        id: oldId,
        photographer_id: photographerId,
        archived_at: null,
        supersedes_memory_id: null,
      },
    };

    let auditOp: string | undefined;
    const fromMock = vi.fn((table: string) => {
      if (table === "memories") {
        return memoriesTableMock(rows, {
          onUpdate: (payload) => {
            void payload;
          },
        });
      }
      if (table === "operator_assistant_write_audit") {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: () => {
                auditOp = row.operation as string;
                return Promise.resolve({ data: { id: "audit-1" }, error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const out = await supersedeMemoryForOperatorAssistant(
      { from: fromMock } as never,
      photographerId,
      { supersedingMemoryId: newId, supersededMemoryId: oldId },
    );

    expect(out.supersedingMemoryId).toBe(newId);
    expect(out.supersededMemoryId).toBe(oldId);
    expect(out.auditEventId).toBe("audit-1");
    expect(rows[newId]?.supersedes_memory_id).toBe(oldId);
    expect(rows[oldId]?.supersedes_memory_id).toBeNull();
    expect(auditOp).toBe("memory_supersede");
  });

  it("404 when a memory is missing for tenant", async () => {
    const rows: Record<string, MemRow | undefined> = {
      [newId]: {
        id: newId,
        photographer_id: photographerId,
        archived_at: null,
        supersedes_memory_id: null,
      },
    };
    const fromMock = vi.fn((table: string) => {
      if (table === "memories") return memoriesTableMock(rows);
      if (table === "operator_assistant_write_audit") {
        throw new Error("no audit on failure");
      }
      throw new Error(`unexpected ${table}`);
    });

    try {
      await supersedeMemoryForOperatorAssistant(
        { from: fromMock } as never,
        photographerId,
        { supersedingMemoryId: newId, supersededMemoryId: oldId },
      );
      expect.fail("expected MemorySupersessionError");
    } catch (e) {
      expect(e).toBeInstanceOf(MemorySupersessionError);
      expect((e as MemorySupersessionError).status).toBe(404);
      expect((e as MemorySupersessionError).message).toContain("not found");
    }
  });

  it("400 when either memory is archived", async () => {
    const rows: Record<string, MemRow | undefined> = {
      [newId]: {
        id: newId,
        photographer_id: photographerId,
        archived_at: "2026-01-01T00:00:00Z",
        supersedes_memory_id: null,
      },
      [oldId]: {
        id: oldId,
        photographer_id: photographerId,
        archived_at: null,
        supersedes_memory_id: null,
      },
    };
    const fromMock = vi.fn((table: string) => {
      if (table === "memories") return memoriesTableMock(rows);
      throw new Error(`unexpected ${table}`);
    });

    try {
      await supersedeMemoryForOperatorAssistant(
        { from: fromMock } as never,
        photographerId,
        { supersedingMemoryId: newId, supersededMemoryId: oldId },
      );
      expect.fail("expected MemorySupersessionError");
    } catch (e) {
      expect(e).toBeInstanceOf(MemorySupersessionError);
      expect((e as MemorySupersessionError).status).toBe(400);
    }
  });

  it("409 when superseded row already references superseding id", async () => {
    const rows: Record<string, MemRow | undefined> = {
      [newId]: {
        id: newId,
        photographer_id: photographerId,
        archived_at: null,
        supersedes_memory_id: null,
      },
      [oldId]: {
        id: oldId,
        photographer_id: photographerId,
        archived_at: null,
        supersedes_memory_id: newId,
      },
    };
    const fromMock = vi.fn((table: string) => {
      if (table === "memories") return memoriesTableMock(rows);
      throw new Error(`unexpected ${table}`);
    });

    try {
      await supersedeMemoryForOperatorAssistant(
        { from: fromMock } as never,
        photographerId,
        { supersedingMemoryId: newId, supersededMemoryId: oldId },
      );
      expect.fail("expected MemorySupersessionError");
    } catch (e) {
      expect(e).toBeInstanceOf(MemorySupersessionError);
      expect((e as MemorySupersessionError).status).toBe(409);
    }
  });

  it("409 when superseding id appears in older chain from superseded", async () => {
    const mid = "22222222-2222-4333-8444-555555555555";
    const rows: Record<string, MemRow | undefined> = {
      [newId]: {
        id: newId,
        photographer_id: photographerId,
        archived_at: null,
        supersedes_memory_id: null,
      },
      [oldId]: {
        id: oldId,
        photographer_id: photographerId,
        archived_at: null,
        supersedes_memory_id: mid,
      },
      [mid]: {
        id: mid,
        photographer_id: photographerId,
        archived_at: null,
        supersedes_memory_id: newId,
      },
    };
    const fromMock = vi.fn((table: string) => {
      if (table === "memories") return memoriesTableMock(rows);
      throw new Error(`unexpected ${table}`);
    });

    try {
      await supersedeMemoryForOperatorAssistant(
        { from: fromMock } as never,
        photographerId,
        { supersedingMemoryId: newId, supersededMemoryId: oldId },
      );
      expect.fail("expected MemorySupersessionError");
    } catch (e) {
      expect(e).toBeInstanceOf(MemorySupersessionError);
      expect((e as MemorySupersessionError).status).toBe(409);
      expect((e as MemorySupersessionError).message).toMatch(/cycle/i);
    }
  });

  it("MemorySupersessionError exposes status", () => {
    const e = new MemorySupersessionError("x", 418);
    expect(e.status).toBe(418);
  });
});

describe("ranker excludes superseded id after supersession shape (regression)", () => {
  it("matches selectRelevantMemoriesForDecisionContext supersession behavior", () => {
    const w = "w-a";
    const oldId = "old-memory";
    const newId = "new-memory";
    const headers: MemoryHeader[] = [
      {
        id: oldId,
        wedding_id: w,
        person_id: null,
        supersedes_memory_id: null,
        scope: "project",
        type: "note",
        title: "Old",
        summary: "venue venue venue",
      },
      {
        id: newId,
        wedding_id: w,
        person_id: null,
        supersedes_memory_id: oldId,
        scope: "project",
        type: "note",
        title: "New",
        summary: "venue",
      },
    ];
    const ids = selectRelevantMemoryIdsDeterministic({
      photographerId: "photo-1",
      threadId: "thread-1",
      weddingId: w,
      rawMessage: "venue planning",
      threadSummary: null,
      replyModeParticipantPersonIds: [],
      memoryHeaders: headers,
    });
    expect(ids).not.toContain(oldId);
    expect(ids).toContain(newId);
  });
});
