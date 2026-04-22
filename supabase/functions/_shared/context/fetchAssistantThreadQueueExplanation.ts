/**
 * Read-only thread-scoped queue / “Review” explanation for operator Ana (review-queue slice).
 * Grounds *why this thread is on the operator’s radar* in `threads`, open `escalation_requests`,
 * pending `drafts`, optional `v3_thread_workflow_state`, and the same inbox bucket rules as Today.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Json } from "../../../../src/types/database.types.ts";
import { INQUIRY_STAGES } from "../../../../src/lib/inboxVisibleThreads.ts";
import {
  deriveInboxThreadBucket,
  readInboxMetadataSenderRole,
  type InboxThreadBucket,
} from "../../../../src/lib/inboxThreadBucket.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_ESCALATION_QUESTION_CHARS = 1500;
export const MAX_WORKFLOW_JSON_CHARS = 8000;
const MAX_ESCALATION_ROWS = 8;
const MAX_DRAFT_ROWS = 8;

function clip(s: string, max: number): { text: string; clipped: boolean } {
  if (s.length <= max) return { text: s, clipped: false };
  return { text: s.slice(0, max), clipped: true };
}

function readRoutingDisposition(meta: Json | null): string | null {
  if (meta == null || typeof meta !== "object" || Array.isArray(meta)) return null;
  const v = (meta as Record<string, unknown>).routing_disposition;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function serializeWorkflow(raw: Json | null): { json: string | null; truncated: boolean } {
  if (raw == null) return { json: null, truncated: false };
  try {
    const s = JSON.stringify(raw);
    if (s.length <= MAX_WORKFLOW_JSON_CHARS) return { json: s, truncated: false };
    return { json: `${s.slice(0, MAX_WORKFLOW_JSON_CHARS)}…`, truncated: true };
  } catch {
    return { json: "[workflow: not serializable]", truncated: false };
  }
}

const EVIDENCE_NOTE =
  "Evidence is from `threads`, open `escalation_requests`, pending-approval `drafts`, optional `v3_thread_workflow_state`, and `weddings.stage` when linked. **derivedInboxBucket** uses the same `ai_routing_metadata` rules as the app’s inbox bucket (see `deriveInboxThreadBucket`). Zen **tab hints** mirror the Today / Zen feed mapping — they are **derived**, not extra DB columns. Do not invent a *human* reason beyond these fields; if workflow JSON is opaque, say so.";

export type AssistantThreadQueueZenTabHints = {
  review: { likely: boolean; because: string[] };
  drafts: { likely: boolean; because: string[] };
  leads: { likely: boolean; because: string[] };
  needs_filing: { likely: boolean; because: string[] };
};

export type AssistantThreadQueueExplanationSnapshot = {
  didRun: boolean;
  selectionNote: "ok" | "invalid_thread_id" | "thread_not_found_or_denied";
  threadId: string | null;
  thread: null | {
    id: string;
    title: string;
    kind: string;
    channel: string;
    weddingId: string | null;
    weddingStage: string | null;
    needsHuman: boolean;
    automationMode: string;
    v3OperatorAutomationHold: boolean;
    v3OperatorHoldEscalationId: string | null;
    lastActivityAt: string;
    status: string;
    derivedInboxBucket: InboxThreadBucket;
    routingDisposition: string | null;
    senderRole: string | null;
  };
  openEscalations: Array<{
    id: string;
    createdAt: string;
    actionKey: string;
    reasonCode: string;
    questionBody: string;
    questionBodyClipped: boolean;
  }>;
  pendingApprovalDrafts: Array<{
    id: string;
    createdAt: string;
    status: string;
    sourceActionKey: string | null;
  }>;
  v3ThreadWorkflow: null | {
    nextDueAt: string | null;
    updatedAt: string;
    workflowJson: string | null;
    workflowTruncated: boolean;
  };
  zenTabHints: AssistantThreadQueueZenTabHints;
  /** Extra grounded flags / bucket notes (not tab mapping). */
  informationalNotes: string[];
  evidenceNote: string;
};

function buildZenTabHints(
  bucket: InboxThreadBucket,
  weddingId: string | null,
  weddingStage: string | null,
  openEscalationCount: number,
  pendingDraftCount: number,
): AssistantThreadQueueZenTabHints {
  const because = {
    review: [] as string[],
    drafts: [] as string[],
    leads: [] as string[],
    needs_filing: [] as string[],
  };

  if (openEscalationCount > 0) {
    because.review.push(`Open escalation_requests for this thread (${openEscalationCount}).`);
  }
  if (bucket === "operator_review" && weddingId == null) {
    because.review.push(
      "Inbox bucket is **operator_review** (from `ai_routing_metadata.sender_role` / routing rules).",
    );
  }
  if (pendingDraftCount > 0) {
    because.drafts.push(`drafts.status = pending_approval on this thread (${pendingDraftCount}).`);
  }

  const linkedOpenLead =
    weddingId != null && weddingStage != null && INQUIRY_STAGES.has(weddingStage);
  if (bucket === "inquiry") {
    because.leads.push("Inbox bucket is **inquiry** (unlinked lead / customer_lead routing).");
  }
  if (linkedOpenLead) {
    because.leads.push(`Thread is linked to a project in an open-lead stage (**weddings.stage** in inquiry set).`);
  }

  if (bucket === "unfiled" && weddingId == null) {
    because.needs_filing.push(
      "Inbox bucket is **needs filing** (`unfiled` — suggested match / unresolved routing metadata).",
    );
  }

  return {
    review: { likely: because.review.length > 0, because: because.review },
    drafts: { likely: because.drafts.length > 0, because: because.drafts },
    leads: { likely: because.leads.length > 0, because: because.leads },
    needs_filing: { likely: because.needs_filing.length > 0, because: because.needs_filing },
  };
}

export async function fetchAssistantThreadQueueExplanation(
  supabase: SupabaseClient,
  photographerId: string,
  threadIdRaw: unknown,
): Promise<AssistantThreadQueueExplanationSnapshot> {
  const threadId = String(threadIdRaw ?? "").trim();
  if (!UUID_RE.test(threadId)) {
    return {
      didRun: true,
      selectionNote: "invalid_thread_id",
      threadId: null,
      thread: null,
      openEscalations: [],
      pendingApprovalDrafts: [],
      v3ThreadWorkflow: null,
      zenTabHints: {
        review: { likely: false, because: [] },
        drafts: { likely: false, because: [] },
        leads: { likely: false, because: [] },
        needs_filing: { likely: false, because: [] },
      },
      informationalNotes: [],
      evidenceNote: EVIDENCE_NOTE,
    };
  }

  const { data: trow, error: terr } = await supabase
    .from("threads")
    .select(
      "id, title, kind, channel, wedding_id, needs_human, automation_mode, v3_operator_automation_hold, v3_operator_hold_escalation_id, ai_routing_metadata, last_activity_at, status",
    )
    .eq("id", threadId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (terr) {
    throw new Error(`fetchAssistantThreadQueueExplanation: threads: ${terr.message}`);
  }
  if (trow == null) {
    return {
      didRun: true,
      selectionNote: "thread_not_found_or_denied",
      threadId,
      thread: null,
      openEscalations: [],
      pendingApprovalDrafts: [],
      v3ThreadWorkflow: null,
      zenTabHints: {
        review: { likely: false, because: [] },
        drafts: { likely: false, because: [] },
        leads: { likely: false, because: [] },
        needs_filing: { likely: false, because: [] },
      },
      informationalNotes: [],
      evidenceNote: EVIDENCE_NOTE,
    };
  }

  const row = trow as {
    id: string;
    title: string;
    kind: string;
    channel: string;
    wedding_id: string | null;
    needs_human: boolean;
    automation_mode: string;
    v3_operator_automation_hold: boolean;
    v3_operator_hold_escalation_id: string | null;
    ai_routing_metadata: Json | null;
    last_activity_at: string;
    status: string;
  };

  const weddingId = row.wedding_id;

  const [escRes, draftsRes, wfRes, wedRes] = await Promise.all([
    supabase
      .from("escalation_requests")
      .select("id, created_at, action_key, reason_code, question_body")
      .eq("photographer_id", photographerId)
      .eq("thread_id", threadId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(MAX_ESCALATION_ROWS),
    supabase
      .from("drafts")
      .select("id, created_at, status, source_action_key")
      .eq("photographer_id", photographerId)
      .eq("thread_id", threadId)
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false })
      .limit(MAX_DRAFT_ROWS),
    supabase
      .from("v3_thread_workflow_state")
      .select("next_due_at, updated_at, workflow")
      .eq("photographer_id", photographerId)
      .eq("thread_id", threadId)
      .maybeSingle(),
    weddingId
      ? supabase
          .from("weddings")
          .select("stage")
          .eq("photographer_id", photographerId)
          .eq("id", weddingId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (escRes.error) {
    throw new Error(`fetchAssistantThreadQueueExplanation: escalations: ${escRes.error.message}`);
  }
  if (draftsRes.error) {
    throw new Error(`fetchAssistantThreadQueueExplanation: drafts: ${draftsRes.error.message}`);
  }
  if (wfRes.error) {
    throw new Error(`fetchAssistantThreadQueueExplanation: v3_thread_workflow_state: ${wfRes.error.message}`);
  }
  if (weddingId && wedRes.error) {
    throw new Error(`fetchAssistantThreadQueueExplanation: weddings: ${wedRes.error.message}`);
  }

  const meta = row.ai_routing_metadata;
  const derivedInboxBucket = deriveInboxThreadBucket({
    weddingId,
    ai_routing_metadata: meta,
  });
  const senderRole = readInboxMetadataSenderRole(meta);
  const routingDisposition = readRoutingDisposition(meta);

  const weddingStage =
    weddingId && wedRes.data != null
      ? String((wedRes.data as { stage: string }).stage ?? "")
      : null;

  const openEscalations = (escRes.data ?? []).map((r) => {
    const e = r as {
      id: string;
      created_at: string;
      action_key: string;
      reason_code: string;
      question_body: string;
    };
    const qb = clip(String(e.question_body ?? ""), MAX_ESCALATION_QUESTION_CHARS);
    return {
      id: e.id,
      createdAt: e.created_at,
      actionKey: e.action_key,
      reasonCode: e.reason_code,
      questionBody: qb.text,
      questionBodyClipped: qb.clipped,
    };
  });

  const pendingApprovalDrafts = (draftsRes.data ?? []).map((r) => {
    const d = r as {
      id: string;
      created_at: string;
      status: string;
      source_action_key: string | null;
    };
    return {
      id: d.id,
      createdAt: d.created_at,
      status: d.status,
      sourceActionKey: d.source_action_key,
    };
  });

  let v3ThreadWorkflow: AssistantThreadQueueExplanationSnapshot["v3ThreadWorkflow"] = null;
  if (wfRes.data != null) {
    const w = wfRes.data as {
      next_due_at: string | null;
      updated_at: string;
      workflow: Json;
    };
    const ser = serializeWorkflow(w.workflow);
    v3ThreadWorkflow = {
      nextDueAt: w.next_due_at,
      updatedAt: w.updated_at,
      workflowJson: ser.json,
      workflowTruncated: ser.truncated,
    };
  }

  const zenTabHints = buildZenTabHints(
    derivedInboxBucket,
    weddingId,
    weddingStage,
    openEscalations.length,
    pendingApprovalDrafts.length,
  );

  const informationalNotes: string[] = [];
  if (derivedInboxBucket === "suppressed") {
    informationalNotes.push(
      "Inbox bucket is **suppressed** (`routing_disposition` promo_automated) — usually not in the priority Today list.",
    );
  }
  if (row.needs_human) {
    informationalNotes.push("**needs_human** is true on this **threads** row.");
  }
  if (row.v3_operator_automation_hold) {
    informationalNotes.push("**v3_operator_automation_hold** is true on this **threads** row.");
  }
  if (row.v3_operator_hold_escalation_id) {
    informationalNotes.push(
      `**v3_operator_hold_escalation_id** is set (escalation id: ${row.v3_operator_hold_escalation_id}) — use open escalations list for the question text when status is open.`,
    );
  }

  return {
    didRun: true,
    selectionNote: "ok",
    threadId: row.id,
    thread: {
      id: row.id,
      title: row.title,
      kind: row.kind,
      channel: row.channel,
      weddingId,
      weddingStage,
      needsHuman: row.needs_human,
      automationMode: row.automation_mode,
      v3OperatorAutomationHold: row.v3_operator_automation_hold,
      v3OperatorHoldEscalationId: row.v3_operator_hold_escalation_id,
      lastActivityAt: row.last_activity_at,
      status: row.status,
      derivedInboxBucket,
      routingDisposition,
      senderRole,
    },
    openEscalations,
    pendingApprovalDrafts,
    v3ThreadWorkflow,
    zenTabHints,
    informationalNotes,
    evidenceNote: EVIDENCE_NOTE,
  };
}

export function threadQueueExplanationToolPayload(
  snap: AssistantThreadQueueExplanationSnapshot,
): Record<string, unknown> {
  return {
    didRun: snap.didRun,
    selectionNote: snap.selectionNote,
    thread: snap.thread,
    openEscalations: snap.openEscalations,
    pendingApprovalDrafts: snap.pendingApprovalDrafts,
    v3ThreadWorkflow: snap.v3ThreadWorkflow,
    zenTabHints: snap.zenTabHints,
    informationalNotes: snap.informationalNotes,
    evidenceNote: snap.evidenceNote,
    semanticsNote:
      "**Review** Zen tab includes open escalations and unlinked **operator_review** inbox threads. **Drafts** tab = pending draft approvals. **Leads** = inquiry-bucket unlinked threads or linked pre-booking projects. **Needs filing** = unresolved routing / unfiled bucket. `needs_human` / `v3_operator_automation_hold` are flags on `threads` — cite them; do not infer internal policy beyond the values shown.",
  };
}
