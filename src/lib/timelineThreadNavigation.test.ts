import { describe, expect, it } from "vitest";
import {
  adjacentThreadId,
  isEditableKeyboardTarget,
  threadQueuePosition,
  timelineThreadAltArrowDelta,
} from "./timelineThreadNavigation";

const threads = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("adjacentThreadId", () => {
  it("returns null when fewer than 2 threads", () => {
    expect(adjacentThreadId([{ id: "only" }], "only", 1)).toBeNull();
  });

  it("cycles forward", () => {
    expect(adjacentThreadId(threads, "a", 1)).toBe("b");
    expect(adjacentThreadId(threads, "c", 1)).toBe("a");
  });

  it("cycles backward", () => {
    expect(adjacentThreadId(threads, "b", -1)).toBe("a");
    expect(adjacentThreadId(threads, "a", -1)).toBe("c");
  });
});

describe("threadQueuePosition", () => {
  it("returns 1-based index when id is in list", () => {
    expect(threadQueuePosition(threads, "b")).toEqual({ current: 2, total: 3 });
  });

  it("returns null when id missing or unknown", () => {
    expect(threadQueuePosition(threads, undefined)).toBeNull();
    expect(threadQueuePosition(threads, "x")).toBeNull();
  });
});

describe("timelineThreadAltArrowDelta", () => {
  it("returns deltas only for Alt+Arrow without other modifiers", () => {
    expect(timelineThreadAltArrowDelta({ altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, key: "ArrowLeft" })).toBe(-1);
    expect(timelineThreadAltArrowDelta({ altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, key: "ArrowRight" })).toBe(1);
    expect(timelineThreadAltArrowDelta({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, key: "ArrowLeft" })).toBeNull();
    expect(timelineThreadAltArrowDelta({ altKey: true, ctrlKey: true, metaKey: false, shiftKey: false, key: "ArrowLeft" })).toBeNull();
    expect(timelineThreadAltArrowDelta({ altKey: true, ctrlKey: false, metaKey: false, shiftKey: true, key: "ArrowLeft" })).toBeNull();
  });
});

describe("isEditableKeyboardTarget", () => {
  it("treats textarea and text input as editable", () => {
    expect(
      isEditableKeyboardTarget({ tagName: "TEXTAREA", isContentEditable: false } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isEditableKeyboardTarget({
        tagName: "INPUT",
        type: "text",
        isContentEditable: false,
      } as unknown as EventTarget),
    ).toBe(true);
  });

  it("allows button-like inputs for shortcuts", () => {
    expect(
      isEditableKeyboardTarget({
        tagName: "INPUT",
        type: "checkbox",
        isContentEditable: false,
      } as unknown as EventTarget),
    ).toBe(false);
  });
});
