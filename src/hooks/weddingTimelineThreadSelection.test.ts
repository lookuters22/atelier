import { describe, expect, it } from "vitest";
import { nextWeddingTimelineThreadId } from "./weddingTimelineThreadSelection";

const W = ["run-of-show", "timeline", "venue"];

describe("nextWeddingTimelineThreadId", () => {
  it("selects preferred thread when selection empty and preferred is in list (deep link wins over first thread)", () => {
    const r = nextWeddingTimelineThreadId(W, "", "timeline", false);
    expect(r).toEqual({ selected: "timeline", markAwaitingPreferred: false });
  });

  it("selects different preferred threads for same wedding ids (two deep links → two selections)", () => {
    const a = nextWeddingTimelineThreadId(W, "", "run-of-show", false);
    const b = nextWeddingTimelineThreadId(W, "", "venue", false);
    expect(a?.selected).toBe("run-of-show");
    expect(b?.selected).toBe("venue");
    expect(a?.selected).not.toBe(b?.selected);
  });

  it("does not override a valid non-first selection with first thread", () => {
    expect(nextWeddingTimelineThreadId(W, "venue", "timeline", false)).toBeNull();
  });

  it("when preferred not in list yet, falls back to first and marks awaiting preferred", () => {
    const r = nextWeddingTimelineThreadId(W, "", "later-thread-id", false);
    expect(r).toEqual({ selected: "run-of-show", markAwaitingPreferred: true });
  });

  it("upgrades from auto-picked first to preferred when preferred appears in list", () => {
    const extended = ["run-of-show", "timeline", "later-thread-id"];
    const r = nextWeddingTimelineThreadId(
      extended,
      "run-of-show",
      "later-thread-id",
      true,
    );
    expect(r).toEqual({ selected: "later-thread-id", markAwaitingPreferred: false });
  });

  it("first-thread fallback when no preferred and selection invalid", () => {
    expect(nextWeddingTimelineThreadId(W, "", null, false)).toEqual({
      selected: "run-of-show",
      markAwaitingPreferred: false,
    });
  });

  it("no change when no preferred and selection already valid", () => {
    expect(nextWeddingTimelineThreadId(W, "timeline", null, false)).toBeNull();
  });
});
