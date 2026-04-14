/**
 * V3 operator hold: block client-thread automation while an escalation is open on the operator lane.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function isThreadV3OperatorHold(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("threads")
    .select("v3_operator_automation_hold")
    .eq("id", threadId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.v3_operator_automation_hold === true;
}

/**
 * Clears hold only when this thread was held for this escalation id (avoids clobbering a newer hold).
 * For operator **resolution** flows, prefer calling through `resolveOperatorEscalationResolution` — that module
 * owns when to invoke this after a successful resolution (dashboard + WhatsApp both converge there).
 */
export async function clearV3OperatorHoldForResolvedEscalation(
  supabase: SupabaseClient,
  params: {
    photographerId: string;
    escalationId: string;
    clientThreadId: string | null;
  },
): Promise<void> {
  const { photographerId, escalationId, clientThreadId } = params;
  if (!clientThreadId) return;

  const { error } = await supabase
    .from("threads")
    .update({
      v3_operator_automation_hold: false,
      v3_operator_hold_escalation_id: null,
    })
    .eq("id", clientThreadId)
    .eq("photographer_id", photographerId)
    .eq("v3_operator_hold_escalation_id", escalationId);

  if (error) throw new Error(error.message);
}

export async function appendEscalationOperatorTurn(
  supabase: SupabaseClient,
  params: {
    photographerId: string;
    escalationId: string;
    direction: "in" | "out";
    body: string;
    rawChannel?: string;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  const { error } = await supabase.from("escalation_operator_turns").insert({
    photographer_id: params.photographerId,
    escalation_id: params.escalationId,
    direction: params.direction,
    body: params.body,
    raw_channel: params.rawChannel ?? "whatsapp_operator",
    metadata: params.metadata ?? null,
  });

  if (error) throw new Error(error.message);
}
