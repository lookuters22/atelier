import { describe, expect, it } from "vitest";
import {
  emailSubjectFromGmailMessage,
  extractInboundFieldsFromGmailMessage,
  threadTitleFromGmailMessage,
} from "./gmailDeltaInboundMessage.ts";
import type { GmailFullThreadMessage } from "./gmailThreads.ts";

function msg(partial: Partial<GmailFullThreadMessage>): GmailFullThreadMessage {
  return {
    id: "m1",
    threadId: "t1",
    labelIds: [],
    ...partial,
  } as GmailFullThreadMessage;
}

describe("threadTitleFromGmailMessage", () => {
  it("uses Subject when present", () => {
    const m = msg({
      payload: {
        headers: [
          { name: "Subject", value: "  Venue deposit question  " },
          { name: "From", value: "a@b.com" },
        ],
      },
      snippet: "short",
    });
    expect(threadTitleFromGmailMessage(m)).toBe("Venue deposit question");
  });

  it("falls back to snippet when Subject empty", () => {
    const m = msg({
      payload: { headers: [{ name: "From", value: "a@b.com" }] },
      snippet: "  snippet line  ",
    });
    expect(threadTitleFromGmailMessage(m)).toBe("snippet line");
  });

  it("uses minimal placeholder when no subject or snippet", () => {
    const m = msg({ payload: { headers: [] } });
    expect(threadTitleFromGmailMessage(m)).toBe("(no subject)");
  });
});

describe("emailSubjectFromGmailMessage", () => {
  it("returns null when Subject missing", () => {
    const m = msg({
      payload: { headers: [{ name: "From", value: "x@y.com" }] },
      snippet: "only snippet",
    });
    expect(emailSubjectFromGmailMessage(m)).toBeNull();
  });
});

describe("extractInboundFieldsFromGmailMessage", () => {
  it("stores Reply-To on gmail_import for post-ingest identity parity with raw_email ingress", () => {
    const m = msg({
      payload: {
        headers: [
          { name: "From", value: "Auto <noreply@auto.example>" },
          { name: "Reply-To", value: "Person <person@human.example>" },
        ],
      },
      snippet: "x",
    });
    const row = extractInboundFieldsFromGmailMessage(m, "gt1");
    const gi = row.metadata.gmail_import as Record<string, unknown>;
    expect(gi.reply_to_header).toBe("Person <person@human.example>");
    expect(row.sender).toContain("noreply@auto.example");
  });

  it("sets reply_to_header null when header absent", () => {
    const m = msg({
      payload: { headers: [{ name: "From", value: "solo@example.com" }] },
    });
    const row = extractInboundFieldsFromGmailMessage(m, "gt2");
    const gi = row.metadata.gmail_import as Record<string, unknown>;
    expect(gi.reply_to_header).toBeNull();
  });
});
