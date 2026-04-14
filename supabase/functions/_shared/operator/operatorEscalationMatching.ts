/**
 * Operator WhatsApp inbound: resolve which open `escalation_requests` row a photographer reply targets.
 * V3 orchestrator escalations use the **client** thread id; legacy rows may use the operator thread id.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const V3_ORCHESTRATOR_OUTPUT_AUDITOR_ACTION_KEYS = new Set([
  "orchestrator.client.v1.output_auditor.v1",
  "orchestrator.client.v1.output_auditor.planner_private.v1",
]);

const UUID_IN_TEXT =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function extractUuidCandidatesFromText(text: string): string[] {
  const matches = text.match(UUID_IN_TEXT);
  if (!matches?.length) return [];
  return [...new Set(matches.map((m) => m.toLowerCase()))];
}

export type EscalationRowForOperator = {
  id: string;
  question_body: string;
  created_at: string;
  action_key: string;
  wedding_id: string | null;
  reason_code: string;
  decision_justification: unknown;
  thread_id: string | null;
};

/**
 * Prefer V3 / client-thread escalations; fall back to legacy rows tied to the operator thread only.
 * `rows` must be ordered newest-first.
 */
export function pickOpenEscalationForOperatorReply(
  rows: EscalationRowForOperator[],
  operatorThreadId: string,
): EscalationRowForOperator | null {
  for (const r of rows) {
    if (
      V3_ORCHESTRATOR_OUTPUT_AUDITOR_ACTION_KEYS.has(r.action_key) ||
      r.thread_id === null ||
      r.thread_id !== operatorThreadId
    ) {
      return r;
    }
  }
  for (const r of rows) {
    if (r.thread_id === operatorThreadId) return r;
  }
  return null;
}

export async function fetchOpenEscalationForOperatorInbound(
  supabase: SupabaseClient,
  params: {
    photographerId: string;
    operatorThreadId: string;
    rawMessage: string;
  },
): Promise<EscalationRowForOperator | null> {
  const { photographerId, operatorThreadId, rawMessage } = params;

  const selectCols =
    "id, question_body, created_at, action_key, wedding_id, reason_code, decision_justification, thread_id";

  for (const uuid of extractUuidCandidatesFromText(rawMessage)) {
    const { data: row } = await supabase
      .from("escalation_requests")
      .select(selectCols)
      .eq("photographer_id", photographerId)
      .eq("id", uuid)
      .eq("status", "open")
      .maybeSingle();
    if (row) return row as EscalationRowForOperator;
  }

  const { data: rows, error } = await supabase
    .from("escalation_requests")
    .select(selectCols)
    .eq("photographer_id", photographerId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);
  if (!rows?.length) return null;

  return pickOpenEscalationForOperatorReply(
    rows as EscalationRowForOperator[],
    operatorThreadId,
  );
}
