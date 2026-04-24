import { describe, expect, it } from "vitest";
import {
  MAX_INBOUND_TEXT_CHARS_FOR_MODEL,
  sanitizeInboundTextForModelContext,
} from "./sanitizeInboundTextForModelContext.ts";
import { SENSITIVE_DOCUMENT_REDACTION_TOKEN } from "./redactSensitiveDocumentPatternsForModelContext.ts";

describe("sanitizeInboundTextForModelContext", () => {
  it("passes through normal short text", () => {
    expect(sanitizeInboundTextForModelContext("Hello, when is our engagement session?")).toBe(
      "Hello, when is our engagement session?",
    );
  });

  it("truncates very long strings", () => {
    const long = "a".repeat(MAX_INBOUND_TEXT_CHARS_FOR_MODEL + 500);
    const out = sanitizeInboundTextForModelContext(long);
    expect(out.length).toBeLessThanOrEqual(MAX_INBOUND_TEXT_CHARS_FOR_MODEL + 80);
    expect(out).toContain("truncated for model context safety");
  });

  it("replaces binary-like high-control-character payloads", () => {
    const buf = "\x00".repeat(40) + "x".repeat(60);
    expect(sanitizeInboundTextForModelContext(buf)).toContain("omitted");
  });

  it("treats null/undefined as empty", () => {
    expect(sanitizeInboundTextForModelContext(null)).toBe("");
    expect(sanitizeInboundTextForModelContext(undefined)).toBe("");
  });

  it("applies sensitive-document / payment redaction before truncation", () => {
    const pan = "Payment 5555 5555 5555 4444 thanks";
    expect(sanitizeInboundTextForModelContext(pan)).toContain(SENSITIVE_DOCUMENT_REDACTION_TOKEN);
    expect(sanitizeInboundTextForModelContext(pan)).not.toContain("5555");
  });
});
