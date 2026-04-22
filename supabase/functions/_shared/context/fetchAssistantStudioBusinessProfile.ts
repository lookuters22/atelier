/**
 * Re-exports read-only studio profile fetch for edge/Deno.
 * Implementation in `src/lib/assistantStudioProfileRead.ts` uses **relative** imports only (no Vite `@/`),
 * so Supabase can bundle it when this file is the entry re-export.
 */
export {
  summarizeProfileJsonField,
  mapSettingsToAssistantStudioIdentity,
  fetchAssistantStudioBusinessProfile,
  fetchStudioProfileReviewData,
  type StudioProfileReviewData,
} from "../../../../src/lib/assistantStudioProfileRead.ts";
