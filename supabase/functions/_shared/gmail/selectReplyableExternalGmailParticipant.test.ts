import { describe, expect, it } from "vitest";

import { selectReplyableExternalGmailParticipant } from "./selectReplyableExternalGmailParticipant.ts";

describe("selectReplyableExternalGmailParticipant", () => {
  const primary = "photographer@gmail.com";
  const selfMailboxes = [primary, "bookings@mybrand.com"];

  it("chooses latest inbound external client", () => {
    const rows = [
      { id: "1", direction: "in", sender: "first@client.com", provider_message_id: "g1" },
      { id: "2", direction: "out", sender: primary, provider_message_id: "g2" },
      { id: "3", direction: "in", sender: "Second <second@client.com>", provider_message_id: "g3" },
    ];
    const r = selectReplyableExternalGmailParticipant(rows, selfMailboxes);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.anchorProviderMessageId).toBe("g3");
    expect(r.normalizedMailbox).toBe("second@client.com");
    expect(r.displayTo).toContain("second@client.com");
  });

  it("skips latest inbound when sender is the connected mailbox (dot variant)", () => {
    const rows = [
      { id: "1", direction: "in", sender: "lead@external.com", provider_message_id: "g1" },
      {
        id: "2",
        direction: "in",
        sender: "Studio <photo.grapher@gmail.com>",
        provider_message_id: "g_self",
      },
    ];
    const r = selectReplyableExternalGmailParticipant(rows, [primary]);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.anchorProviderMessageId).toBe("g1");
    expect(r.normalizedMailbox).toBe("lead@external.com");
  });

  it("skips Gmail send-as alias treated as self even if not primary connected row", () => {
    const rows = [
      { id: "1", direction: "in", sender: "lead@external.com", provider_message_id: "g1" },
      {
        id: "2",
        direction: "in",
        sender: "Studio Brand <bookings@mybrand.com>",
        provider_message_id: "g_alias",
      },
    ];
    const r = selectReplyableExternalGmailParticipant(rows, selfMailboxes);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.anchorProviderMessageId).toBe("g1");
  });

  it("skips system-like senders and falls back", () => {
    const rows = [
      { id: "1", direction: "in", sender: "human@corp.com", provider_message_id: "gh" },
      { id: "2", direction: "in", sender: "Newsletter <newsletter@vendor.com>", provider_message_id: "gn" },
    ];
    const r = selectReplyableExternalGmailParticipant(rows, selfMailboxes);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.anchorProviderMessageId).toBe("gh");
  });

  it("skips inbound without provider_message_id", () => {
    const rows = [
      { id: "1", direction: "in", sender: "good@client.com", provider_message_id: "g1" },
      { id: "2", direction: "in", sender: "orphan@client.com", provider_message_id: null },
    ];
    const r = selectReplyableExternalGmailParticipant(rows, selfMailboxes);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.anchorProviderMessageId).toBe("g1");
  });

  it("returns error when only self-like inbound exists", () => {
    const rows = [
      {
        id: "1",
        direction: "in",
        sender: primary,
        provider_message_id: "g1",
      },
    ];
    const r = selectReplyableExternalGmailParticipant(rows, selfMailboxes);
    expect(r.kind).toBe("error");
    if (r.kind !== "ok") {
      expect(r.code).toBe("no_replyable_external_recipient_found");
    }
  });

  it("returns error when self mailbox list is empty", () => {
    const rows = [{ id: "1", direction: "in", sender: "a@b.com", provider_message_id: "g1" }];
    const r = selectReplyableExternalGmailParticipant(rows, []);
    expect(r.kind).toBe("error");
    if (r.kind !== "ok") expect(r.code).toBe("missing_self_mailbox_identities");
  });
});
