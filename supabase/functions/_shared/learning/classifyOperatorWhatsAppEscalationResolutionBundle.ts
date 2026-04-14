/**
 * Slice 1: single OpenAI JSON call for operator WhatsApp escalation resolution — combines
 * "does the reply resolve?" + learning_outcome classification (replaces two sequential calls on that path).
 */
import {
  ESCALATION_LEARNING_CLASSIFY_MAX_ACTION_KEY_CHARS,
  type EscalationLearningOutcome,
} from "../classifyEscalationLearningOutcome.ts";
import { truncateA5ClassifierField } from "../a5MiniClassifierBudget.ts";
import {
  truncateOperatorOrchestratorEscalationQuestion,
  truncateOperatorOrchestratorEscalationReply,
} from "../operatorOrchestratorA5Budget.ts";
import { logModelInvocation, type ModelInvocationLogFn } from "../telemetry/modelInvocationLog.ts";

const MODEL = "gpt-4o-mini";

export type WhatsAppEscalationBundleSuccess = {
  ok: true;
  resolves: boolean;
  resolution_summary: string;
  learning_outcome: EscalationLearningOutcome;
};

export type WhatsAppEscalationBundleFailure = {
  ok: false;
  reason: string;
};

export type WhatsAppEscalationBundleResult = WhatsAppEscalationBundleSuccess | WhatsAppEscalationBundleFailure;

/** Same scope signals as `classifyEscalationLearningOutcome` (action_key + wedding vs studio-wide). */
export type WhatsAppEscalationBundleLearningContext = {
  actionKey?: string | null;
  weddingId?: string | null;
};

export type ClassifyOperatorWhatsAppEscalationResolutionBundleOptions = {
  learningContext?: WhatsAppEscalationBundleLearningContext;
  logInvocation?: ModelInvocationLogFn;
};

function buildLearningScopePromptBlock(ctx?: WhatsAppEscalationBundleLearningContext): string {
  const actionKeyRaw = ctx?.actionKey?.trim() ?? "";
  const actionKeyForPrompt =
    actionKeyRaw.length > 0
      ? truncateA5ClassifierField(actionKeyRaw, ESCALATION_LEARNING_CLASSIFY_MAX_ACTION_KEY_CHARS)
      : "";
  const lines = [
    actionKeyForPrompt ? `action_key: ${actionKeyForPrompt}` : null,
    ctx?.weddingId ? `wedding_id present (case-scoped)` : "no wedding_id (studio-wide context)",
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Returns one combined classifier result. On HTTP/parse failure, returns `{ ok: false }` so the caller
 * can fall back to legacy two-step classification.
 */
export async function classifyOperatorWhatsAppEscalationResolutionBundle(
  questionBody: string,
  photographerReply: string,
  options?: ClassifyOperatorWhatsAppEscalationResolutionBundleOptions,
): Promise<WhatsAppEscalationBundleResult> {
  const replyTrim = photographerReply.trim();
  if (replyTrim.length === 0) {
    return {
      ok: true,
      resolves: false,
      resolution_summary: "",
      learning_outcome: "one_off_case",
    };
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey?.trim()) {
    return { ok: false, reason: "missing_openai_api_key" };
  }

  const questionForPrompt = truncateOperatorOrchestratorEscalationQuestion(questionBody);
  const replyForPrompt = truncateOperatorOrchestratorEscalationReply(replyTrim);
  const scopeBlock = buildLearningScopePromptBlock(options?.learningContext);
  const log = options?.logInvocation ?? logModelInvocation;

  log({
    source: "operator_orchestrator",
    model: MODEL,
    phase: "escalation_whatsapp_resolution_bundle",
    workflow: "operator-whatsapp-orchestrator",
  });

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 320,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You perform two related tasks in one JSON response only.

Task A — resolution gate:
Decide if the photographer WhatsApp reply substantively answers the pending escalation question.
Return "resolves": true only when the reply is a real answer (not just "ok" / acknowledgment with no decision).

Task B — learning outcome (only meaningful when resolves is true):
Use the Context block (action_key and wedding scope) the same way as a dedicated learning classifier:
- one_off_case: applies only to this specific client, wedding, or one-time situation; not intended as a studio-wide rule.
- reusable_playbook: the photographer's decision should become a reusable global or channel-wide rule for this studio.

Return JSON only with this exact shape:
{"resolves": boolean, "resolution_summary": string, "learning_outcome": "one_off_case"|"reusable_playbook"}
Rules:
- If resolves is false, set resolution_summary to "" and learning_outcome to "one_off_case".
- If resolves is true, resolution_summary must be one short sentence capturing the operative decision.
- If uncertain on learning_outcome, prefer "one_off_case".`,
          },
          {
            role: "user",
            content: `Context:\n${scopeBlock || "(none)"}

Pending question:\n${questionForPrompt}

Photographer reply:\n${replyForPrompt}`,
          },
        ],
      }),
    });
  } catch (e) {
    return {
      ok: false,
      reason: `fetch:${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, reason: `http_${res.status}:${body.slice(0, 200)}` };
  }

  let json: { choices?: Array<{ message?: { content?: string } }> };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return { ok: false, reason: "invalid_json_response" };
  }

  const raw = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "parse_model_json_failed" };
  }

  const resolves = Boolean(parsed.resolves);
  const resolution_summary = String(parsed.resolution_summary ?? "").trim();
  const loRaw = parsed.learning_outcome;
  const learning_outcome: EscalationLearningOutcome =
    loRaw === "reusable_playbook" ? "reusable_playbook" : "one_off_case";

  if (resolves && resolution_summary.length === 0) {
    return { ok: false, reason: "resolves_true_empty_summary" };
  }

  return {
    ok: true,
    resolves,
    resolution_summary,
    learning_outcome: resolves ? learning_outcome : "one_off_case",
  };
}
