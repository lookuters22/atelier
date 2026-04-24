import { describe, expect, it } from "vitest";
import {
  evaluateRawEmailIngressSuppression,
  extractEmailHeadersForSuppression,
  extractReplyToFromRawEmailPayload,
} from "./rawEmailIngressSuppressionGate.ts";

describe("extractEmailHeadersForSuppression", () => {
  it("reads lowercase keys from headers object", () => {
    const h = extractEmailHeadersForSuppression({
      headers: { "List-Unsubscribe": "<https://x.com/u>", Precedence: "bulk" },
    });
    expect(h?.["list-unsubscribe"]).toContain("https://");
    expect(h?.precedence).toBe("bulk");
  });

  it("normalizes RFC822-style header array { name, value }", () => {
    const h = extractEmailHeadersForSuppression({
      headers: [
        { name: "List-Unsubscribe", value: "<https://lists.example/unsub>" },
        { name: "Precedence", value: "bulk" },
      ],
    });
    expect(h?.["list-unsubscribe"]).toContain("lists.example");
    expect(h?.precedence).toBe("bulk");
  });

  it("accepts Name/Value casing on array items", () => {
    const h = extractEmailHeadersForSuppression({
      Headers: [{ Name: "Precedence", Value: "list" }],
    });
    expect(h?.precedence).toBe("list");
  });

  it("ignores malformed array entries", () => {
    const h = extractEmailHeadersForSuppression({
      headers: [
        null,
        "not-an-object",
        { name: 1, value: "x" },
        { name: "Ok-Header", value: "yes" },
        { name: "", value: "ignored" },
        { name: "X-Empty", value: "   " },
      ] as unknown[],
    });
    expect(h).toEqual({ "ok-header": "yes" });
  });

  it("returns null when absent", () => {
    expect(extractEmailHeadersForSuppression({ subject: "x" })).toBeNull();
  });
});

describe("extractReplyToFromRawEmailPayload", () => {
  it("reads Reply-To from header array", () => {
    expect(
      extractReplyToFromRawEmailPayload({
        headers: [{ name: "Reply-To", value: "Human <h@example.com>" }],
      }),
    ).toBe("Human <h@example.com>");
  });

  it("reads reply_to key on object headers map", () => {
    expect(
      extractReplyToFromRawEmailPayload({
        headers: { "reply-to": "x@y.com" },
      }),
    ).toBe("x@y.com");
  });

  it("returns null when missing", () => {
    expect(extractReplyToFromRawEmailPayload({ headers: { from: "a@b.com" } })).toBeNull();
  });
});

describe("evaluateRawEmailIngressSuppression", () => {
  it("billing / account: Stripe-style automated mail is suppressed", () => {
    const c = evaluateRawEmailIngressSuppression({
      rawEmail: { headers: { "auto-submitted": "auto-generated" } },
      senderRaw: "Stripe <noreply@stripe.com>",
      subject: "Your payout has been scheduled",
      body: "This is an automated message. Please do not reply to this email.",
    });
    expect(c.suppressed).toBe(true);
    expect(c.verdict).toBe("system_or_notification");
  });

  it("vendor / pitch: marketing sender + bulk headers suppresses", () => {
    const c = evaluateRawEmailIngressSuppression({
      rawEmail: {
        headers: {
          "list-unsubscribe": "<mailto:unsub@seo.example>",
          precedence: "bulk",
        },
      },
      senderRaw: "Growth Team <deals@mail.seo-partner.example>",
      subject: "Quick question about your rankings",
      body: "We help studios scale leads. Unsubscribe any time.",
    });
    expect(c.suppressed).toBe(true);
    expect(c.verdict).toBe("promotional_or_marketing");
  });

  it("vendor / pitch: array-style List-Unsubscribe + Precedence still suppresses", () => {
    const c = evaluateRawEmailIngressSuppression({
      rawEmail: {
        headers: [
          { name: "List-Unsubscribe", value: "<mailto:unsub@vendor.example>" },
          { name: "Precedence", value: "bulk" },
        ],
      },
      senderRaw: "Growth Team <deals@mail.seo-partner.example>",
      subject: "Quick question about your rankings",
      body: "We help studios scale leads. Unsubscribe any time.",
    });
    expect(c.suppressed).toBe(true);
    expect(c.verdict).toBe("promotional_or_marketing");
    expect(c.reasons).toContain("header_list_unsubscribe");
    expect(c.reasons).toContain("header_precedence_bulk");
  });

  it("partnership / editorial style: newsletter-class signals suppress", () => {
    const c = evaluateRawEmailIngressSuppression({
      rawEmail: {
        headers: {
          "list-unsubscribe": "<https://pub.example/unsub>",
          precedence: "bulk",
        },
      },
      senderRaw: "Editorial Desk <newsletter@news.publisher.example>",
      subject: "This week: spotlight on destination events",
      body: "Our weekly digest features top vendors. Manage your preferences or unsubscribe below.",
    });
    expect(c.suppressed).toBe(true);
    expect(["promotional_or_marketing", "system_or_notification"]).toContain(c.verdict);
  });

  it("real project inquiry is not suppressed", () => {
    const c = evaluateRawEmailIngressSuppression({
      rawEmail: {},
      senderRaw: '"Alex Kim" <alex.kim@companybrand.jp>',
      subject: "Commercial campaign — Tokyo launch, October",
      body:
        "We're producing a multi-day launch in Tokyo and need a photo + video team. Could you share availability and a rough range for 3 shoot days?",
    });
    expect(c.suppressed).toBe(false);
    expect(c.verdict).toBe("human_client_or_lead");
  });
});
