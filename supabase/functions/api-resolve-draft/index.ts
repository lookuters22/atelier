/**
 * Resolution API Bridge — approves or rejects a pending draft.
 *
 * POST { draft_id, action: "approve" | "reject", edited_body?: string, feedback?: string }
 *
 * On approve: updates status + body, fires approval/draft.approved for delivery.
 * On reject:  sets status to processing_rewrite, fires ai/draft.rewrite_requested.
 */
import { supabaseAdmin } from "../_shared/supabase.ts";
import { inngest } from "../_shared/inngest.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { draft_id, action, edited_body, feedback } = await req.json();

    if (!draft_id || !action) {
      return json({ error: "draft_id and action are required" }, 400);
    }

    if (action === "approve") {
      const { error: updateErr } = await supabaseAdmin
        .from("drafts")
        .update({
          status: "approved",
          body: edited_body ?? "",
        })
        .eq("id", draft_id);

      if (updateErr) {
        return json({ error: updateErr.message }, 500);
      }

      await inngest.send({
        name: "approval/draft.approved",
        data: { draft_id },
      });

      return json({ ok: true, action: "approved" });
    }

    if (action === "reject") {
      const { error: updateErr } = await supabaseAdmin
        .from("drafts")
        .update({ status: "processing_rewrite" })
        .eq("id", draft_id);

      if (updateErr) {
        return json({ error: updateErr.message }, 500);
      }

      await inngest.send({
        name: "ai/draft.rewrite_requested",
        data: { draft_id, feedback: feedback ?? "" },
      });

      return json({ ok: true, action: "rewrite_requested" });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
});
