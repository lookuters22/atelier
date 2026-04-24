/**
 * Operator Ana (dashboard widget) LLM provider switch — OpenAI (default) or Google Gemini.
 */

export type OperatorAnaLlmProvider = "openai" | "google";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export type OperatorAnaLlmProviderConfig = {
  provider: OperatorAnaLlmProvider;
  /** Model id for the active provider (OpenAI chat model or Gemini generateContent model). */
  model: string;
};

function normalizeProvider(raw: string | undefined): OperatorAnaLlmProvider {
  const v = raw?.trim().toLowerCase();
  return v === "google" ? "google" : "openai";
}

/**
 * Reads `ANA_LLM_PROVIDER` (`openai` | `google`, default openai) and `ANA_LLM_MODEL` (optional override).
 * When `ANA_LLM_MODEL` is unset, uses `gpt-4o-mini` (OpenAI) or `gemini-2.5-flash` (Google).
 */
export function getOperatorAnaLlmProviderConfig(
  env: { get: (key: string) => string | undefined } = Deno.env,
): OperatorAnaLlmProviderConfig {
  const provider = normalizeProvider(env.get("ANA_LLM_PROVIDER"));
  const modelOverride = env.get("ANA_LLM_MODEL")?.trim();
  if (modelOverride) {
    return { provider, model: modelOverride };
  }
  return {
    provider,
    model: provider === "google" ? DEFAULT_GEMINI_MODEL : DEFAULT_OPENAI_MODEL,
  };
}
