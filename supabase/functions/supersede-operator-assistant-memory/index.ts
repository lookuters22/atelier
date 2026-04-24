/**
 * JWT-authenticated: set `memories.supersedes_memory_id` on the superseding (newer) row to the superseded id.
 * Body: { supersedingMemoryId, supersededMemoryId } — tenant from JWT only.
 */
import { requirePhotographerIdFromJwt } from "../_shared/authPhotographer.ts";
import {
  MemorySupersessionError,
  supersedeMemoryForOperatorAssistant,
} from "../_shared/operatorStudioAssistant/supersedeOperatorAssistantMemoryCore.ts";
import { validateOperatorAssistantMemorySupersessionPayload } from "../_shared/operatorStudioAssistant/validateOperatorAssistantMemorySupersessionPayload.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";

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
    const photographerId = await requirePhotographerIdFromJwt(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const validated = validateOperatorAssistantMemorySupersessionPayload(body);
    if (!validated.ok) {
      return json({ error: validated.error }, 400);
    }

    const result = await supersedeMemoryForOperatorAssistant(
      supabaseAdmin,
      photographerId,
      validated.value,
    );

    return json({
      ok: true as const,
      supersedingMemoryId: result.supersedingMemoryId,
      supersededMemoryId: result.supersededMemoryId,
      auditEventId: result.auditEventId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (msg === "Unauthorized" || msg.includes("Missing or invalid Authorization")) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (e instanceof MemorySupersessionError) {
      return json({ error: msg }, e.status);
    }
    console.error(JSON.stringify({ type: "supersede_operator_assistant_memory_failed", message: msg }));
    return json({ error: msg }, 500);
  }
});
