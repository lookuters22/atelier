/**
 * Twilio WhatsApp outbound utility.
 *
 * Sends a WhatsApp message via the Twilio Messages API.
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER
 * set as Supabase Edge Function secrets.
 */

function getEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing env: ${key}`);
  return val;
}

function toBase64(str: string): string {
  return btoa(str);
}

/**
 * Download a Twilio-hosted media URL (e.g. `MediaUrl0` from inbound WhatsApp webhooks).
 * Twilio requires HTTP Basic auth with Account SID and Auth Token.
 */
export async function fetchTwilioMediaUrlAsArrayBuffer(
  mediaUrl: string,
): Promise<
  { ok: true; body: ArrayBuffer; contentType: string | null } | { ok: false; error: string }
> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!accountSid?.trim() || !authToken?.trim()) {
    return { ok: false, error: "missing_twilio_credentials" };
  }
  const trimmed = mediaUrl.trim();
  if (!trimmed.startsWith("https://")) {
    return { ok: false, error: "invalid_media_url" };
  }
  const res = await fetch(trimmed, {
    headers: {
      Authorization: `Basic ${toBase64(`${accountSid}:${authToken}`)}`,
    },
  });
  if (!res.ok) {
    return { ok: false, error: `twilio_media_http_${res.status}` };
  }
  const body = await res.arrayBuffer();
  const contentType = res.headers.get("content-type");
  return { ok: true, body, contentType };
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Twilio webhook signature validation (X-Twilio-Signature).
 * @see https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export async function verifyTwilioWebhookSignature(
  fullUrl: string,
  postParams: Record<string, string>,
  xTwilioSignature: string | null,
  authToken: string,
): Promise<boolean> {
  if (!xTwilioSignature?.trim()) return false;

  const sortedKeys = Object.keys(postParams).sort();
  let payload = fullUrl;
  for (const k of sortedKeys) {
    payload += k + postParams[k];
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  return timingSafeEqualString(xTwilioSignature.trim(), expected);
}

/**
 * Send a WhatsApp message through Twilio.
 *
 * @param toNumber  - Recipient in E.164 format (e.g. "+381612345678").
 *                    The "whatsapp:" prefix is added automatically.
 * @param bodyText  - The message body to send.
 * @returns         - The Twilio message SID on success.
 */
export async function sendWhatsAppMessage(
  toNumber: string,
  bodyText: string,
): Promise<string> {
  const accountSid = getEnv("TWILIO_ACCOUNT_SID");
  const authToken = getEnv("TWILIO_AUTH_TOKEN");
  const twilioNumber = getEnv("TWILIO_PHONE_NUMBER");

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const cleanTo = toNumber.replace(/^whatsapp:/i, "").trim();
  const cleanFrom = twilioNumber.replace(/^whatsapp:/i, "").trim();

  const params = new URLSearchParams({
    To: `whatsapp:${cleanTo}`,
    From: `whatsapp:${cleanFrom}`,
    Body: bodyText,
  });

  console.log(`[twilio] Sending WhatsApp to ${cleanTo} from ${cleanFrom}, body length: ${bodyText.length}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${toBase64(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const json = await res.json();

  if (!res.ok) {
    console.error("[twilio] API error:", JSON.stringify(json));
    throw new Error(`Twilio error ${res.status}: ${json.message ?? JSON.stringify(json)}`);
  }

  console.log(`[twilio] Message sent successfully, SID: ${json.sid}`);
  return json.sid as string;
}
