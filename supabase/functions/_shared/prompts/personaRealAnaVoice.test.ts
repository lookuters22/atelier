/**
 * Locks real-operator cadence (Dana & Matt reference corpus) into prompts — not full email snapshots.
 */
import { describe, expect, it } from "vitest";
import { buildPersonaAntiBrochureConstraintsSection } from "./personaAntiBrochureConstraints.ts";
import {
  buildPersonaStyleExamplesPromptSection,
  STUDIO_VOICE_EXAMPLES,
} from "./personaStudioVoiceExamples.ts";

describe("real Ana voice — prompt corpus alignment", () => {
  it("style examples avoid brochure ‘thrilled to capture’ positioning from the old template", () => {
    const joined = Object.values(STUDIO_VOICE_EXAMPLES).join("\n");
    expect(joined.toLowerCase()).not.toContain("we would be thrilled");
    expect(joined.toLowerCase()).not.toContain("thrilled to capture");
  });

  it("style examples include authentic operator patterns from reference threads", () => {
    const joined = buildPersonaStyleExamplesPromptSection();
    expect(joined).toMatch(/Please let me know if you have any questions/i);
    expect(joined).toContain("I'm here to help!");
    expect(joined).toContain("Ana here—");
    expect(joined).toContain("[SHORT_STATUS_PING]");
    expect(joined).toContain("I'll let you know as soon as");
  });

  it("anti-brochure explicitly permits real-Ana closings and forbids abstract luxury voice", () => {
    const s = buildPersonaAntiBrochureConstraintsSection();
    expect(s).toContain("Please don't hesitate to let me know if you have any questions");
    expect(s).toContain("at the heart of what we do");
    expect(s).toContain("the atmosphere you're describing");
  });
});
