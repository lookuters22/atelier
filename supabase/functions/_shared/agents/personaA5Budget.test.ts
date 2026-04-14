import { describe, expect, it } from "vitest";
import { A5_MINI_CLASSIFIER_TRUNCATE_MARKER } from "../a5MiniClassifierBudget.ts";
import {
  PERSONA_REWRITE_MAX_FACTUAL_BULLET_CHARS,
  boundPersonaRewriteContext,
  truncatePersonaRewriteFactualBullet,
} from "./personaA5Budget.ts";

describe("personaA5Budget (rewrite path)", () => {
  it("caps each factual bullet", () => {
    const long = "b".repeat(PERSONA_REWRITE_MAX_FACTUAL_BULLET_CHARS + 50);
    expect(truncatePersonaRewriteFactualBullet(long)).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("bounds context fields (aligned with personaWorker context cap)", () => {
    const long = "n".repeat(5000);
    const out = boundPersonaRewriteContext({
      couple_names: long,
      wedding_date: long,
      location: long,
      budget: long,
    });
    expect(out.couple_names).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
    expect(out.wedding_date).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
    expect(out.location).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
    expect(out.budget).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("passes through null date/location/budget without truncation", () => {
    const out = boundPersonaRewriteContext({
      couple_names: "A & B",
      wedding_date: null,
      location: null,
      budget: null,
    });
    expect(out).toEqual({
      couple_names: "A & B",
      wedding_date: null,
      location: null,
      budget: null,
    });
  });
});
