/**
 * Phase 10 Step 10D — classify photographer replies against an `Awaiting reply:` follow-up task
 * (`docs/v3/execute_v3.md`). Conservative: any failure → `unresolved` (never falsely `answered`).
 *
 * A5: bounded prompt inputs + deterministic skip when there is nothing to classify (no model call).
 */
import { truncateA5ClassifierField } from "./a5MiniClassifierBudget.ts";

const MODEL = "gpt-4o-mini";

/** Per-field cap so pasted transcripts cannot explode token cost on this hot WhatsApp path. */
export const AWAITING_REPLY_CLASSIFY_MAX_TASK_TITLE_CHARS = 2000;
export const AWAITING_REPLY_CLASSIFY_MAX_PHOTOGRAPHER_REPLY_CHARS = 12000;

export type AwaitingReplyDisposition = "answered" | "deferral" | "unresolved";

export type ClassifyAwaitingReplyInput = {
  taskTitle: string;
  photographerReply: string;
};

/** @deprecated Import `truncateA5ClassifierField` from `a5MiniClassifierBudget.ts` — alias kept for callers. */
export { truncateA5ClassifierField as truncateAwaitingReplyClassifyField } from "./a5MiniClassifierBudget.ts";

/**
 * Only a successful parse with explicit disposition may return answered/deferral; all errors → unresolved.
 */
export async function classifyAwaitingReplyDisposition(
  input: ClassifyAwaitingReplyInput,
): Promise<AwaitingReplyDisposition> {
  try {
    const replyTrimmed = input.photographerReply.trim();
    if (replyTrimmed.length === 0) {
      return "unresolved";
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return "unresolved";

    const taskForPrompt = truncateA5ClassifierField(
      input.taskTitle,
      AWAITING_REPLY_CLASSIFY_MAX_TASK_TITLE_CHARS,
    );
    const replyForPrompt = truncateA5ClassifierField(
      replyTrimmed,
      AWAITING_REPLY_CLASSIFY_MAX_PHOTOGRAPHER_REPLY_CHARS,
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
        max_tokens: 120,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You classify a photographer WhatsApp reply against a studio follow-up task title.
Return JSON only: {"disposition":"answered"|"deferral"|"unresolved"}.

- answered: they gave a clear final answer, decision, or confirmation that satisfies the ask.
- deferral: they explicitly need more time, will reply later, or postpone without resolving yet.
- unresolved: unclear, off-topic, partial, or you cannot tell.

If uncertain, use unresolved.`,
          },
          {
            role: "user",
            content: `Task title:\n${taskForPrompt}\n\nPhotographer reply:\n${replyForPrompt}`,
          },
        ],
      }),
    });

    if (!res.ok) return "unresolved";

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const d = parsed.disposition;
      if (d === "answered" || d === "deferral" || d === "unresolved") return d;
      return "unresolved";
    } catch {
      return "unresolved";
    }
  } catch {
    return "unresolved";
  }
}
