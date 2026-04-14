import { describe, expect, it } from "vitest";
import { addDaysIsoUtc, DEFAULT_AUTHORIZED_CASE_EXCEPTION_TTL_DAYS } from "./authorizedCaseExceptionExpiry.ts";

describe("authorizedCaseExceptionExpiry", () => {
  it("addDaysIsoUtc advances UTC calendar days", () => {
    const from = new Date("2026-01-01T12:00:00.000Z");
    const out = addDaysIsoUtc(30, from);
    expect(out.startsWith("2026-01-31")).toBe(true);
  });

  it("default TTL constant is 180 days", () => {
    expect(DEFAULT_AUTHORIZED_CASE_EXCEPTION_TTL_DAYS).toBe(180);
  });
});
