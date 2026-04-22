/**
 * Re-exports read-only offer-builder project fetch for edge/Deno.
 * Implementation in `src/lib/fetchAssistantStudioOfferBuilderRead.ts` uses relative imports (no Vite `@/`).
 */
export {
  fetchAssistantStudioOfferBuilderRead,
  MAX_OFFER_BUILDER_PROJECTS_IN_CONTEXT,
} from "../../../../src/lib/fetchAssistantStudioOfferBuilderRead.ts";
