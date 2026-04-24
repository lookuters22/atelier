/**
 * Deterministic inbound-only patches from client message text (no LLM).
 */
import type {
  V3ThreadWorkflowPaymentWire,
  V3ThreadWorkflowReadinessV1,
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

function stampReadiness(
  out: Partial<V3ThreadWorkflowV1>,
  fragment: V3ThreadWorkflowReadinessV1,
): void {
  out.readiness = { ...out.readiness, ...fragment };
}

/**
 * Returns a partial workflow fragment to merge into existing state (only sets fields we infer this turn).
 */
export function inferV3ThreadWorkflowInboundPatch(rawMessage: string): Partial<V3ThreadWorkflowV1> {
  const t = normalizeText(rawMessage);
  const out: Partial<V3ThreadWorkflowV1> = {};
  const nowIso = new Date().toISOString();

  // Cross-channel timeline already received (e.g. WhatsApp) — suppress repeated asks on this thread.
  if (
    (/\bwhatsapp\b/.test(t) || /\bwhat\s*app\b/.test(t)) &&
    (/\btimeline\b/.test(t) || /\balready\b/.test(t) || /\bsent\b/.test(t))
  ) {
    const timeline: V3ThreadWorkflowTimeline = {
      suppressed: true,
      received_channel: /\bwhatsapp\b/.test(t) ? "whatsapp" : "other",
      received_at: nowIso,
    };
    out.timeline = timeline;
    stampReadiness(out, { timeline: { status: "complete", completed_at: nowIso } });
  }

  // Timeline attached on email / PDF (P14 — not only WhatsApp).
  if (
    !/\bwhatsapp\b/.test(t) &&
    (/\b(timeline|run of show|run-of-show|day of schedule|rundown)\b/.test(t) || /\bros\b/.test(t)) &&
    /\b(attached|attachment|see attached|please find|here is|here's)\b/.test(t)
  ) {
    const timeline: V3ThreadWorkflowTimeline = {
      suppressed: false,
      received_channel: "email",
      received_at: nowIso,
    };
    out.timeline = timeline;
    stampReadiness(out, { timeline: { status: "complete", completed_at: nowIso } });
  }

  // Questionnaire / intake form returned (P18).
  if (
    /\b(submitted|filled out|filled in|completed)\b/.test(t) &&
    /\b(form|questionnaire|google form|typeform|survey|intake)\b/.test(t)
  ) {
    stampReadiness(out, { questionnaire: { status: "complete", completed_at: nowIso } });
  }

  // Consultation booked / scheduled.
  if (/\bconsultation\b/.test(t) && /\b(booked|scheduled|confirmed|set up|arranged)\b/.test(t)) {
    stampReadiness(out, { consultation: { status: "complete", completed_at: nowIso } });
  }

  // Pre-event briefing completed (logistics readiness).
  if (
    /\b(pre[- ]?event|briefing|brief)\b/.test(t) &&
    /\b(done|complete|finished|went through|covered)\b/.test(t)
  ) {
    stampReadiness(out, { pre_event_briefing: { status: "complete", completed_at: nowIso } });
  }

  // Wire / payment promised soon — schedule deterministic chase due.
  if (
    /\b(wire|wiring|bank transfer|sent the wire|sending the wire)\b/.test(t) &&
    /\b(today|tomorrow|this week|now|soon|remaining balance|balance)\b/.test(t)
  ) {
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
    patch.stalled_inquiry === undefined &&
    patch.readiness === undefined
  );
}
