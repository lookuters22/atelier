import { describe, expect, it } from "vitest";
import { mapInvoiceTemplateToAssistantRead, summarizeInvoiceLogoForAssistant } from "./invoiceAssistantSummary.ts";

describe("invoiceAssistantSummary", () => {
  it("summarizeInvoiceLogoForAssistant reports no logo when null", () => {
    const s = summarizeInvoiceLogoForAssistant(null);
    expect(s.hasLogo).toBe(false);
    expect(s.approxDataUrlChars).toBe(0);
  });

  it("summarizeInvoiceLogoForAssistant parses data URL mime and length without echoing payload", () => {
    const s = summarizeInvoiceLogoForAssistant("data:image/png;base64,VERYLONGBASE64PAYLOADEXAMPLE");
    expect(s.hasLogo).toBe(true);
    expect(s.mimeType).toBe("image/png");
    expect(s.approxDataUrlChars).toBeGreaterThan(10);
  });

  it("mapInvoiceTemplateToAssistantRead never puts logoDataUrl in output", () => {
    const m = mapInvoiceTemplateToAssistantRead(
      {
        legalName: "A",
        invoicePrefix: "B",
        paymentTerms: "C",
        accentColor: "#00f",
        footerNote: "D",
        logoDataUrl: "data:image/jpeg;base64,/9j/xx",
      },
      "2026-01-01T00:00:00.000Z",
      1000,
    );
    expect(JSON.stringify(m)).not.toMatch(/data:image/);
    expect(m.logo.hasLogo).toBe(true);
    expect(m.logo.mimeType).toBe("image/jpeg");
  });
});
