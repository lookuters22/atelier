/**
 * Default window for case-scoped policy exceptions when the operator does not set `effective_until`.
 * Prevents exceptions from living in perpetuity by accident (enterprise guardrail).
 */
export const DEFAULT_AUTHORIZED_CASE_EXCEPTION_TTL_DAYS = 180;

export function addDaysIsoUtc(days: number, from: Date = new Date()): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}
