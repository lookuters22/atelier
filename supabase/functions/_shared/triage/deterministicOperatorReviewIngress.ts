/**
 * Shared persistence + metadata shape for pre-LLM deterministic human non-client ingress
 * (`comms/email.received` and Gmail post-ingest parity) — billing, vendor/partnership, recruiter.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { evaluateDeterministicBillingAccountIngress } from "./deterministicBillingAccountIngress.ts";
import { evaluateDeterministicRecruiterJobIngress } from "./deterministicRecruiterJobIngress.ts";
import { evaluateDeterministicVendorPartnershipIngress } from "./deterministicVendorPartnershipIngress.ts";

export const DETERMINISTIC_OPERATOR_REVIEW_ROUTING_LAYERS = {
  billing_account: "deterministic_billing_account_ingress_v1",
  vendor_partnership: "deterministic_vendor_partnership_ingress_v1",
  recruiter_job: "deterministic_recruiter_job_ingress_v1",
} as const;

export type DeterministicOperatorReviewReasonCodesField =
  | "deterministic_billing_reason_codes"
  | "deterministic_vendor_partnership_reason_codes"
  | "deterministic_recruiter_job_reason_codes";

/** Same base fields + slice-specific `reason_codes_field` for backwards compatibility. */
export function buildDeterministicOperatorReviewRoutingMetadata(args: {
  sender_role: string;
  summary: string;
  routing_layer: string;
  reason_codes: string[];
  reason_codes_field: DeterministicOperatorReviewReasonCodesField;
}): Record<string, unknown> {
  return {
    routing_disposition: "unresolved_human",
    sender_role: args.sender_role,
    sender_role_confidence: "high",
    sender_role_reason: args.summary,
    routing_layer: args.routing_layer,
    [args.reason_codes_field]: args.reason_codes,
  };
}

export function emailIngressSubjectLineFromPayload(
  payload: Record<string, unknown>,
  body: string,
): string {
  return typeof payload.subject === "string" ? payload.subject : body.slice(0, 60);
}

/** Single ordering: billing → vendor/partnership → recruiter (must stay aligned across ingest paths). */
export type DeterministicHumanNonClientIngressResult =
  | { match: false }
  | {
      match: true;
      variant: "billing";
      routingMetadata: Record<string, unknown>;
      reason_codes: string[];
      triageReturnStatus: "deterministic_billing_account_operator_review";
    }
  | {
      match: true;
      variant: "vendor_partnership";
      routingMetadata: Record<string, unknown>;
      reason_codes: string[];
      sender_role: "vendor_solicitation" | "partnership_or_collaboration";
      triageReturnStatus: "deterministic_vendor_partnership_operator_review";
    }
  | {
      match: true;
      variant: "recruiter";
      routingMetadata: Record<string, unknown>;
      reason_codes: string[];
      triageReturnStatus: "deterministic_recruiter_job_operator_review";
    };

export function evaluateDeterministicHumanNonClientIngress(input: {
  subject: string | null | undefined;
  body: string;
}): DeterministicHumanNonClientIngressResult {
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();

  const billing = evaluateDeterministicBillingAccountIngress({ subject, body });
  if (billing.match) {
    return {
      match: true,
      variant: "billing",
      triageReturnStatus: "deterministic_billing_account_operator_review",
      reason_codes: billing.reason_codes,
      routingMetadata: buildDeterministicOperatorReviewRoutingMetadata({
        sender_role: "billing_or_account_followup",
        summary: billing.summary,
        routing_layer: DETERMINISTIC_OPERATOR_REVIEW_ROUTING_LAYERS.billing_account,
        reason_codes: billing.reason_codes,
        reason_codes_field: "deterministic_billing_reason_codes",
      }),
    };
  }

  const vp = evaluateDeterministicVendorPartnershipIngress({ subject, body });
  if (vp.match) {
    return {
      match: true,
      variant: "vendor_partnership",
      triageReturnStatus: "deterministic_vendor_partnership_operator_review",
      sender_role: vp.sender_role,
      reason_codes: vp.reason_codes,
      routingMetadata: buildDeterministicOperatorReviewRoutingMetadata({
        sender_role: vp.sender_role,
        summary: vp.summary,
        routing_layer: DETERMINISTIC_OPERATOR_REVIEW_ROUTING_LAYERS.vendor_partnership,
        reason_codes: vp.reason_codes,
        reason_codes_field: "deterministic_vendor_partnership_reason_codes",
      }),
    };
  }

  const rj = evaluateDeterministicRecruiterJobIngress({ subject, body });
  if (rj.match) {
    return {
      match: true,
      variant: "recruiter",
      triageReturnStatus: "deterministic_recruiter_job_operator_review",
      reason_codes: rj.reason_codes,
      routingMetadata: buildDeterministicOperatorReviewRoutingMetadata({
        sender_role: "recruiter_or_job_outreach",
        summary: rj.summary,
        routing_layer: DETERMINISTIC_OPERATOR_REVIEW_ROUTING_LAYERS.recruiter_job,
        reason_codes: rj.reason_codes,
        reason_codes_field: "deterministic_recruiter_job_reason_codes",
      }),
    };
  }

  return { match: false };
}

export function deterministicIngressPersistErrorLabel(
  variant: "billing" | "vendor_partnership" | "recruiter",
): string {
  switch (variant) {
    case "billing":
      return "billing account ingress";
    case "vendor_partnership":
      return "vendor/partnership ingress";
    case "recruiter":
      return "recruiter/job ingress";
  }
}

export async function persistDeterministicOperatorReviewIngressThread(
  supabase: SupabaseClient,
  params: {
    weddingId: string | null | undefined;
    tenantId: string;
    subjectLine: string;
    sender: string;
    body: string;
    routingMetadata: Record<string, unknown>;
    errorLabel: string;
  },
): Promise<{ threadId: string }> {
  const { data: thread, error: threadErr } = await supabase
    .from("threads")
    .insert({
      wedding_id: params.weddingId ?? undefined,
      photographer_id: params.tenantId,
      title: params.subjectLine,
      kind: "group",
      ai_routing_metadata: params.routingMetadata,
    })
    .select("id")
    .single();

  if (threadErr || !thread) {
    throw new Error(`${params.errorLabel}: thread insert failed: ${threadErr?.message}`);
  }

  const threadId = thread.id as string;

  const { error: msgErr } = await supabase.from("messages").insert({
    thread_id: threadId,
    photographer_id: params.tenantId,
    direction: "in",
    sender: params.sender || "unknown",
    body: params.body,
  });
  if (msgErr) {
    throw new Error(`${params.errorLabel}: message insert failed: ${msgErr.message}`);
  }

  return { threadId };
}
