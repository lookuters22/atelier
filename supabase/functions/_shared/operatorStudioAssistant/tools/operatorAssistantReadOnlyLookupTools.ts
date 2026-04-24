/**
 * Bounded, deterministic read-only tools for operator Ana second-pass retrieval.
 * No writes; tenant-scoped; reuses existing context helpers.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  AssistantContext,
  AssistantFocusedProjectFacts,
} from "../../../../../src/types/assistantContext.types.ts";
import { fetchAssistantQueryEntityIndex } from "../../context/fetchAssistantQueryEntityIndex.ts";
import {
  resolveOperatorQueryEntitiesFromIndex,
  shouldRunOperatorQueryEntityResolution,
} from "../../context/resolveOperatorQueryEntitiesFromIndex.ts";
import {
  fetchAssistantThreadMessageBodies,
} from "../../context/fetchAssistantThreadMessageBodies.ts";
import { fetchAssistantOperatorCorpusSearch } from "../../context/fetchAssistantOperatorCorpusSearch.ts";
import { fetchAssistantThreadMessageLookup } from "../../context/fetchAssistantThreadMessageLookup.ts";
import { fetchAssistantInquiryCountSnapshot } from "../../context/fetchAssistantInquiryCountSnapshot.ts";
import {
  isValidAssistantProjectIdUuid,
  readAssistantProjectDetailById,
} from "../../context/fetchAssistantFocusedProjectFacts.ts";
import {
  draftProvenanceToolPayload,
  fetchAssistantDraftProvenance,
} from "../../context/fetchAssistantDraftProvenance.ts";
import {
  fetchAssistantThreadQueueExplanation,
  threadQueueExplanationToolPayload,
} from "../../context/fetchAssistantThreadQueueExplanation.ts";
import {
  escalationProvenanceToolPayload,
  fetchAssistantEscalationProvenance,
} from "../../context/fetchAssistantEscalationProvenance.ts";
import { getOfferProjectRemote } from "../../../../../src/lib/offerProjectsRemote.ts";
import {
  listOfferPuckBlockTypesForAssistant,
  MAX_OFFER_PUCK_ASSISTANT_SUMMARY_DETAILED_CHARS,
  summarizeOfferPuckDataForAssistant,
} from "../../../../../src/lib/offerPuckAssistantSummary.ts";
import { fetchInvoiceSetupRemote } from "../../../../../src/lib/invoiceSetupRemote.ts";
import { mapInvoiceTemplateToAssistantRead, MAX_INVOICE_FOOTER_TOOL_CHARS } from "../../../../../src/lib/invoiceAssistantSummary.ts";
import { fetchAssistantMemoryHeaders } from "../../memory/fetchAssistantMemoryHeaders.ts";
import { selectAssistantMemoryIdsDeterministic } from "../../memory/selectAssistantMemoryIdsDeterministic.ts";
import { fetchSelectedMemoriesFull } from "../../memory/fetchSelectedMemoriesFull.ts";
import { filterMemoryHeadersForThreadAudienceTier } from "../../memory/memoryAudienceTierPolicy.ts";
import { fetchActivePlaybookRulesForDecisionContext } from "../../context/fetchActivePlaybookRulesForDecisionContext.ts";
import { fetchAuthorizedCaseExceptionsForDecisionContext } from "../../context/fetchAuthorizedCaseExceptionsForDecisionContext.ts";
import { deriveEffectivePlaybook } from "../../policy/deriveEffectivePlaybook.ts";
import {
  OPERATOR_PLAYBOOK_LOOKUP_MAX_ROWS,
  selectEffectivePlaybookRulesForOperatorLookup,
} from "./operatorAssistantPlaybookRulesLookup.ts";
import {
  fetchOperatorKnowledgeLookupRows,
  OPERATOR_KNOWLEDGE_LOOKUP_MAX_ROWS,
} from "./operatorAssistantKnowledgeLookup.ts";

export const MAX_LOOKUP_TOOL_QUERY_CHARS = 200;

/**
 * Minimum trimmed query length for **keyword / ilike-style** read-only lookups (thread envelope list,
 * playbook keyword match, memory keyword ranker). Keep in sync with tool schema `query` descriptions.
 */
export const MIN_OPERATOR_LOOKUP_QUERY_CHARS_KEYWORD = 3;

/**
 * Minimum trimmed query length for **phrase / semantic-style** lookups: CRM name resolver
 * (`shouldRunOperatorQueryEntityResolution`), tenant corpus search, and pgvector knowledge.
 * Project resolver minimum must stay aligned with `MIN_QUERY_LEN` in `resolveOperatorQueryEntitiesFromIndex.ts`.
 */
export const MIN_OPERATOR_LOOKUP_QUERY_CHARS_SEMANTIC = 4;

export const MAX_LOOKUP_TOOL_CALLS_PER_TURN = 3;
/** S4 — investigation mode allows more read-only lookups in one assistant turn (still bounded). */
export const MAX_LOOKUP_TOOL_CALLS_INVESTIGATION_MODE = 5;
/** S6 — bulk queue triage mode: slightly higher cap to drill into a few threads while staying bounded. */
export const MAX_LOOKUP_TOOL_CALLS_BULK_TRIAGE_MODE = 4;

export function maxOperatorLookupToolCallsPerTurn(ctx: AssistantContext): number {
  if (ctx.investigationSpecialistFocus) return MAX_LOOKUP_TOOL_CALLS_INVESTIGATION_MODE;
  if (ctx.bulkTriageSpecialistFocus) return MAX_LOOKUP_TOOL_CALLS_BULK_TRIAGE_MODE;
  return MAX_LOOKUP_TOOL_CALLS_PER_TURN;
}

/** Static contract JSON for {@link AssistantContext.bulkTriageSpecialistFocus} (S6). */
export function bulkTriageSpecialistToolPayload(): Record<string, unknown> {
  const readOnlyLookupToolNames = OPERATOR_READ_ONLY_LOOKUP_TOOLS.map((t) => t.function.name);
  return {
    didRun: true,
    mode: "bulk_triage_queue_v1",
    groundedInContext: [
      "**Operator queue / Today** block: counts, samples, topActions — same bounded snapshot as the dashboard feed (not a hidden priority engine).",
      "**Queue highlights** when present — deterministic from that snapshot (F5), not ML scoring.",
    ],
    triageBehavior: {
      groupAndPrioritize: "Use only evidence in Context; say when counts are zero or samples are truncated.",
      perItem: "Recommend explicit next steps per row without claiming unseen message bodies.",
      proposals: "At most **one** proposedAction this turn — operator confirms individually; no silent multi-row writes.",
    },
    readOnlyLookupToolNames,
    maxLookupToolCallsThisTurn: MAX_LOOKUP_TOOL_CALLS_BULK_TRIAGE_MODE,
    defaultMaxLookupToolCalls: MAX_LOOKUP_TOOL_CALLS_PER_TURN,
    notInScope: [
      "Autonomous queue draining",
      "Batch RPCs or multi-row updates",
      "Invented urgency ranks beyond the snapshot",
    ],
  };
}

/** Static contract JSON for {@link AssistantContext.investigationSpecialistFocus} (S4). */
export function investigationSpecialistToolPayload(): Record<string, unknown> {
  const readOnlyLookupToolNames = OPERATOR_READ_ONLY_LOOKUP_TOOLS.map((t) => t.function.name);
  return {
    didRun: true,
    mode: "deep_search_investigation_v1",
    readOnlyLookupToolNames,
    maxLookupToolCallsThisTurn: MAX_LOOKUP_TOOL_CALLS_INVESTIGATION_MODE,
    defaultMaxLookupToolCalls: MAX_LOOKUP_TOOL_CALLS_PER_TURN,
    evidenceDiscipline:
      "Cite only Context blocks and read-only tool JSON from this turn. Label **facts** (quoted fields) vs **inference**. If something was not retrieved, say so — do not invent CRM rows, email bodies, counts, or escalations.",
    notInScope:
      "Not bulk triage, not web search, not hidden confidence — only tenant-scoped tools listed in readOnlyLookupToolNames.",
  };
}
/** Max characters of `storyNotes` in tool JSON (row may be longer; slice contract: ~400 char excerpt). */
export const MAX_PROJECT_DETAIL_STORY_NOTES_CHARS = 400;
/** Bounded memory tool: max rows returned (subset of assistant first-pass caps). */
export const OPERATOR_MEMORY_LOOKUP_TOOL_MAX_ROWS = 8;
/** Bounded memory tool: max chars per title/summary/body excerpt in JSON. */
export const OPERATOR_MEMORY_LOOKUP_TOOL_EXCERPT_CHARS = 480;
/** Bounded playbook tool: max instruction chars per rule in JSON. */
export const OPERATOR_PLAYBOOK_LOOKUP_INSTRUCTION_CHARS = 600;
/** Bounded knowledge tool: max chars per row `content` in JSON. */
export const OPERATOR_KNOWLEDGE_LOOKUP_CONTENT_CHARS = 720;

export type OperatorLookupProjectDetailsPayload = {
  projectId: string;
  projectType: string;
  stage: string;
  displayTitle: string;
  weddingDate: string | null;
  location: string;
  eventStartDate: string | null;
  eventEndDate: string | null;
  packageName: string | null;
  packageInclusions: string[];
  contractValue: number | null;
  balanceDue: number | null;
  storyNotes: string | null;
  people: AssistantFocusedProjectFacts["people"];
  contactPoints: AssistantFocusedProjectFacts["contactPoints"];
  openTaskCount: number;
  openEscalationCount: number;
  pendingApprovalDraftCount: number;
  note: string;
};

function clipStory(notes: string | null, max: number): string | null {
  if (notes == null || notes === "") return null;
  return notes.length <= max ? notes : notes.slice(0, max);
}

/** Maps CRM facts to the operator project-details tool contract (all project_type values; not wedding-only). */
function clipMemoryToolText(s: string | null | undefined, max: number): string {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function clipPlaybookInstructionForTool(s: string | null | undefined, max: number): string {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Effective project/person focus for memory fetch (widget focus + carry-forward when present). */
export function effectiveOperatorMemoryFocus(ctx: AssistantContext): {
  weddingId: string | null;
  personId: string | null;
  focusedProjectType: string | null;
} {
  const wf = ctx.focusedWeddingId != null && String(ctx.focusedWeddingId).trim() !== "" ? String(ctx.focusedWeddingId).trim() : null;
  const pf = ctx.focusedPersonId != null && String(ctx.focusedPersonId).trim() !== "" ? String(ctx.focusedPersonId).trim() : null;
  const cf = ctx.carryForward;
  const weddingId =
    wf ??
    (cf?.lastFocusedProjectId != null && String(cf.lastFocusedProjectId).trim() !== ""
      ? String(cf.lastFocusedProjectId).trim()
      : null);
  const personId =
    pf ??
    (cf?.lastMentionedPersonId != null && String(cf.lastMentionedPersonId).trim() !== ""
      ? String(cf.lastMentionedPersonId).trim()
      : null);
  const focusedProjectType = ctx.focusedProjectSummary?.projectType ?? cf?.lastFocusedProjectType ?? null;
  return { weddingId, personId, focusedProjectType };
}

export function projectDetailsPayloadFromFocusedFacts(
  f: AssistantFocusedProjectFacts,
): OperatorLookupProjectDetailsPayload {
  return {
    projectId: f.weddingId,
    projectType: f.project_type,
    stage: f.stage,
    displayTitle: f.couple_names,
    weddingDate: f.wedding_date,
    location: f.location,
    eventStartDate: f.event_start_date,
    eventEndDate: f.event_end_date,
    packageName: f.package_name,
    packageInclusions: f.package_inclusions,
    contractValue: f.contract_value,
    balanceDue: f.balance_due,
    storyNotes: clipStory(f.story_notes, MAX_PROJECT_DETAIL_STORY_NOTES_CHARS),
    people: f.people,
    contactPoints: f.contactPoints,
    openTaskCount: f.counts.openTasks,
    openEscalationCount: f.counts.openEscalations,
    pendingApprovalDraftCount: f.counts.pendingApprovalDrafts,
    note:
      "Tenant-scoped `weddings` row + related people, contacts, and counts (read-only). Applies to wedding, commercial, video, and other `project_type` values — use `projectType` and `displayTitle` as-is, not wedding-default wording.",
  };
}

/** OpenAI Chat Completions `tools` schema (read-only lookups). */
export const OPERATOR_READ_ONLY_LOOKUP_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_projects",
      description:
        "Resolver only: match operator text (names, couple, place, project fragment) to a bounded list of project candidates in this tenant’s recent CRM index. Use when the operator names or describes a project and you need to disambiguate. Does **not** return deep CRM (venue, money, people, story, counts); does **not** accept a **project UUID** — pass a natural-language **query** only. If you already have **weddings.id**, call `operator_lookup_project_details` with `{ projectId }` instead. **Query minimum:** trimmed **4+ characters** and at least one letter — shorter or non-name fragments return `query_too_short`.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Name fragment, couple, or place to match (**min 4 characters** after trim; **max 200**). Must include at least one letter (digits-only fragments are rejected).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_project_details",
      description:
        "Detail fetcher only: load full read-only project facts for one CRM project **by UUID** (`weddings.id`). **Input is only `{ projectId: string }` — a single canonical UUID string.** Do **not** pass names, locations, or natural language; do **not** use this to search or resolve. If you only have a name or vague reference, call `operator_lookup_projects` first, then use the chosen `weddingId` here. Returns stage, `projectType`, display title, dates, money fields, story notes (bounded excerpt), people, contact points, and open-task / escalation / pending-draft counts in one call.",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "string",
            description:
              "Required. The `weddings.id` UUID for this tenant (e.g. from focused context, resolver output, or UI). No other property is allowed.",
          },
        },
        required: ["projectId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_corpus",
      description:
        "Phase-1 **tenant-wide indexed search** (read-only): threads/inbox view (title, sender, latest snippet; optional bounded `messages.body` probe), CRM `weddings` text fields, `memories` title/summary, offer-builder **names**, in-memory **playbook** + **case exception notes**, invoice template fields from Context. Returns **lightweight hits with ids** — not full bodies or Puck JSON. Use when the **Corpus search** block is missing, empty, or the operator asks a **find / search / anything about** question across the studio. Follow with **operator_lookup_project_details**, **operator_lookup_thread_messages**, or **operator_lookup_offer_builder** on **top hits** for phase-2 detail. **Query minimum:** trimmed **4+ characters** — shorter queries return `query_too_short` (use a longer substantive token).",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural-language search query (**min 4 characters** after trim; **max 200**).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_threads",
      description:
        "**Resolver (Slice 4):** Bounded list of thread **envelope** rows only — title, channel, kind, last activity / inbound / outbound timestamps, **thread id** — **no** `messages.body`. Input is **only** `{ query: string }` (natural language — names, topic, sender cues); **never** pass a thread UUID here. Use when the operator needs **which thread** or **recent contact metadata** and Context is missing, thin, or not targeted enough (*did we email X*, *messages from*, *last contact*, *did they reply* as **list/timing** questions). For **what the email says** / **what they want** at **body** level, follow with **operator_lookup_thread_messages** (`threadId` from this result, **Carry-forward**, Corpus, or queue). For **full-tenant indexed hits**, prefer **operator_lookup_corpus** or the **Corpus search** block. **Deep search** widens the scored inbox window; this tool can add another pass. **Query minimum:** trimmed **3+ characters** — shorter queries return `query_too_short`.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Sub-query for entity resolution + thread selection (e.g. couple name, inquiry topic). **Min 3 characters** after trim; **max 200**.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_thread_messages",
      description:
        "**Detail (Slice 4):** Load **bounded** `messages.body` excerpts for **one** thread. Input is **only** `{ threadId: string }` — the **threads.id** UUID; **never** natural language. Returns up to **8** recent messages (chronological), each body **≤900** chars — tenant-scoped, not full history. **Primary path** for *what did they say*, *what do they want*, *what is this email about* — first-pass Context **usually has no** message excerpts (domain-first). **threadId** must come from **operator_lookup_threads**, **Carry-forward** `lastThreadId`, **Corpus** / **queue** samples, or a pasted id — **never** guess.",
      parameters: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "Required. The threads.id UUID (this tenant).",
          },
        },
        required: ["threadId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_inquiry_counts",
      description:
        "Return UTC-window counts of new inquiry arrivals (today, yesterday, this week, last week) for this tenant — same snapshot semantics as first-pass when the inquiry-analytics question matched. Use only when the operator asks for lead/inquiry counts and those numbers are not already in Context.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_draft",
      description:
        "Read-only **draft inspection** for one `drafts.id` UUID. Returns **grounded** row fields: **status**, **decision_mode**, **source_action_key**, **created_at**, thread **title** / **wedding_id** / **kind**, a **body** text preview, and **instruction_history** (JSON, may be truncated) — the stored orchestrator / persona trace when present. **Does not** explain hidden model reasoning. Use when the operator asks *why* a draft exists, *what* triggered it, or *what* it is based on and you have a **draft id** (from **Operator queue** / Today draft samples, Context, or pasted).",
      parameters: {
        type: "object",
        properties: {
          draftId: {
            type: "string",
            description: "Required. The `drafts.id` UUID (this tenant).",
          },
        },
        required: ["draftId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_thread_queue",
      description:
        "Read-only **queue / Review explanation** for **one** thread (**threads.id** UUID). Returns grounded **threads** flags (needs_human, automation_mode, v3_operator_automation_hold, etc.), **derivedInboxBucket** (same metadata rules as Today), **openEscalation_requests** rows, **pending_approval drafts** on this thread, optional **v3_thread_workflow_state.workflow** JSON (bounded), and **zenTabHints** aligned with Zen / Today tab mapping. Use when the operator asks *why this is in review*, *what is blocking this thread*, *why it is waiting for me*, or *why it landed in operator review* and you have a **thread id** (from Recent thread activity, **operator_lookup_threads**, Today samples, or pasted).",
      parameters: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "Required. The threads.id UUID (this tenant).",
          },
        },
        required: ["threadId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_escalation",
      description:
        "Read-only **escalation inspection** for one **escalation_requests.id** UUID. Returns **grounded** row fields: **status**, **action_key**, **reason_code**, **question_body** (the recorded blocker/decision text, may be clipped), **decision_justification** JSON (may be truncated), **operator_delivery**, **learning_outcome**, resolution fields when present, **thread** / **wedding** envelope snippets, and optional **playbook_rules** row (topic, **action_key**, **decision_mode**, instruction preview) when **playbook_rule_id** is set. **Does not** reveal hidden model reasoning. Use when the operator asks **why** something **escalated**, **what** this escalation is **asking**, or **what** **triggered** it and you have an **escalation id** (from **Operator queue** / Today escalation **samples**, **operator_lookup_thread_queue** open escalations, Context, or pasted).",
      parameters: {
        type: "object",
        properties: {
          escalationId: {
            type: "string",
            description: "Required. The escalation_requests.id UUID (this tenant).",
          },
        },
        required: ["escalationId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_offer_builder",
      description:
        "Read-only **offer-builder project** (investment guide / Puck document) for **one** row in `studio_offer_builder_projects` by **UUID** (`id`). **Not** CRM wedding packages — use `operator_lookup_project_details` for wedding **project** economics. Returns **displayName**, **updatedAt**, a **longer compactSummary** outline (package tiers, cover title, block types), and **blockTypes** — all from stored `puck_data`. Use when the operator asks what is *in* a named offer / premium package / destination offer and the **Offer projects (grounded)** list in Context is not enough; **offerProjectId** must match a row from that list (or a pasted id).",
      parameters: {
        type: "object",
        properties: {
          offerProjectId: {
            type: "string",
            description: "Required. The `studio_offer_builder_projects.id` UUID (this tenant).",
          },
        },
        required: ["offerProjectId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_playbook_rules",
      description:
        "**Playbook / policy domain only (read-only):** bounded **effective** `playbook_rules` rows (after **authorized case exception** merge for the **focused project** when set, else **carry-forward** `lastFocusedProjectId` when present — same scope idea as **operator_lookup_memories**). Keyword match on **action_key**, **topic**, and **instruction**. Use when the operator asks **what policy says**, **do we have a rule about…**, **which rule covers…**, or **automation behavior for…** and the **Playbook** block in Context is **missing**, **too thin**, or **does not** list the relevant **action_key**. **Not** a semantic search of threads or CRM — use project/thread tools for those. **Playbook** remains **authoritative** over **memory** and **knowledge**; this tool only surfaces **policy text**. Honor **project type discipline** when paraphrasing (wedding vs commercial / video / other). **Query minimum:** trimmed **3+ characters**.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Keywords to match rule text (**min 3 characters** after trim; **max 200**).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_memories",
      description:
        "**Memory domain only (read-only):** bounded `memories` rows for this tenant — keyword overlap on title/summary (same deterministic ranker as first-pass Context). Returns **excerpts**, not the whole memory corpus. Use when the operator asks what the studio **saved**, **noted**, **remembered in durable memory**, or **stored as a memory** and the **Durable memory** block in Context is **empty**, **too thin**, or **obviously not** a full search. **Playbook** stays authoritative for automation — memory is **supporting**. Prefer **operator_lookup_corpus** for **tenant-wide light hits** across threads/CRM/memories; use **this** tool when you need **richer memory text** than corpus memory hits. Optional **scope** = `studio` | `project` | `person` narrows rows; **project** requires focused or carry-forward **project id**; **person** requires focused or carry-forward **person id**. **Does not** search email bodies or deep CRM — use thread/project tools. **Query minimum:** trimmed **3+ characters**.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Keywords to rank memories (**min 3 characters** after trim; **max 200**).",
          },
          scope: {
            type: "string",
            enum: ["studio", "project", "person"],
            description: "Optional. Omit to search all in-scope scopes for current focus (studio always; project/person when ids available).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_knowledge",
      description:
        "**Knowledge / reference domain only (read-only):** bounded **semantic** search over tenant `knowledge_base` via pgvector (`match_knowledge`) — **brand_voice**, **past_email**, **contract**, etc. **Supporting background only**; **not** automation policy (**Playbook** is authoritative) and **not** durable **memories** (use **operator_lookup_memories** for saved operator notes). Use when the operator asks **what the KB says**, **our brand voice**, **contract language**, **reference doc**, or **studio reference** material and the **Global knowledge** block in Context is **missing**, **too thin**, or **clearly not** a full search. **Does not** scan threads, CRM bodies, or playbook rules — use **operator_lookup_corpus**, **operator_lookup_thread_messages**, or **operator_lookup_playbook_rules** for those. Honor **project type discipline** when applying generic KB text to a **specific** **projectType**. **Query minimum:** trimmed **4+ characters** (semantic embedding gate).",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural-language query for semantic KB match (**min 4 characters** after trim; **max 200**).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "operator_lookup_invoice_setup",
      description:
        "Read-only **invoice PDF template** for this tenant (`studio_invoice_setup` — **one** row): **legalName**, **invoicePrefix**, **paymentTerms**, **accentColor**, **footerNote** (longer cap than Context when clipped), **updatedAt**, and **logo** summary (**hasLogo**, MIME, data-URL length) — **never** raw image data. **Not** CRM project invoice amounts or line items — use **operator_lookup_project_details** for booking money. Use when the operator needs a **longer** footer or the same fields repeated for trust; normally **Invoice setup (grounded)** in Context is enough. Pass an **empty** JSON object **{}**.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

/** Gemini `tools[0].functionDeclarations` — same names/schemas as OpenAI `OPERATOR_READ_ONLY_LOOKUP_TOOLS`. */
export function operatorReadOnlyLookupToolGeminiFunctionDeclarations(): Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}> {
  return OPERATOR_READ_ONLY_LOOKUP_TOOLS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters as Record<string, unknown>,
  }));
}

function normalizeToolQuery(raw: unknown): string {
  const s = String(raw ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();
  return s.length > MAX_LOOKUP_TOOL_QUERY_CHARS ? s.slice(0, MAX_LOOKUP_TOOL_QUERY_CHARS) : s;
}

function safeParseArgs(argsJson: string): Record<string, unknown> {
  try {
    const v = JSON.parse(argsJson) as unknown;
    return v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function slimProjectLookupPayload(res: ReturnType<typeof resolveOperatorQueryEntitiesFromIndex>) {
  return {
    weddingSignal: res.weddingSignal,
    uniqueWeddingId: res.uniqueWeddingId,
    weddingCandidates: res.weddingCandidates.map((c) => ({
      weddingId: c.weddingId,
      couple_names: c.couple_names,
      stage: c.stage,
      wedding_date: c.wedding_date,
      location: c.location,
      project_type: c.project_type,
    })),
    personMatches: res.personMatches,
    note:
      "Tenant-bounded index only; not an all-time CRM search. **Slice 5:** every `weddingCandidates` row includes **project_type** — use it for vocabulary; do not treat rows as wedding by default.",
  };
}

function slimThreadLookupPayload(
  lookup: Awaited<ReturnType<typeof fetchAssistantThreadMessageLookup>>,
) {
  return {
    didRun: lookup.didRun,
    selectionNote: lookup.selectionNote,
    threads: lookup.threads,
    note: "No message bodies in this tool; use operator_lookup_thread_messages with a threadId for bounded body excerpts.",
  };
}

function slimCorpusSearchPayload(snap: Awaited<ReturnType<typeof fetchAssistantOperatorCorpusSearch>>) {
  return {
    didRun: snap.didRun,
    scopeNote: snap.scopeNote,
    tokensQueried: snap.tokensQueried,
    deepMode: snap.deepMode,
    messageBodyProbeRan: snap.messageBodyProbeRan,
    threadHits: snap.threadHits.slice(0, 16),
    projectHits: snap.projectHits.slice(0, 16),
    playbookHits: snap.playbookHits.slice(0, 12),
    caseExceptionHits: snap.caseExceptionHits.slice(0, 8),
    memoryHits: snap.memoryHits.slice(0, 10),
    offerProjectHits: snap.offerProjectHits.slice(0, 8),
    invoiceTemplateMentioned: snap.invoiceTemplateMentioned,
    truncated: {
      threads: snap.threadHits.length > 16,
      projects: snap.projectHits.length > 16,
      playbook: snap.playbookHits.length > 12,
      caseExceptions: snap.caseExceptionHits.length > 8,
      memories: snap.memoryHits.length > 10,
      offers: snap.offerProjectHits.length > 8,
    },
    note: "Phase-1 hits only; expand top ids with operator_lookup_project_details / operator_lookup_thread_messages / operator_lookup_offer_builder.",
  };
}

function slimInquiryPayload(s: Awaited<ReturnType<typeof fetchAssistantInquiryCountSnapshot>>) {
  return {
    didRun: s.didRun,
    computedAt: s.computedAt,
    truncated: s.truncated,
    timezoneNote: s.timezoneNote,
    semanticsNote: s.semanticsNote,
    windows: s.windows,
    comparison: s.comparison,
    rowCountLoaded: s.rowCountLoaded,
  };
}

/**
 * Runs one tool call; returns a short JSON string for the model (UTF-8 text).
 */
export async function executeOperatorReadOnlyLookupTool(
  supabase: SupabaseClient,
  photographerId: string,
  ctx: AssistantContext,
  name: string,
  argsJson: string,
): Promise<string> {
  const args = safeParseArgs(argsJson);

  if (name === "operator_lookup_inquiry_counts") {
    const snap = await fetchAssistantInquiryCountSnapshot(supabase, photographerId, {});
    return JSON.stringify({ tool: name, result: slimInquiryPayload(snap) });
  }

  if (name === "operator_lookup_corpus") {
    const query = normalizeToolQuery(args.query);
    if (query.length < MIN_OPERATOR_LOOKUP_QUERY_CHARS_SEMANTIC) {
      return JSON.stringify({
        tool: name,
        error: "query_too_short",
        minChars: MIN_OPERATOR_LOOKUP_QUERY_CHARS_SEMANTIC,
        note: "Provide at least 4 characters for corpus search.",
      });
    }
    const snap = await fetchAssistantOperatorCorpusSearch(supabase, photographerId, {
      queryText: query,
      playbookRules: ctx.playbookRules,
      authorizedCaseExceptions: ctx.authorizedCaseExceptions,
      studioInvoiceSetup: ctx.studioInvoiceSetup,
      deepCorpusSearch: ctx.investigationSpecialistFocus != null,
    });
    return JSON.stringify({ tool: name, query, result: slimCorpusSearchPayload(snap) });
  }

  if (name === "operator_lookup_projects") {
    const query = normalizeToolQuery(args.query);
    if (isValidAssistantProjectIdUuid(query)) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "uuid_not_allowed",
        note: "`operator_lookup_projects` is for natural-language resolution only. Use `operator_lookup_project_details` with `{ projectId }` when you already have a `weddings.id` UUID.",
      });
    }
    if (!shouldRunOperatorQueryEntityResolution(query)) {
      return JSON.stringify({
        tool: name,
        error: "query_too_short",
        minChars: MIN_OPERATOR_LOOKUP_QUERY_CHARS_SEMANTIC,
        note: "Provide at least 4 characters including a letter (name or place fragment).",
      });
    }
    const index = await fetchAssistantQueryEntityIndex(supabase, photographerId);
    const res = resolveOperatorQueryEntitiesFromIndex(query, index.weddings, index.people);
    return JSON.stringify({ tool: name, query, result: slimProjectLookupPayload(res) });
  }

  if (name === "operator_lookup_project_details") {
    const extraKeys = Object.keys(args).filter(
      (k) => k !== "projectId" && args[k] !== undefined && args[k] !== null,
    );
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: ["projectId"],
        disallowed: extraKeys,
        note: "This tool accepts only `projectId` (UUID). Use `operator_lookup_projects` to resolve names.",
      });
    }
    const read = await readAssistantProjectDetailById(supabase, photographerId, args.projectId);
    if (!read.ok) {
      if (read.code === "invalid_project_id") {
        return JSON.stringify({
          tool: name,
          error: "validation_error",
          code: read.code,
          message: read.message ?? "Invalid projectId.",
        });
      }
      if (read.code === "not_found") {
        return JSON.stringify({
          tool: name,
          error: "not_found",
          code: "not_found",
          message: "No project with this id in this studio, or id is not visible to this tenant.",
        });
      }
      return JSON.stringify({
        tool: name,
        error: "database_error",
        code: read.code,
        message: read.message ?? "Lookup failed.",
      });
    }
    return JSON.stringify({
      tool: name,
      result: projectDetailsPayloadFromFocusedFacts(read.facts),
    });
  }

  if (name === "operator_lookup_threads") {
    const query = normalizeToolQuery(args.query);
    if (query.length < MIN_OPERATOR_LOOKUP_QUERY_CHARS_KEYWORD) {
      return JSON.stringify({
        tool: name,
        error: "query_too_short",
        minChars: MIN_OPERATOR_LOOKUP_QUERY_CHARS_KEYWORD,
        note: "Provide at least 3 characters for thread lookup.",
      });
    }
    const index = await fetchAssistantQueryEntityIndex(supabase, photographerId);
    const resCore = resolveOperatorQueryEntitiesFromIndex(query, index.weddings, index.people);
    const operatorQueryEntityResolution = {
      didRun: true,
      weddingSignal: resCore.weddingSignal,
      uniqueWeddingId: resCore.uniqueWeddingId,
      weddingCandidates: resCore.weddingCandidates,
      personMatches: resCore.personMatches,
      queryResolvedProjectSummary: null as null,
    };
    const lookup = await fetchAssistantThreadMessageLookup(supabase, photographerId, {
      queryText: query,
      weddingIdEffective: ctx.focusedWeddingId,
      personIdEffective: ctx.focusedPersonId,
      operatorQueryEntityResolution,
      force: true,
    });
    return JSON.stringify({ tool: name, query, result: slimThreadLookupPayload(lookup) });
  }

  if (name === "operator_lookup_thread_messages") {
    const extraKeys = Object.keys(args).filter(
      (k) => k !== "threadId" && args[k] !== undefined && args[k] !== null,
    );
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: ["threadId"],
        disallowed: extraKeys,
      });
    }
    const snap = await fetchAssistantThreadMessageBodies(supabase, photographerId, args.threadId);
    return JSON.stringify({
      tool: name,
      result: {
        didRun: snap.didRun,
        selectionNote: snap.selectionNote,
        threadId: snap.threadId,
        threadTitle: snap.threadTitle,
        messageCount: snap.messages.length,
        truncatedOverall: snap.truncatedOverall,
        semanticsNote:
          "Read-only tenant messages for one thread; newest-first fetch reversed to chronological; not full history beyond the cap.",
        messages: snap.messages,
      },
    });
  }

  if (name === "operator_lookup_draft") {
    const extraKeys = Object.keys(args).filter(
      (k) => k !== "draftId" && args[k] !== undefined && args[k] !== null,
    );
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: ["draftId"],
        disallowed: extraKeys,
      });
    }
    const snap = await fetchAssistantDraftProvenance(supabase, photographerId, args.draftId);
    return JSON.stringify({ tool: name, result: draftProvenanceToolPayload(snap) });
  }

  if (name === "operator_lookup_thread_queue") {
    const extraKeys = Object.keys(args).filter(
      (k) => k !== "threadId" && args[k] !== undefined && args[k] !== null,
    );
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: ["threadId"],
        disallowed: extraKeys,
      });
    }
    const snap = await fetchAssistantThreadQueueExplanation(supabase, photographerId, args.threadId);
    return JSON.stringify({ tool: name, result: threadQueueExplanationToolPayload(snap) });
  }

  if (name === "operator_lookup_escalation") {
    const extraKeys = Object.keys(args).filter(
      (k) => k !== "escalationId" && args[k] !== undefined && args[k] !== null,
    );
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: ["escalationId"],
        disallowed: extraKeys,
      });
    }
    const snap = await fetchAssistantEscalationProvenance(supabase, photographerId, args.escalationId);
    return JSON.stringify({ tool: name, result: escalationProvenanceToolPayload(snap) });
  }

  if (name === "operator_lookup_offer_builder") {
    const extraKeys = Object.keys(args).filter(
      (k) => k !== "offerProjectId" && args[k] !== undefined && args[k] !== null,
    );
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: ["offerProjectId"],
        disallowed: extraKeys,
      });
    }
    const id = typeof args.offerProjectId === "string" ? args.offerProjectId.trim() : "";
    if (!id) {
      return JSON.stringify({ tool: name, error: "validation_error", code: "missing_offer_project_id" });
    }
    const rec = await getOfferProjectRemote(supabase, photographerId, id);
    if (!rec) {
      return JSON.stringify({
        tool: name,
        error: "not_found",
        message: "No offer-builder project with this id for this tenant.",
      });
    }
    return JSON.stringify({
      tool: name,
      result: {
        offerProjectId: rec.id,
        displayName: rec.name,
        updatedAt: rec.updatedAt,
        blockTypes: listOfferPuckBlockTypesForAssistant(rec.data as unknown),
        detailedSummary: summarizeOfferPuckDataForAssistant(rec.data as unknown, MAX_OFFER_PUCK_ASSISTANT_SUMMARY_DETAILED_CHARS),
        note:
          "Factual: derived from stored Puck JSON only. Not a client-facing PDF; headings/package lines may be edited in Offer builder (Workspace).",
      },
    });
  }

  if (name === "operator_lookup_playbook_rules") {
    const query = normalizeToolQuery(args.query);
    if (query.length < MIN_OPERATOR_LOOKUP_QUERY_CHARS_KEYWORD) {
      return JSON.stringify({
        tool: name,
        error: "query_too_short",
        minChars: MIN_OPERATOR_LOOKUP_QUERY_CHARS_KEYWORD,
        note: "Provide at least 3 characters to match playbook rules.",
      });
    }
    const rawRules = await fetchActivePlaybookRulesForDecisionContext(supabase, photographerId);
    const { weddingId: caseExceptionScopeWeddingId } = effectiveOperatorMemoryFocus(ctx);
    const exceptions = await fetchAuthorizedCaseExceptionsForDecisionContext(
      supabase,
      photographerId,
      caseExceptionScopeWeddingId,
      null,
    );
    const effective = deriveEffectivePlaybook(rawRules, exceptions);
    const picked = selectEffectivePlaybookRulesForOperatorLookup(effective, query);
    const rules = picked.map((r) => ({
      id: r.id,
      action_key: r.action_key,
      topic: r.topic,
      decision_mode: r.decision_mode,
      scope: r.scope,
      channel: r.channel,
      instruction: clipPlaybookInstructionForTool(r.instruction, OPERATOR_PLAYBOOK_LOOKUP_INSTRUCTION_CHARS),
      effectiveDecisionSource: r.effectiveDecisionSource,
      appliedAuthorizedExceptionId: r.appliedAuthorizedExceptionId,
    }));
    return JSON.stringify({
      tool: name,
      query,
      result: {
        didRun: true,
        rowCount: rules.length,
        totalEffectiveRules: effective.length,
        maxRows: OPERATOR_PLAYBOOK_LOOKUP_MAX_ROWS,
        caseExceptionScopeWeddingId,
        rules,
        semanticsNote:
          "Keyword-ranked subset only — **not** proof there is no other rule on the topic. Prompt lists at most 24 effective rules; this fetch may return fewer matches. **Do not** invent **action_key** or instruction strings. **Memory** / **knowledge** do **not** override these rows.",
      },
    });
  }

  if (name === "operator_lookup_memories") {
    const query = normalizeToolQuery(args.query);
    if (query.length < MIN_OPERATOR_LOOKUP_QUERY_CHARS_KEYWORD) {
      return JSON.stringify({
        tool: name,
        error: "query_too_short",
        minChars: MIN_OPERATOR_LOOKUP_QUERY_CHARS_KEYWORD,
        note: "Provide at least 3 characters to rank memories.",
      });
    }
    const scopeRaw = args.scope;
    let scopeFilter: "studio" | "project" | "person" | null = null;
    if (scopeRaw != null && String(scopeRaw).trim() !== "") {
      const s = String(scopeRaw).trim();
      if (s !== "studio" && s !== "project" && s !== "person") {
        return JSON.stringify({
          tool: name,
          error: "invalid_scope",
          note: "scope must be studio, project, or person when set.",
        });
      }
      scopeFilter = s as "studio" | "project" | "person";
    }
    const { weddingId, personId, focusedProjectType } = effectiveOperatorMemoryFocus(ctx);
    if (scopeFilter === "project" && !weddingId) {
      return JSON.stringify({
        tool: name,
        error: "missing_project_focus",
        note: "scope=project requires a focused or carry-forward project id — use operator_lookup_projects or widen scope.",
      });
    }
    if (scopeFilter === "person" && !personId) {
      return JSON.stringify({
        tool: name,
        error: "missing_person_focus",
        note: "scope=person requires a focused or carry-forward person id.",
      });
    }
    let headers = await fetchAssistantMemoryHeaders(supabase, photographerId, weddingId, personId);
    headers = filterMemoryHeadersForThreadAudienceTier(headers, "operator_only");
    if (scopeFilter) {
      headers = headers.filter((h) => h.scope === scopeFilter);
    }
    const memoryIds = selectAssistantMemoryIdsDeterministic({
      queryText: query,
      memoryHeaders: headers,
      focusedWeddingId: weddingId,
      focusedPersonId: personId,
      focusedProjectType,
    }).slice(0, OPERATOR_MEMORY_LOOKUP_TOOL_MAX_ROWS);
    const full =
      memoryIds.length > 0
        ? await fetchSelectedMemoriesFull(supabase, photographerId, memoryIds, {
            replyThreadAudienceTier: "operator_only",
          })
        : [];
    const idToScope = new Map(headers.map((h) => [h.id, h.scope]));
    const memories = full.map((row) => ({
      id: row.id,
      scope: idToScope.get(row.id) ?? "studio",
      type: row.type,
      title: clipMemoryToolText(row.title, 200),
      excerpt: clipMemoryToolText(`${row.summary}\n${row.full_content ?? ""}`, OPERATOR_MEMORY_LOOKUP_TOOL_EXCERPT_CHARS),
    }));
    return JSON.stringify({
      tool: name,
      query,
      scopeFilter,
      result: {
        didRun: true,
        rowCount: memories.length,
        maxRows: OPERATOR_MEMORY_LOOKUP_TOOL_MAX_ROWS,
        focus: { weddingId, personId, focusedProjectType },
        memories,
        semanticsNote:
          "Bounded keyword-ranked read — **not** exhaustive of all `memories` rows. Operator dashboard path uses **operator_only** audience visibility (all tiers). **project**-scope rows respect **projectType** anti-bleed when type is known. Empty list ⇒ no matching in-scope headers for this query — not “no memories exist”.",
      },
    });
  }

  if (name === "operator_lookup_knowledge") {
    const query = normalizeToolQuery(args.query);
    if (query.length < MIN_OPERATOR_LOOKUP_QUERY_CHARS_SEMANTIC) {
      return JSON.stringify({
        tool: name,
        error: "query_too_short",
        minChars: MIN_OPERATOR_LOOKUP_QUERY_CHARS_SEMANTIC,
        note: "Provide at least 4 characters for knowledge base semantic search.",
      });
    }
    const rawRows = await fetchOperatorKnowledgeLookupRows(supabase, photographerId, query);
    const rows = rawRows.map((r) => ({
      id: r.id,
      document_type: r.document_type,
      similarity: r.similarity,
      content: clipPlaybookInstructionForTool(r.content, OPERATOR_KNOWLEDGE_LOOKUP_CONTENT_CHARS),
    }));
    return JSON.stringify({
      tool: name,
      query,
      result: {
        didRun: true,
        rowCount: rows.length,
        maxRows: OPERATOR_KNOWLEDGE_LOOKUP_MAX_ROWS,
        rows,
        semanticsNote:
          "Semantic **knowledge_base** matches only — **not** the full KB, **not** automation policy (**Playbook** is authoritative). **Durable memory** is for saved notes; this tool is **reference** text. **Do not** invent excerpts; cite **content** from rows. Rows without embeddings never appear here.",
      },
    });
  }

  if (name === "operator_lookup_invoice_setup") {
    const extraKeys = Object.keys(args).filter((k) => args[k] !== undefined && args[k] !== null);
    if (extraKeys.length > 0) {
      return JSON.stringify({
        tool: name,
        error: "invalid_arguments",
        code: "extra_properties",
        onlyAllowed: [],
        disallowed: extraKeys,
        note: "This tool takes no properties; pass {}.",
      });
    }
    const row = await fetchInvoiceSetupRemote(supabase, photographerId);
    if (!row) {
      return JSON.stringify({
        tool: name,
        result: {
          hasRow: false,
          note: "No studio_invoice_setup row for this tenant.",
        },
      });
    }
    const mapped = mapInvoiceTemplateToAssistantRead(row.template, row.updatedAt, MAX_INVOICE_FOOTER_TOOL_CHARS);
    return JSON.stringify({ tool: name, result: mapped });
  }

  return JSON.stringify({ error: "unknown_tool", name });
}
