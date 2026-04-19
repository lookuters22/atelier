/**
 * Ana voice style anchor — formatter output (non-factual disclaimers + example bodies).
 */
import { describe, expect, it } from "vitest";
import {
  buildPersonaStyleExamplesPromptSection,
  PERSONA_STYLE_EXAMPLES_NOT_FACTUAL,
  PERSONA_STYLE_EXAMPLES_SECTION_TITLE,
  STUDIO_VOICE_EXAMPLES,
} from "./personaStudioVoiceExamples.ts";

describe("buildPersonaStyleExamplesPromptSection", () => {
  it("includes section title and non-factual disclaimer", () => {
    const s = buildPersonaStyleExamplesPromptSection();
    expect(s).toContain(PERSONA_STYLE_EXAMPLES_SECTION_TITLE);
    expect(s).toContain(PERSONA_STYLE_EXAMPLES_NOT_FACTUAL);
    expect(s).toContain("NOT factual sources");
    expect(s).toContain("orchestrator-approved assembly");
    expect(s).toContain("Approved inquiry reply strategy");
    expect(s).toContain("[INQUIRY_ONBOARDING]");
  });

  it("inquiry anchor stays short and operational — no universal calendar funnel template", () => {
    const s = buildPersonaStyleExamplesPromptSection();
    expect(s).toContain("My name is Ana");
    expect(s).toContain("Thank you for reaching out");
    expect(s).toContain("If helpful, I can send");
    expect(s).not.toContain("book a time using the link below");
    expect(s).not.toMatch(/customized offer/i);
  });

  it("labels all five scenario keys", () => {
    const s = buildPersonaStyleExamplesPromptSection();
    for (const key of Object.keys(STUDIO_VOICE_EXAMPLES) as Array<keyof typeof STUDIO_VOICE_EXAMPLES>) {
      expect(s).toContain(`[${key}]`);
    }
  });
});
