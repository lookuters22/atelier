/**
 * Budget STATEMENT SLOT user-turn hints (structured persona path).
 */
import { describe, expect, it } from "vitest";
import { BUDGET_STATEMENT_PLACEHOLDER } from "../orchestrator/budgetStatementInjection.ts";
import { PERSONA_BUDGET_CRITICAL_FORMATTING_USER_HINT_LINE } from "./personaAgent.ts";

describe("personaAgent budget slot user-turn hint", () => {
  it("exports the CRITICAL FORMATTING one-liner tied to the injector placeholder token", () => {
    expect(PERSONA_BUDGET_CRITICAL_FORMATTING_USER_HINT_LINE).toBe(
      `[CRITICAL FORMATTING]: You MUST output the exact token ${BUDGET_STATEMENT_PLACEHOLDER} immediately following your opening hospitality sentence. Do not write any transition words before it.`,
    );
    expect(PERSONA_BUDGET_CRITICAL_FORMATTING_USER_HINT_LINE).toContain("[CRITICAL FORMATTING]");
  });
});
