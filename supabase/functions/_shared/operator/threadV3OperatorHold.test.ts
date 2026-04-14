import { describe, expect, it, vi } from "vitest";
import { isThreadV3OperatorHold } from "./threadV3OperatorHold.ts";

function mockSupabaseForHold(value: boolean | undefined) {
  const maybeSingle = vi.fn(async () => ({
    data: value === undefined ? null : { v3_operator_automation_hold: value },
    error: null,
  }));
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle,
  };
  return { from: vi.fn(() => chain) };
}

describe("threadV3OperatorHold", () => {
  it("isThreadV3OperatorHold is true when the thread row reports hold", async () => {
    const supabase = mockSupabaseForHold(true) as Parameters<typeof isThreadV3OperatorHold>[0];
    await expect(isThreadV3OperatorHold(supabase, "photo-1", "thread-1")).resolves.toBe(true);
  });

  it("isThreadV3OperatorHold is false when hold is false or missing", async () => {
    const supabaseF = mockSupabaseForHold(false) as Parameters<typeof isThreadV3OperatorHold>[0];
    await expect(isThreadV3OperatorHold(supabaseF, "p", "t")).resolves.toBe(false);

    const supabaseNull = mockSupabaseForHold(undefined) as Parameters<typeof isThreadV3OperatorHold>[0];
    await expect(isThreadV3OperatorHold(supabaseNull, "p", "t")).resolves.toBe(false);
  });
});
