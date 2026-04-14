import { describe, expect, it, vi, beforeEach } from "vitest";
import { ORCHESTRATOR_STR_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";
import { inngest } from "../inngest.ts";
import { recordStrategicTrustRepairEscalation } from "./recordStrategicTrustRepairEscalation.ts";

vi.mock("../inngest.ts", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined), setEnvVars: vi.fn() },
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT: "operator/escalation.pending_delivery.v1",
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION: 1,
}));

const STR_MSG =
  "I'm confused — last week Ana said you were fully booked and couldn't take our date, but today the email says you'd happily make an exception. Which is accurate?";

function buildSupabaseMock(opts: {
  existingOpenStrId?: string | null;
  dedupeError?: { message: string } | null;
  insertError?: { message: string } | null;
  newEscalationId?: string;
  holdUpdateError?: { message: string } | null;
}) {
  const escalationUpdateRows: unknown[] = [];
  const insertSingle = vi.fn(async () => ({
    data: opts.insertError ? null : { id: opts.newEscalationId ?? "esc-new-1" },
    error: opts.insertError ?? null,
  }));
  const insertFn = vi.fn((_row: unknown) => ({
    select: () => ({
      single: insertSingle,
    }),
  }));
  const dedupeMaybeSingle = vi.fn(async () => ({
    data: opts.dedupeError
      ? null
      : opts.existingOpenStrId
        ? { id: opts.existingOpenStrId }
        : null,
    error: opts.dedupeError ?? null,
  }));
  const escalationChainDedupe = {
    select: vi.fn(() => escalationChainDedupe),
    eq: vi.fn(() => escalationChainDedupe),
    maybeSingle: dedupeMaybeSingle,
  };
  const escalationChainInsert = {
    insert: insertFn,
    update: vi.fn((row: unknown) => {
      escalationUpdateRows.push(row);
      return {
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      };
    }),
  };
  const threadsChain = {
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: opts.holdUpdateError ?? null })),
      })),
    })),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === "escalation_requests") {
        const c = { ...escalationChainDedupe, ...escalationChainInsert };
        return c;
      }
      if (table === "threads") return threadsChain;
      throw new Error(`unexpected table: ${table}`);
    }),
    _dedupeMaybeSingle: dedupeMaybeSingle,
    _insertFn: insertFn,
    _insertSingle: insertSingle,
    _threadsUpdate: threadsChain.update,
    _escalationUpdateRows: escalationUpdateRows,
  };
}

describe("recordStrategicTrustRepairEscalation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no_thread when threadId is null", async () => {
    const supabase = buildSupabaseMock({}) as unknown as Parameters<
      typeof recordStrategicTrustRepairEscalation
    >[0];
    const r = await recordStrategicTrustRepairEscalation(supabase, {
      photographerId: "p1",
      threadId: null,
      weddingId: "w1",
      rawMessage: STR_MSG,
    });
    expect(r).toEqual({ recorded: false, reason: "no_thread" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns not_detected when STR detector does not match", async () => {
    const supabase = buildSupabaseMock({}) as unknown as Parameters<
      typeof recordStrategicTrustRepairEscalation
    >[0];
    const r = await recordStrategicTrustRepairEscalation(supabase, {
      photographerId: "p1",
      threadId: "t1",
      weddingId: "w1",
      rawMessage: "Thanks, see you Saturday.",
    });
    expect(r).toEqual({ recorded: false, reason: "not_detected" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns open_str_escalation_exists without insert when dedupe finds open STR row", async () => {
    const mock = buildSupabaseMock({ existingOpenStrId: "esc-existing" });
    const supabase = mock as unknown as Parameters<typeof recordStrategicTrustRepairEscalation>[0];
    const r = await recordStrategicTrustRepairEscalation(supabase, {
      photographerId: "p1",
      threadId: "t1",
      weddingId: "w1",
      rawMessage: STR_MSG,
    });
    expect(r).toEqual({
      recorded: false,
      reason: "open_str_escalation_exists",
      escalationId: "esc-existing",
    });
    expect(mock._insertSingle).not.toHaveBeenCalled();
    expect(mock._threadsUpdate).not.toHaveBeenCalled();
  });

  it("inserts escalation, updates thread hold, and returns recorded true on happy path", async () => {
    const mock = buildSupabaseMock({ newEscalationId: "esc-str-99" });
    const supabase = mock as unknown as Parameters<typeof recordStrategicTrustRepairEscalation>[0];
    const r = await recordStrategicTrustRepairEscalation(supabase, {
      photographerId: "p1",
      threadId: "t1",
      weddingId: "w1",
      rawMessage: STR_MSG,
      threadContextSnippet: "prior context",
    });
    expect(r).toEqual({ recorded: true, escalationId: "esc-str-99" });
    expect(mock._dedupeMaybeSingle).toHaveBeenCalled();
    expect(mock._insertSingle).toHaveBeenCalled();
    expect(mock._threadsUpdate).toHaveBeenCalled();
    expect(mock._insertFn).toHaveBeenCalled();
    const insertRow = mock._insertFn.mock.calls[0]?.[0] as {
      reason_code: string;
      action_key: string;
      status: string;
    };
    expect(insertRow.reason_code).toBe("STR_CONTRADICTION_REPAIR_V1");
    expect(insertRow.action_key).toBe("orchestrator.client.v1.strategic_trust_repair.v1");
    expect(insertRow.status).toBe("open");
    expect(vi.mocked(inngest.send)).toHaveBeenCalledTimes(1);
  });

  it("returns hold_update_failed, dismisses escalation, and does not send operator delivery when thread hold fails", async () => {
    const mock = buildSupabaseMock({ newEscalationId: "esc-str-hold-fail", holdUpdateError: { message: "rls" } });
    const supabase = mock as unknown as Parameters<typeof recordStrategicTrustRepairEscalation>[0];
    const r = await recordStrategicTrustRepairEscalation(supabase, {
      photographerId: "p1",
      threadId: "t1",
      weddingId: "w1",
      rawMessage: STR_MSG,
    });
    expect(r).toEqual({
      recorded: false,
      reason: "hold_update_failed",
      escalationId: "esc-str-hold-fail",
    });
    expect(vi.mocked(inngest.send)).not.toHaveBeenCalled();
    expect(mock._escalationUpdateRows.length).toBeGreaterThanOrEqual(2);
    const dismissRow = mock._escalationUpdateRows[1] as { status: string; resolution_text?: string };
    expect(dismissRow.status).toBe("dismissed");
    expect(dismissRow.resolution_text).toMatch(/hold could not be applied/);
  });

  it("returns dedupe_query_failed when dedupe query errors", async () => {
    const mock = buildSupabaseMock({ dedupeError: { message: "db down" } });
    const supabase = mock as unknown as Parameters<typeof recordStrategicTrustRepairEscalation>[0];
    const r = await recordStrategicTrustRepairEscalation(supabase, {
      photographerId: "p1",
      threadId: "t1",
      weddingId: null,
      rawMessage: STR_MSG,
    });
    expect(r).toEqual({ recorded: false, reason: "dedupe_query_failed" });
    expect(mock._insertSingle).not.toHaveBeenCalled();
  });

  it("uses STR stable reason code matching ORCHESTRATOR_STR_ESCALATION_REASON_CODES", async () => {
    expect(ORCHESTRATOR_STR_ESCALATION_REASON_CODES.contradiction_or_expectation_repair_request).toBe(
      "STR_CONTRADICTION_REPAIR_V1",
    );
  });
});
