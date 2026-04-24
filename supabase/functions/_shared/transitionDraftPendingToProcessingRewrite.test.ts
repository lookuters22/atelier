import { describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("./supabase.ts", () => ({
  supabaseAdmin: {
    from: fromMock,
  },
}));

import { transitionDraftPendingToProcessingRewrite } from "./transitionDraftPendingToProcessingRewrite.ts";

function chainReturn(result: { data: unknown; error: { message: string } | null }) {
  return {
    update: () => ({
      eq: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: () => Promise.resolve(result),
          }),
        }),
      }),
    }),
  };
}

describe("transitionDraftPendingToProcessingRewrite", () => {
  it("returns transitioned: true when the update returns a row", async () => {
    fromMock.mockReturnValue(
      chainReturn({ data: { id: "d1" }, error: null }),
    );

    const out = await transitionDraftPendingToProcessingRewrite("d1");

    expect(out.error).toBeNull();
    expect(out.transitioned).toBe(true);
    expect(fromMock).toHaveBeenCalledWith("drafts");
  });

  it("returns transitioned: false when the update matches no row", async () => {
    fromMock.mockReturnValue(
      chainReturn({ data: null, error: null }),
    );

    const out = await transitionDraftPendingToProcessingRewrite("gone");

    expect(out.error).toBeNull();
    expect(out.transitioned).toBe(false);
  });

  it("returns error when Supabase returns an error", async () => {
    fromMock.mockReturnValue(
      chainReturn({ data: null, error: { message: "permission denied" } }),
    );

    const out = await transitionDraftPendingToProcessingRewrite("d1");

    expect(out.error).toBe("permission denied");
    expect(out.transitioned).toBe(false);
  });
});
