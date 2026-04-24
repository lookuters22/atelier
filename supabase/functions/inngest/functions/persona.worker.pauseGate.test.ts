/**
 * Worker-level regression: final save-draft pause gate fail-closed (no drafts.insert).
 * Uses vitest.context.config.ts (npm: + path aliases for supabase/functions).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WEDDING_PAUSE_STATE_DB_ERROR,
  WEDDING_PAUSE_STATE_UNREADABLE,
} from "../../_shared/fetchWeddingPauseFlags.ts";

const mockCtx = vi.hoisted(() => ({
  weddingCalls: 0,
  secondWeddingRead: { data: null as unknown, error: null as unknown },
}));

const draftsInsertSpy = vi.hoisted(() => vi.fn());

vi.mock("../../_shared/inngest.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../_shared/inngest.ts")>();
  return {
    ...actual,
    inngest: {
      ...actual.inngest,
      createFunction: vi.fn((_meta: unknown, _trigger: unknown, fn: unknown) => fn),
    },
  };
});

vi.mock("../../_shared/supabase.ts", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === "weddings") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => {
          mockCtx.weddingCalls += 1;
          if (mockCtx.weddingCalls === 1) {
            return {
              data: {
                couple_names: "Alex & Sam",
                wedding_date: null,
                location: "Somewhere",
                stage: "inquiry",
                compassion_pause: false,
                strategic_pause: false,
              },
              error: null,
            };
          }
          return mockCtx.secondWeddingRead;
        });
        return chain;
      }
      if (table === "photographers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { settings: {} }, error: null })),
            })),
          })),
        };
      }
      if (table === "drafts") {
        return {
          insert: draftsInsertSpy.mockImplementation(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "draft-should-not-exist" }, error: null })),
            })),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  },
}));

type PersonaHandler = (args: {
  event: { data: Record<string, unknown> };
  step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> };
}) => Promise<unknown>;

describe("persona worker — save-draft-pause-gate (worker-level)", () => {
  let personaHandler: PersonaHandler;

  beforeAll(async () => {
    const mod = await import("./persona.ts");
    personaHandler = mod.personaFunction as unknown as PersonaHandler;
  });

  beforeEach(() => {
    mockCtx.weddingCalls = 0;
    mockCtx.secondWeddingRead = { data: null, error: null };
    draftsInsertSpy.mockClear();
  });

  it("returns skipped_wedding_pause_state_unreadable and does not insert draft when fresh read loses row", async () => {
    mockCtx.secondWeddingRead = { data: null, error: null };

    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === "writer-persona-rag-tool-loop") {
          return {
            draftBody: "Synthetic draft for test.",
            usage_totals: { input_tokens: 1, output_tokens: 1 },
          };
        }
        return fn();
      }),
    };

    const result = await personaHandler({
      event: {
        data: {
          wedding_id: "w1",
          thread_id: "t1",
          photographer_id: "p1",
          raw_facts: "facts",
        },
      },
      step,
    });

    expect(result).toEqual({
      status: "skipped_wedding_pause_state_unconfirmed",
      skip_reason: WEDDING_PAUSE_STATE_UNREADABLE,
      wedding_id: "w1",
      thread_id: "t1",
    });
    expect(draftsInsertSpy).not.toHaveBeenCalled();
    const stepNames = step.run.mock.calls.map((c) => c[0]);
    expect(stepNames).toContain("save-draft-pause-gate");
    expect(stepNames).not.toContain("save-draft");
  });

  it("returns skipped_wedding_pause_state_unconfirmed with db_error and does not insert draft", async () => {
    mockCtx.secondWeddingRead = { data: null, error: { message: "db failure" } };

    const step = {
      run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
        if (name === "writer-persona-rag-tool-loop") {
          return {
            draftBody: "Synthetic draft for test.",
            usage_totals: { input_tokens: 1, output_tokens: 1 },
          };
        }
        return fn();
      }),
    };

    const result = await personaHandler({
      event: {
        data: {
          wedding_id: "w1",
          thread_id: "t1",
          photographer_id: "p1",
          raw_facts: "",
        },
      },
      step,
    });

    expect(result).toMatchObject({
      status: "skipped_wedding_pause_state_unconfirmed",
      skip_reason: WEDDING_PAUSE_STATE_DB_ERROR,
    });
    expect(draftsInsertSpy).not.toHaveBeenCalled();
    const stepNames = step.run.mock.calls.map((c) => c[0]);
    expect(stepNames).not.toContain("save-draft");
  });
});
