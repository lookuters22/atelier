import { describe, expect, it } from "vitest";
import {
  redactSensitiveDocumentPatternsForModelContext,
  SENSITIVE_DOCUMENT_REDACTION_TOKEN,
  shouldRedactSensitiveDocumentPatternsForModelContext,
} from "./redactSensitiveDocumentPatternsForModelContext.ts";

describe("redactSensitiveDocumentPatternsForModelContext", () => {
  it("redacts compact and spaced IBAN-like identifiers", () => {
    const compact = "Please wire to DE89370400440532013000 thanks";
    expect(redactSensitiveDocumentPatternsForModelContext(compact)).toBe(
      `Please wire to ${SENSITIVE_DOCUMENT_REDACTION_TOKEN} thanks`,
    );
    const spaced = "IBAN GB82 WEST 1234 5698 7654 32 end";
    expect(redactSensitiveDocumentPatternsForModelContext(spaced)).not.toMatch(/5698|7654/);
    expect(redactSensitiveDocumentPatternsForModelContext(spaced)).toContain(SENSITIVE_DOCUMENT_REDACTION_TOKEN);
  });

  it("redacts payment card-like digit runs", () => {
    const pan = "Card 4242-4242-4242-4242 please charge";
    const out = redactSensitiveDocumentPatternsForModelContext(pan);
    expect(out).toContain(SENSITIVE_DOCUMENT_REDACTION_TOKEN);
    expect(out).not.toContain("4242");
  });

  it("redacts US SSN-shaped tokens", () => {
    const s = "Tax id 078-05-1120 attached";
    expect(redactSensitiveDocumentPatternsForModelContext(s)).toContain(SENSITIVE_DOCUMENT_REDACTION_TOKEN);
    expect(redactSensitiveDocumentPatternsForModelContext(s)).not.toMatch(/078-05-1120/);
  });

  it("redacts labeled passport and national id values", () => {
    expect(redactSensitiveDocumentPatternsForModelContext("Passport number: AB1234567 thanks")).toContain(
      SENSITIVE_DOCUMENT_REDACTION_TOKEN,
    );
    expect(redactSensitiveDocumentPatternsForModelContext("National id A1B2C3D4E5 ok")).toContain(
      SENSITIVE_DOCUMENT_REDACTION_TOKEN,
    );
  });

  it("redacts labeled bank rails", () => {
    const bank = "Sort code 12-34-56 account 12345678 routing 021000021";
    const out = redactSensitiveDocumentPatternsForModelContext(bank);
    expect(out).not.toMatch(/12-34-56/);
    expect(out).not.toMatch(/12345678/);
    expect(out).not.toMatch(/021000021/);
    expect(out.split(SENSITIVE_DOCUMENT_REDACTION_TOKEN).length).toBeGreaterThan(2);
  });

  it("redacts DOB fields when identity / venue-access cues are present (stress-shaped)", () => {
    const stress = [
      "Hi planner, for venue access please register our team:",
      "Jane Doe passport 914231827 date of birth 14/03/1988",
      "Sort code 20-45-77 account 87654321",
    ].join("\n");
    const out = redactSensitiveDocumentPatternsForModelContext(stress);
    expect(out).toContain(SENSITIVE_DOCUMENT_REDACTION_TOKEN);
    expect(out).not.toMatch(/914231827/);
    expect(out).not.toMatch(/14\/03\/1988/);
    expect(out).not.toMatch(/20-45-77/);
    expect(out).not.toMatch(/87654321/);
  });

  it("does not redact standalone calendar dates without identity cues", () => {
    const wedding = "Ceremony date of birth of the idea is June 14 — wedding 2026-09-20";
    expect(redactSensitiveDocumentPatternsForModelContext(wedding)).toBe(wedding);
  });

  it("shouldRedactSensitiveDocumentPatternsForModelContext mirrors redaction mutability", () => {
    expect(shouldRedactSensitiveDocumentPatternsForModelContext("hello")).toBe(false);
    expect(shouldRedactSensitiveDocumentPatternsForModelContext("iban GB82WEST12345698765432")).toBe(true);
  });
});
