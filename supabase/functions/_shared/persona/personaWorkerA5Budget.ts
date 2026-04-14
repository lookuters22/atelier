/**
 * A5 — explicit envelope for the live Inngest persona worker (`inngest/functions/persona.ts`).
 * Complements `personaAgentA5Budget.ts` (orchestrator `personaAgent.ts` path).
 */
import { truncateA5ClassifierField } from "../a5MiniClassifierBudget.ts";

/** `## Raw Facts` payload from upstream workers (concierge, logistics, etc.). */
export const PERSONA_WORKER_MAX_RAW_FACTS_CHARS = 24000;
/** Interpolated `PersonaContext` fields in system + first user message. */
export const PERSONA_WORKER_MAX_CONTEXT_FIELD_CHARS = 4000;
/** RAG / `searchPastCommunications` text in tool_result blocks. */
export const PERSONA_WORKER_MAX_TOOL_OUTPUT_CHARS = 14000;
/** Text blocks in assistant turns (tool_use blocks are left unchanged). */
export const PERSONA_WORKER_MAX_ASSISTANT_TEXT_CHARS = 8000;

export function truncatePersonaWorkerRawFacts(text: string): string {
  return truncateA5ClassifierField(text, PERSONA_WORKER_MAX_RAW_FACTS_CHARS);
}

export function truncatePersonaWorkerContextField(text: string): string {
  return truncateA5ClassifierField(text, PERSONA_WORKER_MAX_CONTEXT_FIELD_CHARS);
}

export function truncatePersonaWorkerToolOutput(text: string): string {
  return truncateA5ClassifierField(text, PERSONA_WORKER_MAX_TOOL_OUTPUT_CHARS);
}

export function truncatePersonaWorkerAssistantText(text: string): string {
  return truncateA5ClassifierField(text, PERSONA_WORKER_MAX_ASSISTANT_TEXT_CHARS);
}

/** Anthropic assistant turn: `tool_use` blocks must not be modified. */
export type PersonaWorkerAssistantBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export function truncatePersonaWorkerAssistantBlocks(
  blocks: PersonaWorkerAssistantBlock[],
): PersonaWorkerAssistantBlock[] {
  return blocks.map((b) =>
    b.type === "text" ? { ...b, text: truncatePersonaWorkerAssistantText(b.text) } : b,
  );
}

/** Bound all interpolated `PersonaContext` strings before system + user prompts. */
export type PersonaWorkerContextFields = {
  coupleNames: string;
  weddingDate: string;
  location: string;
  stage: string;
  studioName: string;
  managerName: string;
  photographerNames: string;
};

export function boundPersonaContextForModel(ctx: PersonaWorkerContextFields): PersonaWorkerContextFields {
  return {
    coupleNames: truncatePersonaWorkerContextField(ctx.coupleNames),
    weddingDate: truncatePersonaWorkerContextField(ctx.weddingDate),
    location: truncatePersonaWorkerContextField(ctx.location),
    stage: truncatePersonaWorkerContextField(ctx.stage),
    studioName: truncatePersonaWorkerContextField(ctx.studioName),
    managerName: truncatePersonaWorkerContextField(ctx.managerName),
    photographerNames: truncatePersonaWorkerContextField(ctx.photographerNames),
  };
}
