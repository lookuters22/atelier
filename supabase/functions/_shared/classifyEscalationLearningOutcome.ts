/**
 * Phase 9 Step 9A — single classifier slice: outcome path for answered escalations (`execute_v3.md`).
 *
 * Exactly one of:
 * - one_off_case — decision applies only to this situation (case-specific).
 * - reusable_playbook — should become a global or channel-wide studio rule.
 *
 * Writeback to playbook_rules / memories: Step 9B (`writebackEscalationLearning.ts`).
 *
 * A5: bounded prompt inputs + deterministic skip when there is nothing to classify (no model call).
 */
import { truncateA5ClassifierField } from "./a5MiniClassifierBudget.ts";
import { logModelInvocation, type ModelInvocationLogFn } from "./telemetry/modelInvocationLog.ts";

const MODEL = "gpt-4o-mini";

/** Per-field caps so pasted operator/escalation text cannot explode token cost. */
export const ESCALATION_LEARNING_CLASSIFY_MAX_QUESTION_BODY_CHARS = 8000;
export const ESCALATION_LEARNING_CLASSIFY_MAX_PHOTOGRAPHER_REPLY_CHARS = 12000;
export const ESCALATION_LEARNING_CLASSIFY_MAX_RESOLUTION_SUMMARY_CHARS = 4000;
export const ESCALATION_LEARNING_CLASSIFY_MAX_ACTION_KEY_CHARS = 500;

export type EscalationLearningOutcome = "one_off_case" | "reusable_playbook";

export type ClassifyEscalationLearningInput = {
  questionBody: string;
  photographerReply: string;
  resolutionSummary: string;
  actionKey?: string | null;
  weddingId?: string | null;
};

/** @deprecated Import `truncateA5ClassifierField` from `a5MiniClassifierBudget.ts` — alias kept for callers. */
export { truncateA5ClassifierField as truncateEscalationLearningClassifyField } from "./a5MiniClassifierBudget.ts";

function hasAnySubstantiveEscalationLearningText(input: ClassifyEscalationLearningInput): boolean {
  const q = input.questionBody.trim();
  const r = input.photographerReply.trim();
  const s = input.resolutionSummary.trim();
  return q.length > 0 || r.length > 0 || s.length > 0;
}

/**
 * Classify how this answered escalation should be treated in the learning loop.
 * Returns `reusable_playbook` only after a successful API response and explicit JSON parse.
 * Any missing key, HTTP error, network/runtime failure, or bad JSON → `one_off_case` (conservative).
 */
export async function classifyEscalationLearningOutcome(
  input: ClassifyEscalationLearningInput,
  options?: { log?: ModelInvocationLogFn },
): Promise<EscalationLearningOutcome> {
  const logInvocation: ModelInvocationLogFn = options?.log ?? logModelInvocation;
  try {
    if (!hasAnySubstantiveEscalationLearningText(input)) {
      return "one_off_case";
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return "one_off_case";

    const actionKeyRaw = input.actionKey?.trim() ?? "";
    const actionKeyForPrompt =
      actionKeyRaw.length > 0
        ? truncateA5ClassifierField(actionKeyRaw, ESCALATION_LEARNING_CLASSIFY_MAX_ACTION_KEY_CHARS)
        : "";

    const questionForPrompt = truncateA5ClassifierField(
      input.questionBody,
      ESCALATION_LEARNING_CLASSIFY_MAX_QUESTION_BODY_CHARS,
    );
    const replyForPrompt = truncateA5ClassifierField(
      input.photographerReply,
      ESCALATION_LEARNING_CLASSIFY_MAX_PHOTOGRAPHER_REPLY_CHARS,
    );
    const summaryForPrompt = truncateA5ClassifierField(
      input.resolutionSummary,
      ESCALATION_LEARNING_CLASSIFY_MAX_RESOLUTION_SUMMARY_CHARS,
    );

    const ctx = [
      actionKeyForPrompt ? `action_key: ${actionKeyForPrompt}` : null,
      input.weddingId ? `wedding_id present (case-scoped)` : "no wedding_id (studio-wide context)",
    ]
      .filter(Boolean)
      .join("\n");

    logInvocation({
      source: "classify_escalation_learning_outcome",
      model: MODEL,
      phase: "chat_completions_learning_outcome",
    });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 120,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You classify a photographer's answer to an operational escalation into exactly one category:
- one_off_case: applies only to this specific client, wedding, or one-time situation; not intended as a studio-wide rule.
- reusable_playbook: the photographer's decision should become a reusable global or channel-wide rule for this studio.

Return JSON only: {"learning_outcome":"one_off_case"|"reusable_playbook"}.
If uncertain, prefer one_off_case.`,
          },
          {
            role: "user",
            content: `Context:\n${ctx || "(none)"}

Original question:\n${questionForPrompt}

Photographer reply:\n${replyForPrompt}

Summarized resolution:\n${summaryForPrompt}`,
          },
        ],
      }),
    });

    if (!res.ok) return "one_off_case";

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const v = parsed.learning_outcome;
      if (v === "reusable_playbook") return "reusable_playbook";
      return "one_off_case";
    } catch {
      return "one_off_case";
    }
  } catch {
    return "one_off_case";
  }
}
