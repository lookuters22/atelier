/**
 * Stateless WhatsApp webhook — zero AI processing (.cursorrules Section 5).
 *
 * Accepts a Twilio-shaped POST (form-encoded or JSON).
 * Extracts From (sender number) and Body (message text).
 * Looks up the photographer whose settings->>'whatsapp_number' matches.
 * Fires comms/whatsapp.received and returns 200 immediately.
 */
import { inngest } from "../_shared/inngest.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function respond(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function normalizePhone(raw: string): string {
  return raw
    .replace(/^whatsapp:/i, "")
    .replace(/[\s\-\(\)\.]/g, "")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return respond({ ok: true });

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  try {
    let rawFrom = "";
    let rawTo = "";
    let messageBody = "";

    const contentType = req.headers.get("content-type") ?? "";
    console.log("[webhook-whatsapp] Content-Type:", contentType);

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      rawFrom = (form.get("From") as string) ?? "";
      rawTo = (form.get("To") as string) ?? "";
      messageBody = (form.get("Body") as string) ?? "";
    } else {
      const json = await req.json();
      console.log("[webhook-whatsapp] Raw JSON payload:", JSON.stringify(json));
      rawFrom = json.From ?? json.from ?? json.from_number ?? "";
      rawTo = json.To ?? json.to ?? json.to_number ?? "";
      messageBody = json.Body ?? json.body ?? json.message ?? "";
    }

    const fromNumber = normalizePhone(rawFrom);
    const toNumber = normalizePhone(rawTo);

    console.log("[webhook-whatsapp] Parsed -> from:", fromNumber, "to:", toNumber, "body length:", messageBody.length);

    if (!fromNumber || !messageBody) {
      console.warn("[webhook-whatsapp] Missing From or Body, returning 400");
      return respond({ error: "Missing From or Body" }, 400);
    }

    // Try both To (studio's number) and From (sender's number) for lookup
    const candidates = [toNumber, fromNumber].filter(Boolean);
    console.log("[webhook-whatsapp] Lookup candidates:", candidates);

    let photographerId: string | null = null;

    // Strategy 1: PostgREST JSONB filter
    for (const num of candidates) {
      const { data, error } = await supabaseAdmin
        .from("photographers")
        .select("id, settings")
        .eq("settings->>whatsapp_number", num)
        .limit(1)
        .maybeSingle();

      console.log(`[webhook-whatsapp] JSONB filter for "${num}" -> data:`, JSON.stringify(data), "error:", error?.message ?? "none");

      if (data?.id) {
        photographerId = data.id as string;
        break;
      }
    }

    // Strategy 2: Fallback — fetch all photographers with settings and match in JS
    if (!photographerId) {
      console.log("[webhook-whatsapp] JSONB filter missed, trying JS fallback...");

      const { data: allPhotographers, error: fetchErr } = await supabaseAdmin
        .from("photographers")
        .select("id, settings")
        .not("settings", "is", null);

      console.log(`[webhook-whatsapp] Fetched ${allPhotographers?.length ?? 0} photographers, error: ${fetchErr?.message ?? "none"}`);

      if (allPhotographers) {
        for (const p of allPhotographers) {
          const settings = (p.settings ?? {}) as Record<string, unknown>;
          const stored = normalizePhone(String(settings.whatsapp_number ?? ""));
          if (!stored) continue;

          console.log(`[webhook-whatsapp] Comparing stored="${stored}" against candidates:`, candidates);

          if (candidates.some((c) => c === stored || c.endsWith(stored) || stored.endsWith(c))) {
            photographerId = p.id as string;
            console.log(`[webhook-whatsapp] JS fallback matched photographer: ${photographerId}`);
            break;
          }
        }
      }
    }

    if (!photographerId) {
      console.warn(`[webhook-whatsapp] NO photographer found for any candidate: ${candidates.join(", ")}`);
      return respond({ ok: true, warning: "no_matching_photographer", candidates });
    }

    console.log(`[webhook-whatsapp] Found photographer: ${photographerId} — dispatching Inngest event...`);

    const sendResult = await inngest.send({
      name: "comms/whatsapp.received",
      data: {
        raw_message: {
          from: fromNumber,
          to: toNumber,
          body: messageBody,
          source: "twilio_whatsapp",
        },
        photographer_id: photographerId,
      },
    });

    console.log("[webhook-whatsapp] Inngest send result:", JSON.stringify(sendResult));

    return respond({ ok: true, photographer_id: photographerId });
  } catch (err) {
    console.error("[webhook-whatsapp] Unhandled error:", err);
    return respond({ error: "Internal error" }, 500);
  }
});
