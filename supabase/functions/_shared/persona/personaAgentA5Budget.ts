/**
 * A5 — first explicit envelope for Anthropic persona drafting (`personaAgent.ts`).
 * The dominant variable input is orchestrator-approved factual text (`orchestratorFacts`).
 */
import { truncateA5ClassifierField } from "../a5MiniClassifierBudget.ts";

/** Cap approved factual assembly before user message + strategy hints + JSON suffix. */
export const PERSONA_MAX_ORCHESTRATOR_FACTS_CHARS = 24000;

export function truncatePersonaOrchestratorFactsForModel(text: string): string {
  return truncateA5ClassifierField(text, PERSONA_MAX_ORCHESTRATOR_FACTS_CHARS);
}
