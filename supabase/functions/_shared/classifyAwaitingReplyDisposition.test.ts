import { describe, expect, it, vi } from "vitest";
import { classifyAwaitingReplyDisposition } from "./classifyAwaitingReplyDisposition.ts";

describe("classifyAwaitingReplyDisposition", () => {
  it("returns unresolved without fetch when photographer reply is empty or whitespace", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      classifyAwaitingReplyDisposition({ taskTitle: "Follow up on contract", photographerReply: "" }),
    ).resolves.toBe("unresolved");
    await expect(
      classifyAwaitingReplyDisposition({ taskTitle: "Follow up", photographerReply: "  \n\t  " }),
    ).resolves.toBe("unresolved");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
