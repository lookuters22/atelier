import { describe, expect, it } from "vitest";
import { GMAIL_HTML_MAX_STORAGE_CHARS } from "./gmailHtmlLimits.ts";

describe("gmailHtmlLimits", () => {
  it("uses 1.5M cap for storage-aligned pipeline", () => {
    expect(GMAIL_HTML_MAX_STORAGE_CHARS).toBe(1_500_000);
  });
});
