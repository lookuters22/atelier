import { describe, expect, it } from "vitest";
import {
  shouldSkipInboxHydrationApply,
  shouldStripInboxUrlAfterDraftReviewHydration,
  shouldStripInboxUrlAfterUnfiledThreadHydration,
  signatureForInboxDeepLinkPayload,
} from "./inboxUrlHydrationPolicy";

describe("shouldStripInboxUrlAfterDraftReviewHydration", () => {
  it("does not strip on successful match with usable wedding (URL stays canonical for refresh / StrictMode)", () => {
    expect(
      shouldStripInboxUrlAfterDraftReviewHydration({
        draftsFetchError: false,
        draftFound: true,
        hasUsableWeddingId: true,
      }),
    ).toBe(false);
  });

  it("strips on drafts fetch error", () => {
    expect(
      shouldStripInboxUrlAfterDraftReviewHydration({
        draftsFetchError: true,
        draftFound: false,
        hasUsableWeddingId: false,
      }),
    ).toBe(true);
  });

  it("strips when draft row not found (unresolved)", () => {
    expect(
      shouldStripInboxUrlAfterDraftReviewHydration({
        draftsFetchError: false,
        draftFound: false,
        hasUsableWeddingId: false,
      }),
    ).toBe(true);
  });

  it("strips when draft has no usable wedding (missing wedding notice)", () => {
    expect(
      shouldStripInboxUrlAfterDraftReviewHydration({
        draftsFetchError: false,
        draftFound: true,
        hasUsableWeddingId: false,
      }),
    ).toBe(true);
  });
});

describe("signatureForInboxDeepLinkPayload + shouldSkipInboxHydrationApply", () => {
  it("gives different signatures for different draft targets on the same wedding (threadId + draftId)", () => {
    const a = signatureForInboxDeepLinkPayload({
      threadId: "t-a",
      draftId: "d-1",
      action: "review_draft",
    });
    const b = signatureForInboxDeepLinkPayload({
      threadId: "t-b",
      draftId: "d-2",
      action: "review_draft",
    });
    expect(a).not.toBe(b);
  });

  it("does not skip when nothing processed yet (refresh / first mount)", () => {
    const sig = signatureForInboxDeepLinkPayload({
      threadId: "t1",
      draftId: "d1",
      action: "review_draft",
    });
    expect(shouldSkipInboxHydrationApply(null, sig)).toBe(false);
  });

  it("skips re-apply when the same signature was already processed (drafts refetch / rerender)", () => {
    const sig = signatureForInboxDeepLinkPayload({
      threadId: "t1",
      draftId: "d1",
      action: "review_draft",
    });
    expect(shouldSkipInboxHydrationApply(sig, sig)).toBe(true);
  });

  it("does not skip when URL navigates to another draft (signature changes)", () => {
    const first = signatureForInboxDeepLinkPayload({
      threadId: "t1",
      draftId: "d1",
      action: "review_draft",
    });
    const second = signatureForInboxDeepLinkPayload({
      threadId: "t2",
      draftId: "d1",
      action: "review_draft",
    });
    expect(shouldSkipInboxHydrationApply(first, second)).toBe(false);
  });
});

describe("shouldStripInboxUrlAfterUnfiledThreadHydration", () => {
  it("does not strip when thread matched (deep link stable on refresh)", () => {
    expect(shouldStripInboxUrlAfterUnfiledThreadHydration(true)).toBe(false);
  });

  it("strips when thread id not in unfiled list", () => {
    expect(shouldStripInboxUrlAfterUnfiledThreadHydration(false)).toBe(true);
  });
});
