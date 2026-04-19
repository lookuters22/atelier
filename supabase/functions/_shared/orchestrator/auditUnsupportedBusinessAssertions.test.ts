import { describe, expect, it } from "vitest";
import {
  auditUnsupportedBusinessAssertions,
  buildPersonaVerifiedGroundingBlob,
  UNSUPPORTED_ASSERTION_VIOLATION_PREFIX,
} from "./auditUnsupportedBusinessAssertions.ts";
import type { DecisionContext, PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";

function baseDc(): DecisionContext {
  return {
    crmSnapshot: emptyCrmSnapshot(),
    recentMessages: [],
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    playbookRules: [],
  } as DecisionContext;
}

function rule(instruction: string): PlaybookRuleContextRow {
  return {
    id: "r1",
    action_key: "send_message",
    topic: "tone",
    decision_mode: "draft_only",
    scope: "global",
    channel: null,
    instruction,
    source_type: "test",
    confidence_label: "explicit",
    is_active: true,
  };
}

describe("auditUnsupportedBusinessAssertions", () => {
  const emptyGrounding = buildPersonaVerifiedGroundingBlob(baseDc(), [], null);

  it("flags absolute / hype studio claims on thin verified context", () => {
    const bad =
      "Hi — yes, we absolutely photograph destination weddings outside Serbia. May 2027 is well within our availability. " +
      "This is exactly the kind of work we love.";
    const v = auditUnsupportedBusinessAssertions(bad, emptyGrounding);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((x) => x.includes(`${UNSUPPORTED_ASSERTION_VIOLATION_PREFIX}we_absolutely`))).toBe(true);
    expect(v.some((x) => x.includes("well_within_availability") || x.includes("within_our_availability"))).toBe(
      true,
    );
    expect(v.some((x) => x.includes("exactly_kind_of_work_we_love"))).toBe(true);
  });

  it("allows softer exploratory phrasing without strong claims", () => {
    const ok =
      "Hi — thanks for reaching out. That sounds aligned with what you described. " +
      "We’d be happy to talk through a proposal and how we might approach the day. " +
      "If the date might still work on our side, the next step would be a quick call — let me know what helps.";
    const v = auditUnsupportedBusinessAssertions(ok, emptyGrounding);
    expect(v).toEqual([]);
  });

  it("blocks concrete availability wording without explicit playbook confirmation pattern", () => {
    const v = auditUnsupportedBusinessAssertions(
      "May 2027 is well within our availability for destination work.",
      emptyGrounding,
    );
    expect(v.length).toBeGreaterThan(0);
  });

  it("allows well-within availability phrasing when playbook encodes explicit availability confirmation", () => {
    const dc = baseDc();
    const playbook = [
      rule(
        "After the couple confirms their date, we confirm availability on our calendar and send a hold summary.",
      ),
    ];
    const grounding = buildPersonaVerifiedGroundingBlob(dc, playbook, null);
    const v = auditUnsupportedBusinessAssertions(
      "Once we align on scope, May 2027 is well within our availability.",
      grounding,
    );
    expect(v).toEqual([]);
  });

  it("buildPersonaVerifiedGroundingBlob merges CRM + studio identity for support checks", () => {
    const dc = {
      ...baseDc(),
      crmSnapshot: { ...emptyCrmSnapshot(), location: "Lake Como", stage: "inquiry" as const },
    } as DecisionContext;
    const g = buildPersonaVerifiedGroundingBlob(dc, [], "studio_name: Studio Krushka");
    expect(g.verifiedFactsBlobLc).toContain("lake como");
    expect(g.verifiedFactsBlobLc).toContain("studio krushka");
  });

  it("flags paraphrased capability/fit and process claims (claim families)", () => {
    const cases: Array<[string, string]> = [
      [
        "For smaller guest counts, we usually structure weddings like this with a single continuous thread.",
        "usually_structure_weddings",
      ],
      [
        "This is very much the sort of celebration we specialize in, and it sounds lovely.",
        "celebration_we_specialize",
      ],
      [
        "We're fully comfortable incorporating analog coverage into the day if you want it.",
        "comfortable_incorporating",
      ],
      ["This would be a natural part of the proposal once we align on scope.", "natural_part_of_proposal"],
      [
        "We'd normally structure this around a first look, ceremony, and relaxed portraits.",
        "normally_structure",
      ],
      ["This is very much in line with how we usually work with couples.", "in_line_how_we_usually_work"],
      [
        "It feels like a beautiful fit for the kind of weddings we photograph.",
        "fit_kind_of_weddings_we_photograph",
      ],
    ];
    for (const [draft, id] of cases) {
      const v = auditUnsupportedBusinessAssertions(draft, emptyGrounding);
      expect(v.some((x) => x.includes(id)), `expected ${id} for: ${draft}`).toBe(true);
    }
  });

  it("flags settled destination logistics claims when playbook does not support destination services", () => {
    const draft =
      "We often photograph destination weddings outside Serbia, and we'd structure travel around your timeline.";
    const v = auditUnsupportedBusinessAssertions(draft, emptyGrounding);
    expect(v.some((x) => x.includes("often_photograph_destination"))).toBe(true);
    expect(v.some((x) => x.includes("we_structure_travel_around"))).toBe(true);
  });

  it("allows destination logistics wording when playbook documents destination/travel policy", () => {
    const dc = baseDc();
    const playbook = [
      rule(
        "For destination weddings we photograph the full weekend and document travel fees in the proposal.",
      ),
    ];
    const grounding = buildPersonaVerifiedGroundingBlob(dc, playbook, null);
    const draft =
      "We photograph destination weddings, and we can align travel with your timeline in the proposal.";
    const v = auditUnsupportedBusinessAssertions(draft, grounding);
    expect(v.some((x) => x.includes("often_photograph_destination"))).toBe(false);
    expect(v.some((x) => x.includes("we_structure_travel_around"))).toBe(false);
  });

  it("flags concrete availability ease without explicit playbook availability confirmation", () => {
    const drafts = [
      "A date like this should be no problem on our end.",
      "We'd be able to accommodate this without issue.",
      "June 2026 should be no problem for us.",
    ];
    for (const d of drafts) {
      const v = auditUnsupportedBusinessAssertions(d, emptyGrounding);
      expect(v.length, d).toBeGreaterThan(0);
    }
  });

  it("does not flag conditional calendar wording on our side (exploratory)", () => {
    const ok =
      "If the date is still open on our side, I'd love to suggest a short call to align on scope and next steps.";
    expect(auditUnsupportedBusinessAssertions(ok, emptyGrounding)).toEqual([]);
  });

  it("flags bare still-open-on-our-side as a settled calendar claim", () => {
    const bad = "That weekend is still open on our side, so we can hold it while you decide.";
    const v = auditUnsupportedBusinessAssertions(bad, emptyGrounding);
    expect(v.some((x) => x.includes("open_on_our_side"))).toBe(true);
  });

  it("allows exploratory proposal and destination phrasing from the safe patterns list", () => {
    const ok =
      "That sounds aligned with what you described. We can talk through how that could fit the day. " +
      "We'd be happy to shape that with you in a proposal. " +
      "For destination work, we'd normally talk through logistics based on location and scope.";
    expect(auditUnsupportedBusinessAssertions(ok, emptyGrounding)).toEqual([]);
  });
});
