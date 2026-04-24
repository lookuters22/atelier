/**
 * Parse / build operator-assistant **project_commercial_amendment_proposal** actions.
 * Shared by the edge JSON parser and the widget normalizer (fail-closed).
 */
import { validateProjectCommercialAmendmentProposalV1 } from "./projectCommercialAmendmentProposalBounds.ts";
import {
  PROJECT_COMMERCIAL_AMENDMENT_CHANGE_CATEGORIES,
  PROJECT_COMMERCIAL_AMENDMENT_PROPOSAL_SCHEMA_VERSION,
  type ProjectCommercialAmendmentChangeCategory,
  type ProjectCommercialAmendmentDeltasV1,
  type ProjectCommercialAmendmentProposalV1,
} from "../types/projectCommercialAmendmentProposal.types.ts";
import type { OperatorAssistantProposedActionProjectCommercialAmendmentProposal } from "../types/operatorAssistantProposedAction.types.ts";

const RATIONALE_MAX = 8_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CATEGORY_SET = new Set<string>(PROJECT_COMMERCIAL_AMENDMENT_CHANGE_CATEGORIES as readonly string[]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isChangeCategory(s: string): s is ProjectCommercialAmendmentChangeCategory {
  return CATEGORY_SET.has(s);
}

function readWeddingId(o: Record<string, unknown>): string | null {
  const a = o.weddingId;
  const b = o.wedding_id;
  const raw = typeof a === "string" && a.trim() ? a : typeof b === "string" && b.trim() ? b : null;
  if (!raw) return null;
  const t = raw.trim();
  return UUID_RE.test(t) ? t : null;
}

function readChangeCategories(o: Record<string, unknown>): ProjectCommercialAmendmentChangeCategory[] | null {
  const raw = o.changeCategories ?? o.change_categories;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ProjectCommercialAmendmentChangeCategory[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string" || !isChangeCategory(x)) return null;
    if (seen.has(x)) return null;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function normalizeDeltasInput(
  raw: unknown,
  categories: ProjectCommercialAmendmentChangeCategory[],
): ProjectCommercialAmendmentDeltasV1 | null {
  if (!isPlainObject(raw)) return null;
  const catSet = new Set(categories);
  const d: ProjectCommercialAmendmentDeltasV1 = {};
  for (const c of categories) {
    const block = raw[c];
    if (!isPlainObject(block)) return null;
    if (c === "pricing") {
      if (typeof block.summary !== "string") return null;
      d.pricing = { summary: block.summary };
    } else if (c === "scope") {
      d.scope = {
        additions: Array.isArray(block.additions) ? block.additions.map((x) => String(x)) : [],
        removals: Array.isArray(block.removals) ? block.removals.map((x) => String(x)) : [],
      };
    } else if (c === "timeline") {
      if (typeof block.summary !== "string") return null;
      d.timeline = { summary: block.summary };
    } else if (c === "team") {
      const summary = typeof block.summary === "string" ? block.summary : "";
      const team: ProjectCommercialAmendmentDeltasV1["team"] = { summary };
      if (block.headcount_delta !== undefined) {
        if (typeof block.headcount_delta !== "number") return null;
        team.headcount_delta = block.headcount_delta;
      }
      d.team = team;
    } else if (c === "payment_schedule") {
      if (typeof block.summary !== "string") return null;
      d.payment_schedule = { summary: block.summary };
    }
  }
  for (const k of Object.keys(raw)) {
    if (!catSet.has(k as ProjectCommercialAmendmentChangeCategory)) {
      return null;
    }
  }
  return d;
}

export function buildProjectCommercialAmendmentProposalV1ForConfirm(
  p: OperatorAssistantProposedActionProjectCommercialAmendmentProposal,
): ProjectCommercialAmendmentProposalV1 {
  const deltas: ProjectCommercialAmendmentDeltasV1 = { ...p.deltas };
  return {
    schema_version: PROJECT_COMMERCIAL_AMENDMENT_PROPOSAL_SCHEMA_VERSION,
    source: "operator_assistant",
    proposed_at: new Date().toISOString(),
    rationale: p.rationale,
    wedding_id: p.weddingId.trim(),
    client_thread_id: p.clientThreadId?.trim() ? p.clientThreadId.trim() : null,
    change_categories: [...p.changeCategories],
    deltas,
  };
}

export function tryParseLlmProposedProjectCommercialAmendment(
  item: unknown,
):
  | { ok: true; value: OperatorAssistantProposedActionProjectCommercialAmendmentProposal }
  | { ok: false; reason: string } {
  if (item == null || typeof item !== "object" || (item as { kind?: unknown }).kind !== "project_commercial_amendment_proposal") {
    return { ok: false, reason: "not a project_commercial_amendment_proposal" };
  }
  const o = item as Record<string, unknown>;
  if (typeof o.rationale !== "string" || !o.rationale.trim()) {
    return { ok: false, reason: "rationale is required" };
  }
  const rationale = o.rationale.trim();
  if (rationale.length > RATIONALE_MAX) {
    return { ok: false, reason: `rationale exceeds ${RATIONALE_MAX} characters` };
  }
  const weddingId = readWeddingId(o);
  if (!weddingId) {
    return { ok: false, reason: "weddingId must be a UUID" };
  }
  const changeCategories = readChangeCategories(o);
  if (!changeCategories) {
    return { ok: false, reason: "changeCategories must be a non-empty array of valid categories" };
  }

  let clientThreadId: string | null = null;
  if ("clientThreadId" in o || "client_thread_id" in o) {
    const raw = o.clientThreadId !== undefined ? o.clientThreadId : o.client_thread_id;
    if (raw === null || raw === undefined) {
      clientThreadId = null;
    } else if (typeof raw === "string") {
      const t = raw.trim();
      if (!t.length) {
        clientThreadId = null;
      } else if (!UUID_RE.test(t)) {
        return { ok: false, reason: "clientThreadId must be a UUID when set" };
      } else {
        clientThreadId = t;
      }
    } else {
      return { ok: false, reason: "clientThreadId must be a string when set" };
    }
  }

  const deltas = normalizeDeltasInput(o.deltas, changeCategories);
  if (!deltas) {
    return { ok: false, reason: "deltas must match changeCategories" };
  }

  const proposal: OperatorAssistantProposedActionProjectCommercialAmendmentProposal = {
    kind: "project_commercial_amendment_proposal",
    rationale,
    weddingId,
    clientThreadId,
    changeCategories,
    deltas,
  };

  const assembled = buildProjectCommercialAmendmentProposalV1ForConfirm(proposal);
  const v = validateProjectCommercialAmendmentProposalV1(assembled);
  if (!v.ok) {
    return { ok: false, reason: v.error };
  }
  return { ok: true, value: proposal };
}

export function normalizeProjectCommercialAmendmentProposalsForWidget(
  raw: unknown,
): OperatorAssistantProposedActionProjectCommercialAmendmentProposal[] {
  if (!Array.isArray(raw)) return [];
  const out: OperatorAssistantProposedActionProjectCommercialAmendmentProposal[] = [];
  for (const x of raw) {
    const p = tryParseLlmProposedProjectCommercialAmendment(x);
    if (p.ok) {
      out.push(p.value);
    }
  }
  return out;
}
