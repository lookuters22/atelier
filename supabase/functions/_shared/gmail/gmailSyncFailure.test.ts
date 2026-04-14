import { describe, expect, it } from "vitest";
import { summarizeGmailSyncFailure } from "./gmailSyncFailure.ts";

describe("summarizeGmailSyncFailure", () => {
  it("bounds Error messages for sync_error_summary", () => {
    const long = "x".repeat(600);
    const err = new Error(long);
    expect(summarizeGmailSyncFailure(err).length).toBe(500);
    expect(summarizeGmailSyncFailure(err)).toBe(long.slice(0, 500));
  });

  it("maps thrown sync failures to a stable string (worker catch uses this for sync_status=error)", () => {
    expect(summarizeGmailSyncFailure(new Error("threads.list failed"))).toBe("threads.list failed");
    expect(summarizeGmailSyncFailure("boom")).toBe("boom");
  });
});
