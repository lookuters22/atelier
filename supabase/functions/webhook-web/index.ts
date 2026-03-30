/**
 * Stateless Web Support webhook — zero business logic (.cursorrules Section 5).
 * Parse body, emit comms/web.received event, return 200.
 *
 * Accepts two payload shapes:
 *  - Test button / lead form: { source, photographer_id?, lead: { name, email, event_date, message } }
 *  - Support widget:          { message: "..." }
 */
import { inngest } from "../_shared/inngest.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const body = await req.json();
    const lead = body.lead as Record<string, unknown> | undefined;

    let rawMessage: Record<string, unknown>;

    if (lead) {
      const name = (lead.name as string) ?? "";
      const email = (lead.email as string) ?? "";
      const eventDate = (lead.event_date as string) ?? "";
      const msg = (lead.message as string) ?? "";

      rawMessage = {
        body: `New inquiry from ${name} (${email}):\nDesired date: ${eventDate}\n\n${msg}`,
        email,
        name,
        event_date: eventDate,
        source: body.source ?? "web_lead",
      };
    } else {
      rawMessage = {
        body: (body.message as string) ?? "",
        source: "web_widget",
      };
    }

    await inngest.send({
      name: "comms/web.received",
      data: {
        raw_message: rawMessage,
        photographer_id: (body.photographer_id as string) ?? undefined,
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch {
    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});
