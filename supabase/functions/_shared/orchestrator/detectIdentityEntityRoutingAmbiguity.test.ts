import { describe, expect, it } from "vitest";
import { detectIdentityEntityRoutingAmbiguity } from "./detectIdentityEntityRoutingAmbiguity.ts";
import { ORCHESTRATOR_IE2_ESCALATION_REASON_CODES } from "../../../../src/types/decisionContext.types.ts";

describe("detectIdentityEntityRoutingAmbiguity", () => {
  it("st1-b2b: From indalo.travel + following up on + business cues → b2b_corporate_sender", () => {
    const r = detectIdentityEntityRoutingAmbiguity({
      rawMessage:
        "From erin@indalo.travel — Hi Danilo, following up on Dana & Matt safari package PR timelines.",
      threadId: "t1",
      candidateWeddingIds: [],
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("b2b_corporate_sender");
      expect(r.escalation_reason_code).toBe(ORCHESTRATOR_IE2_ESCALATION_REASON_CODES.b2b_corporate_sender);
    }
  });

  it("st1-b2b: ingress sender email only (no From line in body) + following up on + business cues → b2b_corporate_sender", () => {
    const r = detectIdentityEntityRoutingAmbiguity({
      rawMessage:
        "Hi Danilo, following up on Dana & Matt safari package PR timelines.",
      threadId: "t1",
      candidateWeddingIds: [],
      inboundSenderEmail: "erin@indalo.travel",
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("b2b_corporate_sender");
      expect(r.escalation_reason_code).toBe(ORCHESTRATOR_IE2_ESCALATION_REASON_CODES.b2b_corporate_sender);
    }
  });

  it("st2-shaped dual booking text → multi_booking_text_cues", () => {
    const r = detectIdentityEntityRoutingAmbiguity({
      rawMessage:
        "For our Cambodia wedding in April vs the Italy wedding in June, can you confirm which invoice this deposit applies to?",
      threadId: "t1",
      candidateWeddingIds: [],
    });
    expect(r.hit).toBe(true);
    if (r.hit) {
      expect(r.primaryClass).toBe("multi_booking_text_cues");
      expect(r.escalation_reason_code).toBe(ORCHESTRATOR_IE2_ESCALATION_REASON_CODES.multi_booking_text_cues);
    }
  });

  it("no hit: hello@customdomain.com + normal couple inquiry (domain without B2B follow-up arm)", () => {
    const r = detectIdentityEntityRoutingAmbiguity({
      rawMessage:
        "From hello@customdomain.com — Hi! We're getting married next June and wanted to ask about your packages.",
      threadId: "t1",
      candidateWeddingIds: [],
    });
    expect(r.hit).toBe(false);
  });

  it("no hit: non-consumer domain without following up on + business cues", () => {
    const r = detectIdentityEntityRoutingAmbiguity({
      rawMessage: "From sales@vendor.co — Thanks for your note yesterday!",
      threadId: "t1",
      candidateWeddingIds: [],
    });
    expect(r.hit).toBe(false);
  });

  it("no hit: following up + business cues but gmail sender", () => {
    const r = detectIdentityEntityRoutingAmbiguity({
      rawMessage:
        "From erin@gmail.com — following up on Dana & Matt safari package PR timelines.",
      threadId: "t1",
      candidateWeddingIds: [],
    });
    expect(r.hit).toBe(false);
  });

  it("no hit: bulk discount without From line (st1-bulk-discount shaped)", () => {
    const r = detectIdentityEntityRoutingAmbiguity({
      rawMessage:
        "Can we get a bulk discount for 500–800 extra photos? And can black and white be reversed to color for free?",
      threadId: "t1",
      candidateWeddingIds: [],
    });
    expect(r.hit).toBe(false);
  });

  it("no hit when Phase 1: two candidate wedding ids (thread_weddings ambiguity)", () => {
    const r = detectIdentityEntityRoutingAmbiguity({
      rawMessage:
        "For our Cambodia wedding in April vs the Italy wedding in June, can you confirm which invoice this deposit applies to?",
      threadId: "t1",
      candidateWeddingIds: ["w-a", "w-b"],
    });
    expect(r.hit).toBe(false);
  });

  it("no hit without thread id for Phase 1 guard: still allows ie2 when 0 ids", () => {
    const r = detectIdentityEntityRoutingAmbiguity({
      rawMessage: "From erin@indalo.travel — following up on safari package PR timelines.",
      threadId: null,
      candidateWeddingIds: [],
    });
    expect(r.hit).toBe(true);
  });
});
