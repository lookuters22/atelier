import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  IDLE_ASSISTANT_OPERATOR_CORPUS_SEARCH,
  type AssistantOperatorCorpusSearchSnapshot,
  type AssistantStudioInvoiceSetupRead,
} from "../../../../src/types/assistantContext.types.ts";
import type { AuthorizedCaseExceptionRow, EffectivePlaybookRule } from "../../../../src/types/decisionContext.types.ts";
import {
  extractCorpusSearchTokens,
  shouldProbeMessageBodiesForCorpusSearch,
} from "../../../../src/lib/operatorCorpusSearchIntent.ts";
import { normalizeOperatorInboxMatchText } from "../../../../src/lib/operatorAssistantThreadMessageLookupIntent.ts";

const INBOX_VIEW_SELECT =
  "id, title, wedding_id, last_activity_at, kind, latest_sender, latest_body" as const;

type InboxViewRow = {
  id: string;
  title: string;
  wedding_id: string | null;
  last_activity_at: string;
  kind: string;
  latest_sender: string | null;
  latest_body: string | null;
};

type ThreadHydrate = {
  id: string;
  title: string;
  wedding_id: string | null;
  channel: string;
  kind: string;
  last_activity_at: string;
};

function sanitizeIlikeToken(s: string): string | null {
  const t = normalizeOperatorInboxMatchText(s).replace(/%/g, "").replace(/_/g, "").trim();
  if (t.length < 3 || t.length > 48) return null;
  return t;
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function fetchInboxHitsForTokens(
  supabase: SupabaseClient,
  photographerId: string,
  tokens: string[],
  perTokenLimit: number,
  maxTotal: number,
): Promise<
  Array<{
    row: InboxViewRow;
    matchedOn: "title" | "latest_sender" | "latest_body_snippet";
  }>
> {
  const seen = new Set<string>();
  const out: Array<{
    row: InboxViewRow;
    matchedOn: "title" | "latest_sender" | "latest_body_snippet";
  }> = [];

  for (const tok of tokens) {
    const san = sanitizeIlikeToken(tok);
    if (!san) continue;
    const pattern = `%${san}%`;
    for (const col of ["title", "latest_sender", "latest_body"] as const) {
      const { data, error } = await supabase
        .from("v_threads_inbox_latest_message")
        .select(INBOX_VIEW_SELECT)
        .eq("photographer_id", photographerId)
        .neq("kind", "other")
        .ilike(col, pattern)
        .order("last_activity_at", { ascending: false })
        .limit(perTokenLimit);
      if (error) {
        throw new Error(`fetchAssistantOperatorCorpusSearch inbox ${col}: ${error.message}`);
      }
      const matchedOn: "title" | "latest_sender" | "latest_body_snippet" =
        col === "latest_body" ? "latest_body_snippet" : col;
      for (const row of (data ?? []) as unknown as InboxViewRow[]) {
        if (!row?.id || seen.has(row.id)) continue;
        seen.add(row.id);
        out.push({ row, matchedOn });
        if (out.length >= maxTotal) return out;
      }
    }
  }
  return out;
}

async function hydrateThreadsMinimal(
  supabase: SupabaseClient,
  photographerId: string,
  ids: string[],
): Promise<Map<string, ThreadHydrate>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("threads")
    .select("id, title, wedding_id, channel, kind, last_activity_at")
    .eq("photographer_id", photographerId)
    .in("id", ids);
  if (error) {
    throw new Error(`fetchAssistantOperatorCorpusSearch threads hydrate: ${error.message}`);
  }
  const m = new Map<string, ThreadHydrate>();
  for (const r of (data ?? []) as unknown as ThreadHydrate[]) {
    m.set(r.id, r);
  }
  return m;
}

async function fetchProjectHits(
  supabase: SupabaseClient,
  photographerId: string,
  tokens: string[],
  perTokenLimit: number,
  maxTotal: number,
): Promise<AssistantOperatorCorpusSearchSnapshot["projectHits"]> {
  const seen = new Set<string>();
  const out: AssistantOperatorCorpusSearchSnapshot["projectHits"] = [];
  for (const tok of tokens) {
    const san = sanitizeIlikeToken(tok);
    if (!san) continue;
    const pattern = `%${san}%`;
    const { data, error } = await supabase
      .from("weddings")
      .select("id, couple_names, location, stage, project_type, wedding_date")
      .eq("photographer_id", photographerId)
      .or(
        `couple_names.ilike.${pattern},location.ilike.${pattern},package_name.ilike.${pattern},story_notes.ilike.${pattern}`,
      )
      .order("wedding_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .limit(perTokenLimit);
    if (error) {
      throw new Error(`fetchAssistantOperatorCorpusSearch weddings: ${error.message}`);
    }
    for (const r of data ?? []) {
      const row = r as Record<string, unknown>;
      const id = String(row.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        weddingId: id,
        coupleNames: String(row.couple_names ?? ""),
        location: String(row.location ?? ""),
        stage: String(row.stage ?? ""),
        projectType: String(row.project_type ?? ""),
        weddingDate: row.wedding_date != null ? String(row.wedding_date) : null,
        matchedOn: `ilike:${san}`,
      });
      if (out.length >= maxTotal) return out;
    }
  }
  return out;
}

async function fetchMemoryHits(
  supabase: SupabaseClient,
  photographerId: string,
  tokens: string[],
  perTokenLimit: number,
  maxTotal: number,
): Promise<AssistantOperatorCorpusSearchSnapshot["memoryHits"]> {
  const seen = new Set<string>();
  const out: AssistantOperatorCorpusSearchSnapshot["memoryHits"] = [];
  for (const tok of tokens) {
    const san = sanitizeIlikeToken(tok);
    if (!san) continue;
    const pattern = `%${san}%`;
    const { data, error } = await supabase
      .from("memories")
      .select("id, scope, title, summary")
      .eq("photographer_id", photographerId)
      .is("archived_at", null)
      .or(`title.ilike.${pattern},summary.ilike.${pattern}`)
      .order("id", { ascending: true })
      .limit(perTokenLimit);
    if (error) {
      throw new Error(`fetchAssistantOperatorCorpusSearch memories: ${error.message}`);
    }
    for (const r of data ?? []) {
      const row = r as Record<string, unknown>;
      const id = String(row.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        scope: String(row.scope ?? ""),
        title: String(row.title ?? ""),
        snippet: clip(String(row.summary ?? ""), 200),
      });
      if (out.length >= maxTotal) return out;
    }
  }
  return out;
}

async function fetchOfferNameHits(
  supabase: SupabaseClient,
  photographerId: string,
  tokens: string[],
  perTokenLimit: number,
  maxTotal: number,
): Promise<AssistantOperatorCorpusSearchSnapshot["offerProjectHits"]> {
  const seen = new Set<string>();
  const out: AssistantOperatorCorpusSearchSnapshot["offerProjectHits"] = [];
  for (const tok of tokens) {
    const san = sanitizeIlikeToken(tok);
    if (!san) continue;
    const pattern = `%${san}%`;
    const { data, error } = await supabase
      .from("studio_offer_builder_projects")
      .select("id, name, updated_at")
      .eq("photographer_id", photographerId)
      .ilike("name", pattern)
      .order("updated_at", { ascending: false })
      .limit(perTokenLimit);
    if (error) {
      throw new Error(`fetchAssistantOperatorCorpusSearch offer projects: ${error.message}`);
    }
    for (const r of data ?? []) {
      const row = r as Record<string, unknown>;
      const id = String(row.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        offerProjectId: id,
        name: String(row.name ?? ""),
        updatedAt: row.updated_at != null ? String(row.updated_at) : "",
      });
      if (out.length >= maxTotal) return out;
    }
  }
  return out;
}

function matchPlaybookInMemory(
  rules: EffectivePlaybookRule[],
  tokens: string[],
  maxHits: number,
): AssistantOperatorCorpusSearchSnapshot["playbookHits"] {
  const hits: AssistantOperatorCorpusSearchSnapshot["playbookHits"] = [];
  const toks = tokens.map((t) => normalizeOperatorInboxMatchText(t)).filter((t) => t.length >= 3);
  for (const r of rules) {
    const hay = normalizeOperatorInboxMatchText(
      `${r.topic ?? ""} ${r.instruction ?? ""} ${r.action_key ?? ""}`,
    );
    if (!toks.some((t) => hay.includes(t))) continue;
    hits.push({
      ruleId: String(r.id ?? ""),
      actionKey: String(r.action_key ?? ""),
      topic: r.topic != null ? String(r.topic) : null,
      decisionMode: String(r.decision_mode ?? ""),
      snippet: clip(String(r.instruction ?? ""), 220),
    });
    if (hits.length >= maxHits) break;
  }
  return hits;
}

function matchCaseExceptionsInMemory(
  rows: AuthorizedCaseExceptionRow[],
  tokens: string[],
  maxHits: number,
): AssistantOperatorCorpusSearchSnapshot["caseExceptionHits"] {
  const hits: AssistantOperatorCorpusSearchSnapshot["caseExceptionHits"] = [];
  const toks = tokens.map((t) => normalizeOperatorInboxMatchText(t)).filter((t) => t.length >= 3);
  for (const e of rows) {
    const hay = normalizeOperatorInboxMatchText(String(e.notes ?? ""));
    if (!toks.some((t) => hay.includes(t))) continue;
    hits.push({
      id: String(e.id ?? ""),
      weddingId: e.wedding_id != null ? String(e.wedding_id) : null,
      status: String(e.status ?? ""),
      snippet: clip(String(e.notes ?? ""), 240),
    });
    if (hits.length >= maxHits) break;
  }
  return hits;
}

function invoiceMentionedInMemory(
  inv: AssistantStudioInvoiceSetupRead,
  tokens: string[],
): boolean {
  if (!inv.hasRow) return false;
  const blob = normalizeOperatorInboxMatchText(
    `${inv.legalName} ${inv.paymentTerms} ${inv.footerNote} ${inv.invoicePrefix}`,
  );
  const toks = tokens.map((t) => normalizeOperatorInboxMatchText(t)).filter((t) => t.length >= 3);
  return toks.some((t) => blob.includes(t));
}

async function messageBodyProbeThreadIds(
  supabase: SupabaseClient,
  photographerId: string,
  longestToken: string,
  limit: number,
): Promise<string[]> {
  const san = sanitizeIlikeToken(longestToken);
  if (!san) return [];
  const pattern = `%${san}%`;
  const { data, error } = await supabase
    .from("messages")
    .select("thread_id")
    .eq("photographer_id", photographerId)
    .ilike("body", pattern)
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`fetchAssistantOperatorCorpusSearch messages probe: ${error.message}`);
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const r of data ?? []) {
    const id = String((r as { thread_id?: string }).thread_id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Phase-1 tenant corpus search: indexed SQL + in-memory policy/template matches.
 * Phase-2: operator_lookup_project_details, operator_lookup_thread_messages, etc.
 */
export async function fetchAssistantOperatorCorpusSearch(
  supabase: SupabaseClient,
  photographerId: string,
  input: {
    queryText: string;
    playbookRules: EffectivePlaybookRule[];
    authorizedCaseExceptions: AuthorizedCaseExceptionRow[];
    studioInvoiceSetup: AssistantStudioInvoiceSetupRead;
    deepCorpusSearch: boolean;
  },
): Promise<AssistantOperatorCorpusSearchSnapshot> {
  const tokens = extractCorpusSearchTokens(input.queryText, 4);
  if (tokens.length === 0) {
    return {
      ...IDLE_ASSISTANT_OPERATOR_CORPUS_SEARCH,
      didRun: true,
      scopeNote: "no substantive tokens after stopword filter",
      tokensQueried: [],
    };
  }

  const deep = input.deepCorpusSearch;
  const inboxPer = deep ? 22 : 14;
  const inboxMax = deep ? 72 : 36;
  const projPer = deep ? 18 : 12;
  const projMax = deep ? 48 : 24;
  const memPer = deep ? 14 : 10;
  const memMax = deep ? 20 : 12;
  const offerPer = deep ? 12 : 8;
  const offerMax = deep ? 14 : 10;
  const pbMax = deep ? 22 : 14;
  const exMax = deep ? 14 : 8;
  const probeLimit = deep ? 28 : 18;

  const messageBodyProbeRan =
    shouldProbeMessageBodiesForCorpusSearch(input.queryText) && tokens.length > 0;
  const probeIds = messageBodyProbeRan
    ? await messageBodyProbeThreadIds(supabase, photographerId, tokens[0]!, probeLimit)
    : [];

  const [inboxTagged, projectHits, memoryHits, offerProjectHits] = await Promise.all([
    fetchInboxHitsForTokens(supabase, photographerId, tokens, inboxPer, inboxMax),
    fetchProjectHits(supabase, photographerId, tokens, projPer, projMax),
    fetchMemoryHits(supabase, photographerId, tokens, memPer, memMax),
    fetchOfferNameHits(supabase, photographerId, tokens, offerPer, offerMax),
  ]);

  const threadIdSet = new Set<string>();
  const inboxById = new Map<string, { row: InboxViewRow; matchedOn: typeof inboxTagged[0]["matchedOn"] }>();
  for (const t of inboxTagged) {
    threadIdSet.add(t.row.id);
    if (!inboxById.has(t.row.id)) inboxById.set(t.row.id, t);
  }
  for (const id of probeIds) {
    threadIdSet.add(id);
  }

  const hydrateMap = await hydrateThreadsMinimal(supabase, photographerId, [...threadIdSet]);

  const threadHits: AssistantOperatorCorpusSearchSnapshot["threadHits"] = [];

  for (const [id, meta] of inboxById) {
    const h = hydrateMap.get(id);
    const row = meta.row;
    const snip =
      meta.matchedOn === "latest_body_snippet"
        ? clip(String(row.latest_body ?? ""), 160)
        : meta.matchedOn === "latest_sender"
          ? clip(String(row.latest_sender ?? ""), 120)
          : null;
    threadHits.push({
      threadId: id,
      title: h?.title ?? row.title,
      weddingId: h?.wedding_id ?? row.wedding_id,
      lastActivityAt: h?.last_activity_at ?? row.last_activity_at,
      channel: h?.channel ?? "email",
      kind: h?.kind ?? row.kind,
      matchedOn: meta.matchedOn,
      snippet: snip,
    });
  }

  for (const id of probeIds) {
    if (inboxById.has(id)) continue;
    const h = hydrateMap.get(id);
    if (!h) continue;
    threadHits.push({
      threadId: id,
      title: h.title,
      weddingId: h.wedding_id,
      lastActivityAt: h.last_activity_at,
      channel: h.channel,
      kind: h.kind,
      matchedOn: "message_body_probe",
      snippet: null,
    });
  }

  threadHits.sort(
    (a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt) || a.threadId.localeCompare(b.threadId),
  );

  const playbookHits = matchPlaybookInMemory(input.playbookRules, tokens, pbMax);
  const caseExceptionHits = matchCaseExceptionsInMemory(input.authorizedCaseExceptions, tokens, exMax);
  const invoiceTemplateMentioned = invoiceMentionedInMemory(input.studioInvoiceSetup, tokens);

  const scopeNote =
    `Indexed tenant search (read-only): inbox view **title / latest_sender / latest_body** (bounded chars in view), ` +
    `**weddings** couple_names/location/package_name/story_notes, **memories** title/summary (all scopes, non-archived), ` +
    `**studio_offer_builder_projects.name**; in-memory **effective playbook** instruction/topic/action_key, ` +
    `**authorized_case_exceptions.notes**, invoice template strings from Context. ` +
    `${messageBodyProbeRan ? `Also **messages.body** ilike probe (≤${probeLimit} rows, newest-first) for thread ids — not full thread text.` : "No **messages.body** table scan."} ` +
    `Deep mode=${deep ? "on" : "off"} (wider caps). Not attachment OCR or external search.`;

  return {
    didRun: true,
    scopeNote,
    tokensQueried: tokens,
    deepMode: deep,
    messageBodyProbeRan,
    threadHits,
    projectHits,
    playbookHits,
    caseExceptionHits,
    memoryHits,
    offerProjectHits,
    invoiceTemplateMentioned,
  };
}
