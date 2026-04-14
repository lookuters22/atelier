/**
 * Classifier for learning-loop operator resolutions: OpenAI JSON → strict Zod in the executor (fail closed).
 *
 * A5: bounded prompt inputs + deterministic skip when there is nothing to classify (no model call).
 */
import { truncateA5ClassifierField } from "../a5MiniClassifierBudget.ts";
import { logModelInvocation } from "../telemetry/modelInvocationLog.ts";
import { OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION } from "../../../../src/types/operatorResolutionWriteback.types.ts";

const MODEL = "gpt-4o-mini";

/** Per-field caps so escalation/operator text cannot explode token cost on this path. */
export const OPERATOR_RES_LEARNING_LOOP_MAX_QUESTION_BODY_CHARS = 8000;
export const OPERATOR_RES_LEARNING_LOOP_MAX_OPERATOR_RESOLUTION_TEXT_CHARS = 12000;
export const OPERATOR_RES_LEARNING_LOOP_MAX_ACTION_KEY_CHARS = 500;
export const OPERATOR_RES_LEARNING_LOOP_MAX_REASON_CODE_CHARS = 200;

function getOpenAiApiKeyFromRuntime(): string | undefined {
  const g = globalThis as unknown as {
    Deno?: { env: { get: (k: string) => string | undefined } };
  };
  const fromDeno = g.Deno?.env?.get("OPENAI_API_KEY");
  if (fromDeno) return fromDeno;
  if (typeof process !== "undefined" && process.env?.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  return undefined;
}

/** @deprecated Import `truncateA5ClassifierField` from `a5MiniClassifierBudget.ts` — alias kept for callers. */
export { truncateA5ClassifierField as truncateOperatorResolutionLearningLoopField } from "../a5MiniClassifierBudget.ts";

export type ClassifyOperatorResolutionLearningLoopInput = {
  operatorResolutionText: string;
  photographerId: string;
  escalationContext: {
    escalationId: string;
    threadId: string | null;
    weddingId: string | null;
    actionKey: string;
    questionBody: string;
    reasonCode?: string | null;
  };
};

function hasSubstantiveOperatorLearningLoopContent(input: ClassifyOperatorResolutionLearningLoopInput): boolean {
  const q = input.escalationContext.questionBody.trim();
  const op = input.operatorResolutionText.trim();
  return q.length > 0 || op.length > 0;
}

export type ClassifyOperatorResolutionLearningLoopFailure = {
  ok: false;
  code: "MISSING_API_KEY" | "HTTP_ERROR" | "NON_JSON" | "PARSE_ERROR" | "EMPTY_INPUT";
  message: string;
};

export type ClassifyOperatorResolutionLearningLoopSuccess = {
  ok: true;
  /** Untrusted JSON; executor merges server correlation/tenant and runs Zod. */
  data: unknown;
};

/**
 * Returns parsed JSON from the model. Never trusted until `safeParseOperatorResolutionWritebackEnvelope`.
 */
export async function classifyOperatorResolutionLearningLoop(
  input: ClassifyOperatorResolutionLearningLoopInput,
): Promise<ClassifyOperatorResolutionLearningLoopSuccess | ClassifyOperatorResolutionLearningLoopFailure> {
  if (!hasSubstantiveOperatorLearningLoopContent(input)) {
    return {
      ok: false,
      code: "EMPTY_INPUT",
      message: "No substantive question or operator resolution text (A5 budget).",
    };
  }

  const apiKey = getOpenAiApiKeyFromRuntime();
  if (!apiKey) {
    return { ok: false, code: "MISSING_API_KEY", message: "OPENAI_API_KEY not set" };
  }

  const actionKeyForPrompt = truncateA5ClassifierField(
    input.escalationContext.actionKey,
    OPERATOR_RES_LEARNING_LOOP_MAX_ACTION_KEY_CHARS,
  );
  const reasonPart = input.escalationContext.reasonCode?.trim()
    ? truncateA5ClassifierField(
        String(input.escalationContext.reasonCode),
        OPERATOR_RES_LEARNING_LOOP_MAX_REASON_CODE_CHARS,
      )
    : null;

  const questionForPrompt = truncateA5ClassifierField(
    input.escalationContext.questionBody,
    OPERATOR_RES_LEARNING_LOOP_MAX_QUESTION_BODY_CHARS,
  );
  const operatorForPrompt = truncateA5ClassifierField(
    input.operatorResolutionText,
    OPERATOR_RES_LEARNING_LOOP_MAX_OPERATOR_RESOLUTION_TEXT_CHARS,
  );

  const ctx = [
    `escalation_id: ${input.escalationContext.escalationId}`,
    input.escalationContext.threadId ? `thread_id: ${input.escalationContext.threadId}` : "thread_id: (none)",
    input.escalationContext.weddingId ? `wedding_id: ${input.escalationContext.weddingId}` : "wedding_id: (none)",
    `action_key: ${actionKeyForPrompt}`,
    reasonPart ? `reason_code: ${reasonPart}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    logModelInvocation({
      source: "classify_operator_resolution_learning_loop",
      model: MODEL,
      phase: "chat_completions_writeback_envelope",
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
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You emit JSON only for operator resolutions on escalations. Schema version must be ${OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION}.

Truth hierarchy (pick the right artifact kind; do not duplicate the same instruction in two kinds):
- authorized_case_exception: one-off fee, scope, timeline, or approval override for THIS booking/thread only.
- memory: interpersonal or contextual facts that do NOT themselves change financial/scope/approval/timeline policy for automation.
- playbook_rule_candidate: a reusable studio-wide pattern suggestion ONLY as a staged candidate — NEVER live playbook_rules.

Anti-overlap:
- If the operator waives a fee, changes scope/timeline, or grants a one-time approval for this case, that is an Exception, not a Memory.
- Do NOT add a Memory that merely restates an Exception.
- Memories are for context (relationships, preferences, tone) that helps future handling without changing policy.
- Reusable policy text goes to playbook_rule_candidate only, never playbook_rules.

Return JSON with this shape:
{
  "schemaVersion": ${OPERATOR_RESOLUTION_WRITEBACK_SCHEMA_VERSION},
  "photographerId": "<uuid string — copy from input>",
  "correlation": { "escalationId", "threadId", "weddingId", "operatorResolutionSummary", "rawOperatorText" },
  "artifacts": [ ... ]
}

Each artifact is a discriminated object with "kind":
- authorized_case_exception: overridesActionKey, targetPlaybookRuleId (nullable uuid or omit), overridePayload (object), effectiveFromIso/effectiveUntilIso optional (ISO strings), notes optional.
- memory: memoryType, title, summary, fullContent, weddingId optional.
- playbook_rule_candidate: proposedActionKey, topic, proposedInstruction, proposedDecisionMode, proposedScope, proposedChannel optional, sourceClassification optional object, confidence 0-1 optional, operatorResolutionSummary/originatingOperatorText optional, observationCount integer >= 1 optional, sourceEscalationId/threadId/weddingId optional.

artifacts must be non-empty. Use enums: decision_mode (auto|draft_only|ask_first|forbidden), rule_scope (global|channel), thread_channel (email|web|whatsapp_operator|manual|system) when applicable.`,
          },
          {
            role: "user",
            content: `photographer_id: ${input.photographerId}

Context:
${ctx}

Question:
${questionForPrompt}

Operator resolution (verbatim):
${operatorForPrompt}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return {
        ok: false,
        code: "HTTP_ERROR",
        message: `OpenAI HTTP ${res.status}`,
      };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return { ok: false, code: "NON_JSON", message: "Model output was not valid JSON" };
    }

    return { ok: true, data: parsed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "PARSE_ERROR", message: msg };
  }
}
