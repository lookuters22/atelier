import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../http/fetchWithTimeout.ts", () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchWithTimeout } from "../http/fetchWithTimeout.ts";
import { extractSendAsEmailsFromGmailResponse, resolveConnectedGoogleSelfMailboxes } from "./gmailSelfMailboxes.ts";
import { mergeSelfMailboxList, mailboxMatchesAnySelfIdentity } from "./mailboxNormalize.ts";

describe("extractSendAsEmailsFromGmailResponse", () => {
  it("pulls sendAsEmail from Gmail JSON shape", () => {
    const body = {
      sendAs: [
        { sendAsEmail: "primary@gmail.com", isPrimary: true },
        { sendAsEmail: "alias@custom.com", displayName: "Studio" },
      ],
    };
    expect(extractSendAsEmailsFromGmailResponse(body)).toEqual([
      "primary@gmail.com",
      "alias@custom.com",
    ]);
  });

  it("returns empty for malformed payloads", () => {
    expect(extractSendAsEmailsFromGmailResponse(null)).toEqual([]);
    expect(extractSendAsEmailsFromGmailResponse({})).toEqual([]);
  });
});

describe("mergeSelfMailboxList (Edge)", () => {
  it("dedupes by normalized mailbox and prefers primary first", () => {
    expect(mergeSelfMailboxList("A@Gmail.com", ["a@gmail.com", "b@x.com"])).toEqual([
      "A@Gmail.com",
      "b@x.com",
    ]);
  });
});

describe("mailboxMatchesAnySelfIdentity (Edge)", () => {
  it("matches any alias in the self set", () => {
    const self = ["me@gmail.com", "bookings@brand.com"];
    expect(mailboxMatchesAnySelfIdentity("bookings@brand.com", self)).toBe(true);
    expect(mailboxMatchesAnySelfIdentity("client@x.com", self)).toBe(false);
  });
});

describe("resolveConnectedGoogleSelfMailboxes", () => {
  beforeEach(() => {
    vi.mocked(fetchWithTimeout).mockReset();
  });

  it("falls back to primary-only when sendAs HTTP fails", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(new Response("Forbidden", { status: 403 }));
    const out = await resolveConnectedGoogleSelfMailboxes("token", "primary@gmail.com");
    expect(out).toEqual(["primary@gmail.com"]);
  });

  it("merges sendAs when HTTP succeeds", async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      new Response(
        JSON.stringify({
          sendAs: [{ sendAsEmail: "primary@gmail.com" }, { sendAsEmail: "alias@x.com" }],
        }),
        { status: 200 },
      ),
    );
    const out = await resolveConnectedGoogleSelfMailboxes("token", "primary@gmail.com");
    expect(out).toContain("primary@gmail.com");
    expect(out).toContain("alias@x.com");
  });
});
