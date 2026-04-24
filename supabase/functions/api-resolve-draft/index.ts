/**
 * Resolution API Bridge — approves or rejects a pending draft.
 *
 * POST { draft_id, action: "approve" | "reject", edited_body?: string, feedback?: string }
 *
 * Approve: verifies JWT, emits approval/draft.approved (atomic claim + send happens in Outbound).
 * Reject: verifies JWT and thread ownership before updating the draft.
 *
 * **execute_v3 Step 7C — stale draft:** if `threads.last_inbound_at > drafts.created_at`, approval is
 * rejected, the draft is set to `rejected` (invalidated), and no `approval/draft.approved` event is sent.
 */
import { supabaseAdmin } from "../_shared/supabase.ts";
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import { assertDraftOwnedByPhotographer } from "../_shared/assertDraftOwnedByPhotographer.ts";
import { emitDraftApprovedEvent } from "../_shared/emitDraftApprovedEvent.ts";
import { emitDraftRewriteRequestedEvent } from "../_shared/emitDraftRewriteRequestedEvent.ts";
import { transitionDraftPendingToProcessingRewrite } from "../_shared/transitionDraftPendingToProcessingRewrite.ts";
import { isDraftStaleForApproval } from "../_shared/isDraftStaleForApproval.ts";
import { logA4EdgeOpLatencyV1 } from "../_shared/edgeOpLatencyObservability.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type DraftForApprovalRow = {
  id: string;
  created_at: string;
  status: string;
  threads: { photographer_id: string; last_inbound_at: string | null };
};

async function loadDraftForApprove(
  draftId: string,
  photographerId: string,
): Promise<DraftForApprovalRow | null> {
  const { data, error } = await supabaseAdmin
    .from("drafts")
    .select("id, created_at, status, threads!inner(photographer_id, last_inbound_at)")
    .eq("id", draftId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  const row = data as unknown as DraftForApprovalRow;
  if (row.threads.photographer_id !== photographerId) {
    return null;
  }
  return row;
}

Deno.serve(async (req) => {
  const wallStartedAt = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    logA4EdgeOpLatencyV1({
      edge: "api-resolve-draft",
      action: "method_not_allowed",
      ok: false,
      duration_ms: Date.now() - wallStartedAt,
      http_status: 405,
    });
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const startedAt = Date.now();
    const photographerId = await requirePhotographerIdFromJwt(req);
    let parsed: Record<string, unknown>;
    try {
      parsed = (await req.json()) as Record<string, unknown>;
    } catch {
      logA4EdgeOpLatencyV1({
        edge: "api-resolve-draft",
        action: "invalid_json",
        ok: false,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        http_status: 400,
      });
      return json({ error: "Invalid request body" }, 400);
    }

    const draft_id = parsed.draft_id as string | undefined;
    const action = parsed.action as string | undefined;
    const edited_body = parsed.edited_body;
    const feedback = parsed.feedback;

    const logEnd = (p: {
      ok: boolean;
      status: number;
      op: string;
      extra?: Record<string, unknown>;
    }) => {
      logA4EdgeOpLatencyV1({
        edge: "api-resolve-draft",
        action: p.op,
        ok: p.ok,
        duration_ms: Date.now() - startedAt,
        photographer_id: photographerId,
        draft_id: draft_id ?? undefined,
        http_status: p.status,
        ...p.extra,
      });
    };

    if (!draft_id || !action) {
      logEnd({ ok: false, status: 400, op: "validate" });
      return json({ error: "draft_id and action are required" }, 400);
    }

    if (action === "approve") {
      const draftRow = await loadDraftForApprove(draft_id, photographerId);
      if (!draftRow) {
        logEnd({ ok: false, status: 403, op: "approve", extra: { outcome: "draft_not_found" } });
        return json({ error: "Draft not found or access denied" }, 403);
      }
      if (draftRow.status !== "pending_approval") {
        logEnd({
          ok: false,
          status: 409,
          op: "approve",
          extra: { outcome: "not_pending", draft_status: draftRow.status },
        });
        return json(
          { error: "Draft is not pending approval", status: draftRow.status },
          409,
        );
      }

      const lastInbound = draftRow.threads.last_inbound_at;
      if (isDraftStaleForApproval(lastInbound, draftRow.created_at)) {
        const { error: invErr } = await supabaseAdmin
          .from("drafts")
          .update({ status: "rejected" })
          .eq("id", draft_id)
          .eq("status", "pending_approval");

        if (invErr) {
          logEnd({ ok: false, status: 500, op: "approve_stale_invalidate", extra: { outcome: invErr.message } });
          return json({ error: invErr.message }, 500);
        }

        logEnd({ ok: false, status: 409, op: "approve_stale_draft", extra: { outcome: "stale_draft" } });
        return json(
          {
            ok: false,
            action: "approval_rejected_stale_draft",
            error: "stale_draft",
            message:
              "New client message arrived after this draft was created. This draft was invalidated so nothing is sent. Ana should re-evaluate with the latest thread context.",
          },
          409,
        );
      }

      await emitDraftApprovedEvent({
        draft_id,
        photographer_id: photographerId,
        edited_body: typeof edited_body === "string" ? edited_body : null,
      });

      logEnd({ ok: true, status: 200, op: "approve_emit" });
      return json({ ok: true, action: "approved" });
    }

    const owned = await assertDraftOwnedByPhotographer(draft_id, photographerId);
    if (!owned) {
      logEnd({ ok: false, status: 403, op: String(action), extra: { outcome: "not_owned" } });
      return json({ error: "Draft not found or access denied" }, 403);
    }

    if (action === "reject") {
      const { error: transitionErr, transitioned } = await transitionDraftPendingToProcessingRewrite(draft_id);
      if (transitionErr) {
        logEnd({ ok: false, status: 500, op: "reject_transition", extra: { outcome: String(transitionErr) } });
        return json({ error: transitionErr }, 500);
      }
      if (!transitioned) {
        logEnd({
          ok: false,
          status: 409,
          op: "reject_idempotent",
          extra: { outcome: "no_pending_row" },
        });
        return json(
          {
            error:
              "Draft is not pending approval, or this reject was already applied — no rewrite to request.",
          },
          409,
        );
      }

      await emitDraftRewriteRequestedEvent({
        draft_id,
        feedback: typeof feedback === "string" ? feedback : "",
      });

      logEnd({ ok: true, status: 200, op: "reject_rewrite" });
      return json({ ok: true, action: "rewrite_requested" });
    }

    logEnd({ ok: false, status: 400, op: "unknown_action", extra: { action } });
    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    if (msg === "Unauthorized" || msg.includes("Authorization") || msg.includes("Missing")) {
      logA4EdgeOpLatencyV1({
        edge: "api-resolve-draft",
        action: "auth",
        ok: false,
        duration_ms: Date.now() - wallStartedAt,
        http_status: 401,
        outcome: msg,
      });
      return json({ error: msg }, 401);
    }
    logA4EdgeOpLatencyV1({
      edge: "api-resolve-draft",
      action: "exception",
      ok: false,
      duration_ms: Date.now() - wallStartedAt,
      http_status: 400,
      outcome: msg,
    });
    return json({ error: "Invalid request body" }, 400);
  }
});
