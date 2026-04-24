/**
 * Validate v1 project commercial amendment proposals (narrow schema; fail-closed).
 */
import {
  PROJECT_COMMERCIAL_AMENDMENT_CHANGE_CATEGORIES,
  PROJECT_COMMERCIAL_AMENDMENT_PROPOSAL_SCHEMA_VERSION,
  type ProjectCommercialAmendmentChangeCategory,
  type ProjectCommercialAmendmentDeltasV1,
  type ProjectCommercialAmendmentProposalV1,
} from "../types/projectCommercialAmendmentProposal.types.ts";

const RATIONALE_MAX = 8_000;
const SUMMARY_MAX = 4_000;
const SCOPE_LINE_MAX = 500;
const SCOPE_MAX_LINES = 20;
const HEADCOUNT_DELTA_MIN = -20;
const HEADCOUNT_DELTA_MAX = 20;

const PROPOSED_AT_RE = /^\d{4}-\d{2}-\d{2}T/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CATEGORY_SET = new Set<string>(PROJECT_COMMERCIAL_AMENDMENT_CHANGE_CATEGORIES as readonly string[]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isChangeCategory(s: string): s is ProjectCommercialAmendmentChangeCategory {
  return CATEGORY_SET.has(s);
}

function trimNonEmptySummary(s: unknown, field: string): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof s !== "string") {
    return { ok: false, error: `${field} must be a string` };
  }
  const t = s.trim();
  if (!t.length) {
    return { ok: false, error: `${field} must be non-empty` };
  }
  if (t.length > SUMMARY_MAX) {
    return { ok: false, error: `${field} exceeds ${SUMMARY_MAX} characters` };
  }
  return { ok: true, value: t };
}

function parseScopeLines(raw: unknown, field: string): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: `${field} must be an array` };
  }
  if (raw.length > SCOPE_MAX_LINES) {
    return { ok: false, error: `${field} exceeds ${SCOPE_MAX_LINES} lines` };
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      return { ok: false, error: `${field} entries must be strings` };
    }
    const t = item.trim();
    if (!t.length) continue;
    if (t.length > SCOPE_LINE_MAX) {
      return { ok: false, error: `${field} line exceeds ${SCOPE_LINE_MAX} characters` };
    }
    out.push(t);
  }
  return { ok: true, value: out };
}

/**
 * True when each declared category has non-empty bounded content in `deltas`.
 */
export function projectCommercialAmendmentDeltasHaveEffect(
  categories: ProjectCommercialAmendmentChangeCategory[],
  deltas: ProjectCommercialAmendmentDeltasV1,
): boolean {
  for (const c of categories) {
    if (c === "pricing") {
      const s = deltas.pricing?.summary?.trim();
      if (s) return true;
      continue;
    }
    if (c === "scope") {
      const add = deltas.scope?.additions ?? [];
      const rem = deltas.scope?.removals ?? [];
      if (add.some((x) => x.trim().length > 0) || rem.some((x) => x.trim().length > 0)) return true;
      continue;
    }
    if (c === "timeline") {
      const s = deltas.timeline?.summary?.trim();
      if (s) return true;
      continue;
    }
    if (c === "team") {
      const s = deltas.team?.summary?.trim() ?? "";
      const hd = deltas.team?.headcount_delta;
      if (s.length > 0 || hd !== undefined) return true;
      continue;
    }
    if (c === "payment_schedule") {
      const s = deltas.payment_schedule?.summary?.trim();
      if (s) return true;
    }
  }
  return false;
}

/**
 * Rejects unknown categories, oversized strings, empty patches, and extra delta keys.
 */
export function validateProjectCommercialAmendmentProposalV1(
  raw: unknown,
): { ok: true; value: ProjectCommercialAmendmentProposalV1 } | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: "proposal must be a JSON object" };
  }
  if (raw.schema_version !== PROJECT_COMMERCIAL_AMENDMENT_PROPOSAL_SCHEMA_VERSION) {
    return { ok: false, error: "schema_version must be 1" };
  }
  if (raw.source !== "operator_assistant" && raw.source !== "operator" && raw.source !== "system") {
    return { ok: false, error: "invalid source" };
  }
  if (typeof raw.proposed_at !== "string" || !raw.proposed_at.trim() || !PROPOSED_AT_RE.test(raw.proposed_at.trim())) {
    return { ok: false, error: "proposed_at must be an ISO-8601 string" };
  }
  if (typeof raw.rationale !== "string" || !raw.rationale.trim()) {
    return { ok: false, error: "rationale is required" };
  }
  if (raw.rationale.length > RATIONALE_MAX) {
    return { ok: false, error: `rationale exceeds ${RATIONALE_MAX} characters` };
  }
  if (typeof raw.wedding_id !== "string" || !UUID_RE.test(raw.wedding_id.trim())) {
    return { ok: false, error: "wedding_id must be a UUID" };
  }
  const wedding_id = raw.wedding_id.trim();

  let client_thread_id: string | null = null;
  if (raw.client_thread_id !== undefined && raw.client_thread_id !== null) {
    if (typeof raw.client_thread_id !== "string" || !UUID_RE.test(raw.client_thread_id.trim())) {
      return { ok: false, error: "client_thread_id must be a UUID when set" };
    }
    client_thread_id = raw.client_thread_id.trim();
  }

  if (!Array.isArray(raw.change_categories) || raw.change_categories.length === 0) {
    return { ok: false, error: "change_categories must be a non-empty array" };
  }
  const change_categories: ProjectCommercialAmendmentChangeCategory[] = [];
  const seen = new Set<string>();
  for (const x of raw.change_categories) {
    if (typeof x !== "string" || !isChangeCategory(x)) {
      return { ok: false, error: "change_categories: invalid category" };
    }
    if (seen.has(x)) {
      return { ok: false, error: `change_categories: duplicate "${x}"` };
    }
    seen.add(x);
    change_categories.push(x);
  }

  if (!isPlainObject(raw.deltas)) {
    return { ok: false, error: "deltas must be an object" };
  }

  const allowedDeltaKeys = new Set<string>(change_categories);
  for (const k of Object.keys(raw.deltas)) {
    if (!allowedDeltaKeys.has(k)) {
      return { ok: false, error: `deltas: unexpected key "${k}" for declared categories` };
    }
  }

  const deltas: ProjectCommercialAmendmentDeltasV1 = {};

  for (const c of change_categories) {
    const block = raw.deltas[c];
    if (!isPlainObject(block)) {
      return { ok: false, error: `deltas.${c} must be an object` };
    }
    if (c === "pricing") {
      const sm = trimNonEmptySummary(block.summary, "deltas.pricing.summary");
      if (!sm.ok) return sm;
      deltas.pricing = { summary: sm.value };
    } else if (c === "scope") {
      const adds = parseScopeLines(block.additions ?? [], "deltas.scope.additions");
      if (!adds.ok) return adds;
      const rems = parseScopeLines(block.removals ?? [], "deltas.scope.removals");
      if (!rems.ok) return rems;
      if (adds.value.length === 0 && rems.value.length === 0) {
        return { ok: false, error: "deltas.scope must include at least one addition or removal" };
      }
      deltas.scope = { additions: adds.value, removals: rems.value };
    } else if (c === "timeline") {
      const sm = trimNonEmptySummary(block.summary, "deltas.timeline.summary");
      if (!sm.ok) return sm;
      deltas.timeline = { summary: sm.value };
    } else if (c === "team") {
      let summary = "";
      if (block.summary !== undefined && block.summary !== null) {
        if (typeof block.summary !== "string") {
          return { ok: false, error: "deltas.team.summary must be a string when set" };
        }
        summary = block.summary.trim();
        if (summary.length > SUMMARY_MAX) {
          return { ok: false, error: `deltas.team.summary exceeds ${SUMMARY_MAX} characters` };
        }
      }
      let headcount_delta: number | undefined;
      if (block.headcount_delta !== undefined) {
        if (typeof block.headcount_delta !== "number" || !Number.isInteger(block.headcount_delta)) {
          return { ok: false, error: "deltas.team.headcount_delta must be an integer when set" };
        }
        if (block.headcount_delta < HEADCOUNT_DELTA_MIN || block.headcount_delta > HEADCOUNT_DELTA_MAX) {
          return {
            ok: false,
            error: `deltas.team.headcount_delta must be between ${HEADCOUNT_DELTA_MIN} and ${HEADCOUNT_DELTA_MAX}`,
          };
        }
        headcount_delta = block.headcount_delta;
      }
      if (!summary.length && headcount_delta === undefined) {
        return { ok: false, error: "deltas.team must include summary and/or headcount_delta" };
      }
      deltas.team =
        headcount_delta !== undefined ? { summary, headcount_delta } : { summary };
    } else if (c === "payment_schedule") {
      const sm = trimNonEmptySummary(block.summary, "deltas.payment_schedule.summary");
      if (!sm.ok) return sm;
      deltas.payment_schedule = { summary: sm.value };
    }
  }

  if (!projectCommercialAmendmentDeltasHaveEffect(change_categories, deltas)) {
    return { ok: false, error: "deltas must have effect for each change category" };
  }

  const value: ProjectCommercialAmendmentProposalV1 = {
    schema_version: PROJECT_COMMERCIAL_AMENDMENT_PROPOSAL_SCHEMA_VERSION,
    source: raw.source,
    proposed_at: raw.proposed_at.trim(),
    rationale: raw.rationale.trim(),
    wedding_id,
    client_thread_id,
    change_categories,
    deltas,
  };
  return { ok: true, value };
}
