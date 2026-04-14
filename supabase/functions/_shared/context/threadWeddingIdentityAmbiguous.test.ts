import { describe, expect, it } from "vitest";
import {
  IDENTITY_THREAD_MULTI_WEDDING_BLOCKER,
  isThreadWeddingIdentityAmbiguous,
} from "./threadWeddingIdentityAmbiguous.ts";

describe("isThreadWeddingIdentityAmbiguous", () => {
  it("is false without thread", () => {
    expect(isThreadWeddingIdentityAmbiguous({ threadId: null, candidateWeddingIds: ["a", "b"] })).toBe(
      false,
    );
  });

  it("is false with thread but fewer than two candidate weddings", () => {
    expect(
      isThreadWeddingIdentityAmbiguous({
        threadId: "t1",
        candidateWeddingIds: ["w1"],
      }),
    ).toBe(false);
    expect(
      isThreadWeddingIdentityAmbiguous({
        threadId: "t1",
        candidateWeddingIds: [],
      }),
    ).toBe(false);
  });

  it("is true when thread exists and at least two distinct candidate wedding ids", () => {
    expect(
      isThreadWeddingIdentityAmbiguous({
        threadId: "t1",
        candidateWeddingIds: ["w1", "w2"],
      }),
    ).toBe(true);
  });

  it("exports stable blocker constant", () => {
    expect(IDENTITY_THREAD_MULTI_WEDDING_BLOCKER).toBe("identity_thread_multi_wedding");
  });
});
