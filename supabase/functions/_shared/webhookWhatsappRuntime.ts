/**
 * Pure helpers for Twilio WhatsApp webhook (`webhook-whatsapp`) guardrails and safe logging.
 */

/**
 * Distinguish local `supabase functions serve` / docker from deployed Edge.
 * Same rules as `isWebhookWebLocalDevRuntime` in `webhookWebRuntime.ts`.
 */
export function isWebhookWhatsappLocalDevRuntime(): boolean {
  if (Deno.env.get("WEBHOOK_WEB_ALLOW_LOOSE_ANONYMOUS") === "true") {
    return true;
  }
  const u = (Deno.env.get("SUPABASE_URL") ?? "").trim().toLowerCase();
  if (!u) return true;
  return (
    u.includes("127.0.0.1") ||
    u.includes("localhost") ||
    u.includes("kong:8000") ||
    u.startsWith("http://kong")
  );
}

/** `TWILIO_WEBHOOK_VERIFY_SKIP` is only honored in a local/safe runtime. */
export type TwilioVerifySkipResolution =
  | { mode: "verify" }
  | { mode: "skip_allowed" }
  | { mode: "skip_forbidden" };

/**
 * - Skip off → normal (signature verification on form posts).
 * - Skip on + local runtime → allowed (dev only).
 * - Skip on + deployed-like runtime → forbidden (handler must 500).
 */
export function resolveTwilioVerifySkipMode(): TwilioVerifySkipResolution {
  const skip = Deno.env.get("TWILIO_WEBHOOK_VERIFY_SKIP");
  const wantsSkip = skip === "true" || skip === "1";
  if (!wantsSkip) {
    return { mode: "verify" };
  }
  if (isWebhookWhatsappLocalDevRuntime()) {
    return { mode: "skip_allowed" };
  }
  return { mode: "skip_forbidden" };
}

/** Twilio WhatsApp webhooks use `application/x-www-form-urlencoded` bodies. */
export function isFormUrlEncodedContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes("application/x-www-form-urlencoded");
}

/** Last four digits only (never the full E.164 or whatsapp: local part in logs). */
export function maskPhoneForLog(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 4) {
    return "****";
  }
  return `****${digits.slice(-4)}`;
}

/** Never emit a full id (e.g. photographer UUID) in server logs. */
export function maskIdentifierForLog(raw: string): string {
  const s = String(raw).trim();
  if (s.length === 0) {
    return "";
  }
  if (s.length <= 4) {
    return "****";
  }
  return `…${s.slice(-4)}(len ${s.length})`;
}
