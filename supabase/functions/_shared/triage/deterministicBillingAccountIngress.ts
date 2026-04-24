/**
 * Conservative, deterministic routing for human-written billing / account / finance
 * follow-up on `comms/email.received` (after raw suppression, before LLM / dedup).
 * Project-type agnostic; no wedding-only wording.
 */

const SUBJECT_BILLING_STRONG: RegExp[] = [
  /\binvoice\s*#\s*\d+/i,
  /\binvoice\s+number\b/i,
  /\bpayment\s+received\b/i,
  /\bpayment\s+confirmation\b/i,
  /\bwire\s+(transfer|instructions?)\b/i,
  /\bremittance\b/i,
  /\bvat\s+invoice\b/i,
  /\btax\s+invoice\b/i,
  /\bstatement\s+of\s+account\b/i,
  /\baccounts?\s+payable\b/i,
  /\boutstanding\s+balance\b/i,
  /\bpayment\s+reminder\b/i,
  /\bbookkeeping\b/i,
  /\breconciliation\b/i,
  /^\s*re:\s*invoice\b/i,
  /\binvoice\s+attached\b/i,
];

/** Medium subject: finance-ish but not bare "payment" / "transfer" (too common in client mail). */
const SUBJECT_BILLING_MEDIUM =
  /\b(invoice|invoices|wire|remittance|bookkeeping|reconciliation|accounts?\s+payable|outstanding\s+balance|payout|\biban\b|\bvat\b)\b/i;

/** Lowercased substrings; must appear in subject+body (haystack). */
const BODY_BILLING_MARKERS: readonly string[] = [
  "iban:",
  "iban ",
  "swift code",
  "bic code",
  "wire transfer",
  "routing number:",
  "sort code:",
  "payment reference",
  "remittance advice",
  "vat registration",
  "please find attached invoice",
  "please find the attached invoice",
  "bank details for",
  "beneficiary name",
  "amount due",
  "amount outstanding",
  "tax id:",
  "tax id ",
];

export type DeterministicBillingAccountIngressResult =
  | { match: false }
  | {
      match: true;
      reason_codes: string[];
      summary: string;
    };

function normalizeHaystack(subject: string, body: string): string {
  return `${subject}\n${body}`.toLowerCase();
}

export function evaluateDeterministicBillingAccountIngress(input: {
  subject: string;
  body: string;
}): DeterministicBillingAccountIngressResult {
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!subject && !body) return { match: false };

  const haystack = normalizeHaystack(subject, body);
  const reason_codes: string[] = [];

  let subjectStrong = false;
  for (const re of SUBJECT_BILLING_STRONG) {
    if (re.test(subject)) {
      subjectStrong = true;
      reason_codes.push("subject_billing_strong");
      break;
    }
  }

  const bodyHits: string[] = [];
  for (const m of BODY_BILLING_MARKERS) {
    if (haystack.includes(m)) bodyHits.push(m);
  }
  if (bodyHits.length > 0) {
    reason_codes.push(`body_billing_markers:${bodyHits.length}`);
  }

  const subjectMedium = SUBJECT_BILLING_MEDIUM.test(subject);

  const match =
    subjectStrong ||
    bodyHits.length >= 2 ||
    (bodyHits.length >= 1 && subjectMedium);

  if (!match) return { match: false };

  const summary = subjectStrong
    ? "Deterministic billing/account: strong subject signal."
    : bodyHits.length >= 2
      ? "Deterministic billing/account: multiple finance/body markers."
      : "Deterministic billing/account: finance body marker + billing-related subject.";

  return { match: true, reason_codes, summary };
}
