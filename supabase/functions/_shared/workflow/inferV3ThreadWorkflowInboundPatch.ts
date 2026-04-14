/**
 * Deterministic inbound-only patches from client message text (no LLM).
 */
import type {
  V3ThreadWorkflowPaymentWire,
  V3ThreadWorkflowStalledInquiry,
  V3ThreadWorkflowTimeline,
  V3ThreadWorkflowV1,
} from "./v3ThreadWorkflowTypes.ts";

/** Hours after client promises wire before chase due (fixed policy constant). */
export const V3_WIRE_CHASE_DUE_HOURS = 48;
/** Hours after stalled pattern before nudge due (fixed policy constant). */
export const V3_STALLED_NUDGE_DUE_HOURS = 72;

function isoFromNowPlusHours(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Returns a partial workflow fragment to merge into existing state (only sets fields we infer this turn).
 */
export function inferV3ThreadWorkflowInboundPatch(rawMessage: string): Partial<V3ThreadWorkflowV1> {
  const t = normalizeText(rawMessage);
  const out: Partial<V3ThreadWorkflowV1> = {};

  // Cross-channel timeline already received (e.g. WhatsApp) — suppress repeated asks on this thread.
  if (
    (/\bwhatsapp\b/.test(t) || /\bwhat\s*app\b/.test(t)) &&
    (/\btimeline\b/.test(t) || /\balready\b/.test(t) || /\bsent\b/.test(t))
  ) {
    const timeline: V3ThreadWorkflowTimeline = {
      suppressed: true,
      received_channel: /\bwhatsapp\b/.test(t) ? "whatsapp" : "other",
      received_at: new Date().toISOString(),
    };
    out.timeline = timeline;
  }

  // Wire / payment promised soon — schedule deterministic chase due.
  if (
    /\b(wire|wiring|bank transfer|sent the wire|sending the wire)\b/.test(t) &&
    /\b(today|tomorrow|this week|now|soon|remaining balance|balance)\b/.test(t)
  ) {
    const nowIso = new Date().toISOString();
    const payment_wire: V3ThreadWorkflowPaymentWire = {
      promised_at: nowIso,
      chase_due_at: isoFromNowPlusHours(V3_WIRE_CHASE_DUE_HOURS),
    };
    out.payment_wire = payment_wire;
  }

  // Stalled communication — avoid matching routine B2B "following up on timelines" without silence cues.
  if (
    /\b(never heard back|didn'?t hear|no response|still waiting)\b/.test(t) ||
    (/\b(following up|follow up)\b/.test(t) &&
      /\b(march|april|question from|my question|heard back|rehearsal|email from march)\b/.test(t))
  ) {
    const nowIso = new Date().toISOString();
    const stalled_inquiry: V3ThreadWorkflowStalledInquiry = {
      client_marked_at: nowIso,
      nudge_due_at: isoFromNowPlusHours(V3_STALLED_NUDGE_DUE_HOURS),
    };
    out.stalled_inquiry = stalled_inquiry;
  }

  return out;
}

export function isV3ThreadWorkflowInboundPatchEmpty(patch: Partial<V3ThreadWorkflowV1>): boolean {
  return (
    patch.timeline === undefined &&
    patch.payment_wire === undefined &&
    patch.stalled_inquiry === undefined
  );
}
