/**
 * Idempotent write path: approved escalation → `authorized_case_exceptions` (executable policy for this case).
 *
 * Delegates to `replace_authorized_case_exception_for_escalation` (single transaction: revoke competing
 * active rows + insert) so a failed insert cannot leave the slot empty after revokes.
 *
 * - Applies default `effective_until` when not provided (+ {@link DEFAULT_AUTHORIZED_CASE_EXCEPTION_TTL_DAYS}).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Json } from "../../../../src/types/database.types.ts";
import type { AuthorizedCaseExceptionOverridePayload } from "../../../../src/types/decisionContext.types.ts";
import { addDaysIsoUtc, DEFAULT_AUTHORIZED_CASE_EXCEPTION_TTL_DAYS } from "./authorizedCaseExceptionExpiry.ts";

/** First matching active global playbook row for audit / idempotency targeting. */
export async function fetchPlaybookRuleIdForTenantActionKey(
  supabase: SupabaseClient,
  photographerId: string,
  actionKey: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("playbook_rules")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("action_key", actionKey)
    .eq("scope", "global")
    .eq("is_active", true)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export type UpsertAuthorizedCaseExceptionFromEscalationParams = {
  photographerId: string;
  weddingId: string;
  /** Client thread from escalation, if any — matches fetch-time thread scope */
  clientThreadId: string | null;
  escalationId: string;
  overridesActionKey: string;
  /** When known, ties exception to a concrete playbook row (audit + idempotency). */
  targetPlaybookRuleId: string | null;
  overridePayload: AuthorizedCaseExceptionOverridePayload;
  /** When null/undefined, default TTL is applied */
  effectiveUntilIso: string | null | undefined;
  notes: string | null;
};

export type UpsertAuthorizedCaseExceptionFromEscalationResult = {
  id: string;
  effective_until: string;
};

export async function upsertAuthorizedCaseExceptionFromEscalationResolution(
  supabase: SupabaseClient,
  p: UpsertAuthorizedCaseExceptionFromEscalationParams,
): Promise<UpsertAuthorizedCaseExceptionFromEscalationResult> {
  const effectiveFrom = new Date().toISOString();
  const effectiveUntil =
    p.effectiveUntilIso && p.effectiveUntilIso.trim().length > 0
      ? new Date(p.effectiveUntilIso).toISOString()
      : addDaysIsoUtc(DEFAULT_AUTHORIZED_CASE_EXCEPTION_TTL_DAYS);

  const overridePayloadJson = p.overridePayload as unknown as Json;

  const { data: newId, error } = await supabase.rpc("replace_authorized_case_exception_for_escalation", {
    p_photographer_id: p.photographerId,
    p_wedding_id: p.weddingId,
    p_thread_id: p.clientThreadId,
    p_escalation_id: p.escalationId,
    p_overrides_action_key: p.overridesActionKey,
    p_target_playbook_rule_id: p.targetPlaybookRuleId,
    p_override_payload: overridePayloadJson,
    p_effective_from: effectiveFrom,
    p_effective_until: effectiveUntil,
    p_notes: p.notes,
  });

  if (error || !newId) {
    throw new Error(`replace_authorized_case_exception_for_escalation: ${error?.message ?? "no id"}`);
  }

  return { id: newId as string, effective_until: effectiveUntil };
}
