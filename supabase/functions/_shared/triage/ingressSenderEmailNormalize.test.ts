import { describe, expect, it } from "vitest";
import { extractReplyToFromRawEmailPayload } from "./rawEmailIngressSuppressionGate.ts";
import {
  normalizeIngressSenderEmailForIdentity,
  resolveIngressIdentitySenderEmail,
} from "./ingressSenderEmailNormalize.ts";

describe("normalizeIngressSenderEmailForIdentity", () => {
  it("repeat-delivery / duplicate shape: display-name From matches bare address normalization", () => {
    expect(normalizeIngressSenderEmailForIdentity(`"Jane" <jane@example.com>`)).toBe(
      normalizeIngressSenderEmailForIdentity("jane@example.com"),
    );
    expect(normalizeIngressSenderEmailForIdentity(`"Jane" <jane@example.com>`)).toBe("jane@example.com");
  });
});

describe("resolveIngressIdentitySenderEmail", () => {
  it("P17 / venue automation stress: no-reply From + Reply-To yields human planner address", () => {
    expect(
      resolveIngressIdentitySenderEmail({
        fromOrSenderRaw: "Venue Reservations <noreply@venue.example>",
        replyToRaw: "Lead Planner <planner@brand.example>",
      }),
    ).toBe("planner@brand.example");
  });

  it("does not substitute Reply-To when From looks human (explicit, avoids silent wrong identity)", () => {
    expect(
      resolveIngressIdentitySenderEmail({
        fromOrSenderRaw: "Real Couple <real@client.example>",
        replyToRaw: "Other <other@notused.example>",
      }),
    ).toBe("real@client.example");
  });

  it("safe ambiguity: no_reply From with unparseable Reply-To keeps From-derived address", () => {
    expect(
      resolveIngressIdentitySenderEmail({
        fromOrSenderRaw: "No Reply <noreply@service.example>",
        replyToRaw: "not-an-email",
      }),
    ).toBe("noreply@service.example");
  });

  it("cross-lane parity: raw_email Reply-To header vs gmail_import string yields same identity email", () => {
    const replyLine = "Coordinator <coord@events.example>";
    const fromNoReply = "Ticketing <noreply@tickets.example>";
    const rawReply = extractReplyToFromRawEmailPayload({
      headers: [{ name: "Reply-To", value: `  ${replyLine}  ` }],
    });
    expect(rawReply).toBe(replyLine.trim());
    const fromRawPayload = resolveIngressIdentitySenderEmail({
      fromOrSenderRaw: fromNoReply,
      replyToRaw: rawReply,
    });
    const fromGmailMeta = resolveIngressIdentitySenderEmail({
      fromOrSenderRaw: fromNoReply,
      replyToRaw: replyLine,
    });
    expect(fromRawPayload).toBe(fromGmailMeta);
    expect(fromRawPayload).toBe("coord@events.example");
  });
});
