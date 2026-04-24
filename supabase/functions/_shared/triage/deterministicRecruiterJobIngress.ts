/**
 * Conservative deterministic routing for human recruiter / job / staffing outreach on
 * `comms/email.received` (after billing and vendor/partnership in triage, before LLM / dedup).
 * {@link evaluateDeterministicBillingAccountIngress} and {@link evaluateDeterministicVendorPartnershipIngress}
 * take precedence when they match.
 */

import { evaluateDeterministicBillingAccountIngress } from "./deterministicBillingAccountIngress.ts";
import {
  evaluateDeterministicVendorPartnershipIngress,
  hitDeterministicClientInquiryGuard,
} from "./deterministicVendorPartnershipIngress.ts";

export type DeterministicRecruiterJobIngressResult =
  | { match: false }
  | {
      match: true;
      sender_role: "recruiter_or_job_outreach";
      reason_codes: string[];
      summary: string;
    };

/** Unambiguous hiring / recruiting outreach (one hit is enough after higher gates + client guard). */
const RECRUITER_STRONG: readonly { code: string; re: RegExp }[] = [
  { code: "recruiter_strong_talent_acquisition", re: /\btalent\s+acquisition\b|\bt\/a\s+team\b/i },
  {
    code: "recruiter_strong_recruiter_title",
    re: /\b(technical|senior|executive|lead|creative|agency)\s+recruiter\b|\brecruiting\s+partner\b|\bexecutive\s+search\b/i,
  },
  {
    code: "recruiter_strong_recruitment_staffing_firm",
    re: /\brecruitment\s+(agency|firm|consultant|services)\b|\bstaffing\s+(agency|firm|services|placement|consultant)\b/i,
  },
  {
    code: "recruiter_strong_cv_resume_request",
    re: /\b(attach|send|share)\s+(us\s+)?(your\s+)?(cv|resume|curriculum vitae)\b|\bupdated\s+resume\b/i,
  },
  {
    code: "recruiter_strong_interview_schedule",
    re: /\bschedule\s+(a\s+)?(zoom\s+)?(call|interview|screening|phone screen)\b|\binterview\s+(availability|slots?)\b|\bphone\s+screen\b/i,
  },
  { code: "recruiter_strong_headhunt", re: /\bhead\s*hunt/i },
  {
    code: "recruiter_strong_announced_role",
    re: /\b(contract|fixed[-\s]?term|full[-\s]?time|part[-\s]?time)\s+role\s+(at|with)\b/i,
  },
  { code: "recruiter_strong_job_description", re: /\bjob\s+description\b/i },
  {
    code: "recruiter_strong_placement_search",
    re: /\bplacement\s+(fee|specialist|consultant)\b|\bcontingent\s+search\b/i,
  },
  {
    code: "recruiter_strong_sourcer",
    re: /\bsourcer\b|\bsourcing\s+specialist\b/i,
  },
];

/**
 * Weaker signals — require two independent hits (and never “opportunity” / “team” / generic “role” alone).
 */
const RECRUITER_MEDIUM: readonly { code: string; re: RegExp }[] = [
  { code: "recruiter_medium_recruiter_word", re: /\brecruiter\b/i },
  { code: "recruiter_medium_recruitment_word", re: /\brecruitment\b/i },
  { code: "recruiter_medium_hiring_manager", re: /\bhiring\s+manager\b/i },
  { code: "recruiter_medium_open_role", re: /\bopen\s+role\b/i },
  { code: "recruiter_medium_job_opening", re: /\bjob\s+opening\b/i },
  { code: "recruiter_medium_job_opportunity", re: /\bjob\s+opportunity\b/i },
  { code: "recruiter_medium_position_open", re: /\bposition\s+(is\s+)?(open|available)\b/i },
  {
    code: "recruiter_medium_candidate_flow",
    re: /\bcandidate\s+(screening|shortlist|pipeline)\b/i,
  },
  { code: "recruiter_medium_contract_to_hire", re: /\bcontract[-\s]?to[-\s]?hire\b/i },
  {
    code: "recruiter_medium_freelance_roster",
    re: /\bfreelance\s+roster\b|\bcontractor\s+bench\b/i,
  },
];

function normalizeHaystack(subject: string, body: string): string {
  return `${subject}\n${body}`.toLowerCase();
}

function firstRecruiterStrong(haystack: string): string | null {
  for (const { code, re } of RECRUITER_STRONG) {
    if (re.test(haystack)) return code;
  }
  return null;
}

function collectRecruiterMedium(haystack: string): string[] {
  const codes = new Set<string>();
  for (const { code, re } of RECRUITER_MEDIUM) {
    if (re.test(haystack)) codes.add(code);
  }
  return [...codes];
}

export function evaluateDeterministicRecruiterJobIngress(input: {
  subject: string;
  body: string;
}): DeterministicRecruiterJobIngressResult {
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!subject && !body) return { match: false };

  if (evaluateDeterministicBillingAccountIngress({ subject, body }).match) {
    return { match: false };
  }

  if (evaluateDeterministicVendorPartnershipIngress({ subject, body }).match) {
    return { match: false };
  }

  const haystack = normalizeHaystack(subject, body);
  if (hitDeterministicClientInquiryGuard(haystack)) return { match: false };

  const strong = firstRecruiterStrong(haystack);
  if (strong) {
    return {
      match: true,
      sender_role: "recruiter_or_job_outreach",
      reason_codes: [strong],
      summary: "Deterministic recruiter/job outreach: strong hiring or recruiting signal.",
    };
  }

  const medium = collectRecruiterMedium(haystack);
  if (medium.length >= 2) {
    return {
      match: true,
      sender_role: "recruiter_or_job_outreach",
      reason_codes: ["recruiter_evidence_medium_2", ...medium],
      summary: "Deterministic recruiter/job outreach: multiple independent medium-signal hits.",
    };
  }

  return { match: false };
}
