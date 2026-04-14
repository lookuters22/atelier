import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { AuthorizedCaseExceptionRow } from "../../../../src/types/decisionContext.types.ts";

/**
 * PostgREST `.or()` segment for “exception still active”: `effective_until` is null or strictly after `nowIso`.
 * The comparison value **must be double-quoted**: ISO-8601 timestamps contain `.` (milliseconds), and PostgREST
 * treats `.` as a path separator in unquoted values — unquoted `...gt.2026-04-09T12:00:00.000Z` truncates at the
 * first `.` and returns **no rows**.
 */
export function buildAuthorizedCaseExceptionActiveWindowOrFilter(nowIso: string): string {
  return `effective_until.is.null,effective_until.gt."${nowIso}"`;
}

/**
 * Loads **active** authorized case exceptions scoped to the wedding (and optional thread).
 *
 * - Tenant-safe: always `photographer_id` + `wedding_id`.
 * - Time window: `effective_from <= now` and (`effective_until` is null or `> now`).
 * - Thread: wedding-wide rows (`thread_id` null) OR rows pinned to the current `thread_id`.
 *
 * When `weddingId` is null, returns [] (no case scope).
 */
export async function fetchAuthorizedCaseExceptionsForDecisionContext(
  supabase: SupabaseClient,
  photographerId: string,
  weddingId: string | null,
  threadId: string | null,
  nowIso?: string,
): Promise<AuthorizedCaseExceptionRow[]> {
  if (!weddingId) {
    return [];
  }

  const now = nowIso ?? new Date().toISOString();

  let q = supabase
    .from("authorized_case_exceptions")
    .select(
      "id, photographer_id, wedding_id, thread_id, status, overrides_action_key, target_playbook_rule_id, override_payload, approved_by, approved_via_escalation_id, effective_from, effective_until, notes",
    )
    .eq("photographer_id", photographerId)
    .eq("wedding_id", weddingId)
    .eq("status", "active")
    .lte("effective_from", now)
    .or(buildAuthorizedCaseExceptionActiveWindowOrFilter(now));

  if (threadId) {
    q = q.or(`thread_id.is.null,thread_id.eq.${threadId}`);
  } else {
    q = q.is("thread_id", null);
  }

  q = q.order("effective_from", { ascending: false }).order("id", { ascending: true });

  const { data, error } = await q;

  if (error) {
    throw new Error(`fetchAuthorizedCaseExceptionsForDecisionContext: ${error.message}`);
  }

  return (data ?? []) as AuthorizedCaseExceptionRow[];
}
