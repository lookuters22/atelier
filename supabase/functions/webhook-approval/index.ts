/**
 * Approval Webhook — fires the approval/draft.approved event.
 *
 * Stateless bridge: accepts { draft_id, photographer_id } from the frontend,
 * emits the Inngest event, and returns 200. The Outbound Worker handles
 * validation, sending, and recording.
 */
import { inngest } from "../_shared/inngest.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  try {
    const { draft_id, photographer_id } = await req.json();

    if (!draft_id || !photographer_id) {
      return new Response(
        JSON.stringify({ error: "draft_id and photographer_id are required" }),
        { status: 400, headers: CORS_HEADERS },
      );
    }

    await inngest.send({
      name: "approval/draft.approved",
      data: { draft_id, photographer_id },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }
});
