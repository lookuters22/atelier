import { describe, expect, it } from "vitest";
import { auditPlannerPrivateLeakage } from "./auditPlannerPrivateLeakage.ts";

describe("auditPlannerPrivateLeakage", () => {
  it("passes clean prose when enforcement on", () => {
    const r = auditPlannerPrivateLeakage(
      "Thank you — we will confirm details from your contract.",
      true,
    );
    expect(r.isValid).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it("ignores leakage when planner-only (enforcement off)", () => {
    const r = auditPlannerPrivateLeakage(
      "Your planner commission is 10% as agreed with the agency.",
      false,
    );
    expect(r.isValid).toBe(true);
  });

  it("fails on commission when enforcement on", () => {
    const r = auditPlannerPrivateLeakage(
      "We confirm the commission structure you discussed.",
      true,
    );
    expect(r.isValid).toBe(false);
    expect(r.violations.some((v) => v.includes("commission"))).toBe(true);
  });

  it("fails on agency fee", () => {
    const r = auditPlannerPrivateLeakage("The agency fee is included.", true);
    expect(r.isValid).toBe(false);
  });
});
