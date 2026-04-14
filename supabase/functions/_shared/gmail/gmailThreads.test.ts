import { describe, expect, it } from "vitest";
import {
  normalizeGmailLabelsResponse,
  parseGmailThreadMessageRefsFromMetadataJson,
  pickLatestGmailMessageRef,
  pickLatestGmailThreadMessage,
} from "./gmailThreads.ts";

describe("normalizeGmailLabelsResponse", () => {
  it("maps Gmail labels.list JSON", () => {
    const parsed = normalizeGmailLabelsResponse({
      labels: [
        { id: "INBOX", name: "INBOX", type: "system" },
        { id: "Label_1", name: "Clients", type: "user" },
        { id: "no-name" },
      ],
    });
    expect(parsed).toEqual([
      { id: "INBOX", name: "INBOX", type: "system" },
      { id: "Label_1", name: "Clients", type: "user" },
    ]);
  });

  it("returns empty for invalid input", () => {
    expect(normalizeGmailLabelsResponse(null)).toEqual([]);
    expect(normalizeGmailLabelsResponse({})).toEqual([]);
  });
});

describe("parseGmailThreadMessageRefsFromMetadataJson", () => {
  it("extracts id and internalDate from threads.get metadata shape", () => {
    const refs = parseGmailThreadMessageRefsFromMetadataJson({
      messages: [
        { id: "m1", internalDate: "100" },
        { id: "m2", internalDate: "200" },
      ],
    });
    expect(refs).toEqual([
      { id: "m1", internalDate: "100" },
      { id: "m2", internalDate: "200" },
    ]);
  });
});

describe("pickLatestGmailMessageRef vs pickLatestGmailThreadMessage", () => {
  it("agrees on latest id when internalDate differs", () => {
    const refs = [
      { id: "old", internalDate: "100" },
      { id: "new", internalDate: "300" },
    ];
    const full = [
      { id: "old", internalDate: "100", payload: {} },
      { id: "new", internalDate: "300", payload: {} },
    ];
    expect(pickLatestGmailMessageRef(refs)?.id).toBe("new");
    expect(pickLatestGmailThreadMessage(full)?.id).toBe("new");
  });
});
