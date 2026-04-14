/**
 * Deterministic backstop: block planner-private commercial language in client-visible / redacted-audience drafts.
 */
export type PlannerPrivateLeakageAuditResult = {
  isValid: boolean;
  violations: string[];
};

const PROSE_PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "commission", re: /\bcommission\b/i },
  { id: "agency_fee", re: /\bagency\s+fees?\b/i },
  { id: "markup", re: /\bmarkup\b/i },
  { id: "internal_deal", re: /\binternal\s+(deal|negotiation|margin)\b/i },
  { id: "planner_commission", re: /\bplanner\s+commission\b/i },
];

/**
 * When `enforceClientSafeProse` is true (same flag as context redaction), reject drafts that mention
 * blocked commercial terms. When false (planner-only thread), always pass.
 */
export function auditPlannerPrivateLeakage(
  emailDraft: string,
  enforceClientSafeProse: boolean,
): PlannerPrivateLeakageAuditResult {
  if (!enforceClientSafeProse) {
    return { isValid: true, violations: [] };
  }
  const violations: string[] = [];
  for (const { id, re } of PROSE_PATTERNS) {
    if (re.test(emailDraft)) {
      violations.push(`planner_private_leak:${id}`);
    }
  }
  return {
    isValid: violations.length === 0,
    violations,
  };
}
