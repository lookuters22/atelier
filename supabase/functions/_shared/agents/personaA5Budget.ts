/**
 * A5 — input envelope for `_shared/agents/persona.ts` (rewrite path; symmetry with `personaWorkerA5Budget.ts`).
 *
 * Reuses `truncatePersonaWorkerContextField` from the live persona worker so context-line caps stay aligned.
 */
import { truncateA5ClassifierField } from "../a5MiniClassifierBudget.ts";
import { truncatePersonaWorkerContextField } from "../persona/personaWorkerA5Budget.ts";

/** Each numbered factual bullet (e.g. feedback line, previous draft body). */
export const PERSONA_REWRITE_MAX_FACTUAL_BULLET_CHARS = 24000;

export function truncatePersonaRewriteFactualBullet(text: string): string {
  return truncateA5ClassifierField(text, PERSONA_REWRITE_MAX_FACTUAL_BULLET_CHARS);
}

/** Same 4000-char cap per field as `boundPersonaContextForModel` / live worker. */
export type PersonaRewriteContextFields = {
  couple_names: string;
  wedding_date: string | null;
  location: string | null;
  budget: string | null;
};

export function boundPersonaRewriteContext(
  context: PersonaRewriteContextFields,
): PersonaRewriteContextFields {
  return {
    couple_names: truncatePersonaWorkerContextField(String(context.couple_names ?? "")),
    wedding_date: context.wedding_date
      ? truncatePersonaWorkerContextField(context.wedding_date)
      : null,
    location: context.location ? truncatePersonaWorkerContextField(context.location) : null,
    budget: context.budget ? truncatePersonaWorkerContextField(context.budget) : null,
  };
}
