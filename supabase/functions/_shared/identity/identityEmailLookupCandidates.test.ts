import { describe, expect, it } from "vitest";
import {
  buildEmailIdentityLookupCandidates,
  emailIdentityLookupSetsIntersect,
  weddingEmailGraphContainsAnyCandidate,
} from "./identityEmailLookupCandidates.ts";

describe("buildEmailIdentityLookupCandidates (P17 v1)", () => {
  it("non-Gmail: only exact normalized form", () => {
    expect(buildEmailIdentityLookupCandidates("Planner@Brand.Co.Uk")).toEqual(["planner@brand.co.uk"]);
  });

  it("Gmail: expands dots, plus-tags, and googlemail equivalence", () => {
    const c = buildEmailIdentityLookupCandidates("Jane.Doe+WeddingPlanner@gmail.com");
    expect(c).toContain("jane.doe+weddingplanner@gmail.com");
    expect(c).toContain("janedoe@gmail.com");
    expect(c).toContain("jane.doe@gmail.com");
    expect(c).toContain("janedoe@googlemail.com");
  });

  it("googlemail inbound maps to gmail-class candidates", () => {
    const c = buildEmailIdentityLookupCandidates("a.b@googlemail.com");
    expect(c).toContain("ab@gmail.com");
    expect(c).toContain("a.b@gmail.com");
  });

  it("weddingEmailGraphContainsAnyCandidate: alternate alias matches stored graph email", () => {
    const graph = new Set<string>(["jane.doe@gmail.com"]);
    expect(weddingEmailGraphContainsAnyCandidate(graph, "janedoe+work@gmail.com")).toBe(true);
  });

  it("weddingEmailGraphContainsAnyCandidate: no false match on unrelated sender", () => {
    const graph = new Set<string>(["jane.doe@gmail.com"]);
    expect(weddingEmailGraphContainsAnyCandidate(graph, "other@example.com")).toBe(false);
  });

  it("emailIdentityLookupSetsIntersect: janedoe vs jane.doe (same Gmail mailbox)", () => {
    expect(emailIdentityLookupSetsIntersect("janedoe@gmail.com", "jane.doe@gmail.com")).toBe(true);
  });

  it("emailIdentityLookupSetsIntersect: unrelated Gmail locals stay distinct", () => {
    expect(emailIdentityLookupSetsIntersect("alex@gmail.com", "alex2@gmail.com")).toBe(false);
  });
});
