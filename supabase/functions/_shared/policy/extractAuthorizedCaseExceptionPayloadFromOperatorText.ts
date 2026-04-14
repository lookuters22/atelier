/**
 * Bounded unstructured → structured step: convert operator freeform reply (e.g. WhatsApp) into
 * {@link AuthorizedCaseExceptionOverridePayload} + optional `effective_until` before the deterministic
 * DB upsert. Uses a small JSON-only LLM call + Zod validation — no prompt hierarchy for merge logic.
 *
 * A5: bounded prompt inputs + deterministic skip when there is nothing to extract (no model call).
 */
import { z } from "npm:zod@4";
import type { AuthorizedCaseExceptionOverridePayload } from "../../../../src/types/decisionContext.types.ts";
import { truncateA5ClassifierField } from "../a5MiniClassifierBudget.ts";

const MODEL = "gpt-4o-mini";

/** Align with escalation-learning mini-classifier caps. */
export const POLICY_EXTRACT_MAX_QUESTION_BODY_CHARS = 8000;
export const POLICY_EXTRACT_MAX_PHOTOGRAPHER_REPLY_CHARS = 12000;
export const POLICY_EXTRACT_MAX_RESOLUTION_SUMMARY_CHARS = 4000;
export const POLICY_EXTRACT_MAX_ACTION_KEY_CHARS = 500;

const LlmExtractSchema = z.object({
  applies_policy_override: z.boolean(),
  override_payload: z
    .object({
      decision_mode: z.enum(["auto", "draft_only", "ask_first", "forbidden"]).optional(),
      instruction_override: z.string().nullable().optional(),
      instruction_append: z.string().optional(),
    })
    .optional(),
  /** ISO-8601 instant; null = use default TTL at insert time */
  effective_until_iso: z.string().nullable().optional(),
});

export type ExtractAuthorizedCaseExceptionPayloadResult =
  | {
      ok: true;
      applies_policy_override: true;
      override_payload: AuthorizedCaseExceptionOverridePayload;
      effective_until_iso: string | null;
    }
  | { ok: true; applies_policy_override: false }
  | { ok: false; reason: string };

function normalizePayload(
  raw: z.infer<typeof LlmExtractSchema>["override_payload"],
): AuthorizedCaseExceptionOverridePayload {
  if (!raw || typeof raw !== "object") return {};
  const out: AuthorizedCaseExceptionOverridePayload = {};
  if (raw.decision_mode) out.decision_mode = raw.decision_mode;
  if ("instruction_override" in raw) {
    out.instruction_override =
      raw.instruction_override === undefined ? undefined : raw.instruction_override;
  }
  if (typeof raw.instruction_append === "string" && raw.instruction_append.trim().length > 0) {
    out.instruction_append = raw.instruction_append.trim();
  }
  return out;
}

function payloadHasEffect(p: AuthorizedCaseExceptionOverridePayload): boolean {
  return Boolean(
    p.decision_mode ||
      (p.instruction_append && p.instruction_append.length > 0) ||
      (p.instruction_override !== undefined && p.instruction_override !== null),
  );
}

function hasSubstantivePolicyExtractText(input: {
  questionBody: string;
  photographerReply: string;
  resolutionSummary: string;
}): boolean {
  const q = input.questionBody.trim();
  const r = input.photographerReply.trim();
  const s = input.resolutionSummary.trim();
  return q.length > 0 || r.length > 0 || s.length > 0;
}

/**
 * Calls OpenAI (same stack as {@link classifyEscalationLearningOutcome}) when `OPENAI_API_KEY` is set.
 * On failure or missing key → `ok: false` so callers can fall back to legacy memory writeback.
 */
export async function extractAuthorizedCaseExceptionPayloadFromOperatorText(input: {
  questionBody: string;
  photographerReply: string;
  resolutionSummary: string;
  actionKey: string;
}): Promise<ExtractAuthorizedCaseExceptionPayloadResult> {
  try {
    if (!hasSubstantivePolicyExtractText(input)) {
      return { ok: true, applies_policy_override: false };
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return { ok: false, reason: "OPENAI_API_KEY unset" };

    const actionKeyForPrompt = truncateA5ClassifierField(input.actionKey, POLICY_EXTRACT_MAX_ACTION_KEY_CHARS);
    const questionForPrompt = truncateA5ClassifierField(input.questionBody, POLICY_EXTRACT_MAX_QUESTION_BODY_CHARS);
    const replyForPrompt = truncateA5ClassifierField(
      input.photographerReply,
      POLICY_EXTRACT_MAX_PHOTOGRAPHER_REPLY_CHARS,
    );
    const summaryForPrompt = truncateA5ClassifierField(
      input.resolutionSummary,
      POLICY_EXTRACT_MAX_RESOLUTION_SUMMARY_CHARS,
    );

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You extract structured studio policy override intent for a wedding-scoped database row.
Return JSON only with this shape:
{
  "applies_policy_override": boolean,
  "override_payload": {
    "decision_mode": "auto" | "draft_only" | "ask_first" | "forbidden" (optional),
    "instruction_override": string | null (optional, replaces playbook instruction when set),
    "instruction_append": string (optional, appended to baseline instruction)
  },
  "effective_until_iso": string | null (optional ISO-8601 end time for the exception; null if not specified)
}

Rules:
- Set applies_policy_override true only if the photographer clearly approves a concrete policy change (fees, deposit %, decision mode, or explicit instruction for this case).
- If the reply is vague, social, or does not change policy, set applies_policy_override false.
- Map informal numbers (e.g. "25% down") into instruction_append or instruction_override as clear studio-facing text; do not invent CRM numbers.
- Keep override_payload minimal; omit unknown fields.`,
          },
          {
            role: "user",
            content: `action_key: ${actionKeyForPrompt}

Question:
${questionForPrompt}

Photographer reply (verbatim):
${replyForPrompt}

Summarized resolution:
${summaryForPrompt}`,
          },
        ],
      }),
    });

    if (!res.ok) return { ok: false, reason: `openai_http_${res.status}` };

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "invalid_json" };
    }

    const safe = LlmExtractSchema.safeParse(parsed);
    if (!safe.success) return { ok: false, reason: "schema_reject" };

    const v = safe.data;
    if (!v.applies_policy_override) {
      return { ok: true, applies_policy_override: false };
    }

    const override_payload = normalizePayload(v.override_payload);
    if (!payloadHasEffect(override_payload)) {
      return { ok: true, applies_policy_override: false };
    }

    let effective_until_iso: string | null = null;
    if (v.effective_until_iso && v.effective_until_iso.trim().length > 0) {
      const t = Date.parse(v.effective_until_iso);
      if (!Number.isNaN(t)) {
        effective_until_iso = new Date(t).toISOString();
      }
    }

    return {
      ok: true,
      applies_policy_override: true,
      override_payload,
      effective_until_iso,
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}
