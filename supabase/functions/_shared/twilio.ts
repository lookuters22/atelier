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
