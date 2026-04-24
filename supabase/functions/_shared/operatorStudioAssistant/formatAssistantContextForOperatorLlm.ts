/**
 * Bounded text serialization of {@link AssistantContext} for operator-only LLM prompts.
 * Not used by reply-in-thread / persona paths.
 */
import type {
  AssistantContext,
  AssistantFocusedProjectSummary,
  AssistantOperatorStateSummary,
  AssistantPlaybookCoverageSummary,
  AssistantStudioProfile,
  AssistantStudioAnalysisSnapshot,
  type AssistantStudioOfferBuilderRead,
  type AssistantStudioInvoiceSetupRead,
} from "../../../../src/types/assistantContext.types.ts";
import { EMPTY_ASSISTANT_PLAYBOOK_COVERAGE_SUMMARY } from "../../../../src/lib/deriveAssistantPlaybookCoverageSummary.ts";
import { hasOperatorQueueStateIntent } from "../../../../src/lib/operatorAssistantOperatorStateIntent.ts";
import {
  hasOperatorPersonNameCommunicationLookupIntent,
  hasOperatorThreadMessageLookupIntent,
  querySuggestsCommercialOrNonWeddingInboundFocus,
} from "../../../../src/lib/operatorAssistantThreadMessageLookupIntent.ts";
import { formatCarryForwardBlockForLlm } from "./operatorAssistantCarryForward.ts";

const MAX_PLAYBOOK_RULES = 24;
const MAX_PLAYBOOK_INSTRUCTION_CHARS = 400;
const MAX_MEMORY_SNIPPETS = 8;
const MAX_MEMORY_SNIPPET_CHARS = 320;
const MAX_KB_ROWS = 5;
const MAX_KB_CONTENT_CHARS = 500;
/** Catalog JSON includes procedural workflows; keep a ceiling in case the module grows. */
/** App catalog can exceed 20k UTF-8 bytes; clipping mid-JSON breaks parseability (Slice 5 anti-drift test). */
const MAX_APP_CATALOG_JSON_CHARS = 28000;
/** Studio analysis snapshot JSON — bounded for prompt budget. */
const MAX_STUDIO_ANALYSIS_JSON_CHARS = 12000;
const MAX_PLAYBOOK_COVERAGE_TOPIC_LIST_CHARS = 900;
const MAX_PLAYBOOK_COVERAGE_KEY_LIST_CHARS = 900;
const MAX_PLAYBOOK_COVERAGE_KEYWORD_LINE_CHARS = 2000;
const MAX_PLAYBOOK_COVERAGE_TOPICS_IN_TABLE = 16;
/** Whole Offer projects section in the operator user message (list + per-row outlines). */
const MAX_STUDIO_OFFER_BUILDER_SECTION_CHARS = 14_000;
const MAX_OFFER_PROJECT_COMPACT_SUMMARY_IN_PROMPT = 900;
const MAX_STUDIO_INVOICE_SETUP_SECTION_CHARS = 4_000;

/**
 * Canonical truth-order hint for domain-first blocks (aligned with operator system prompt).
 * Playbook = automation authority; memory & KB = supporting only.
 */
export const OPERATOR_CONTEXT_AUTHORITY_PLAYBOOK_FIRST =
  "**Automation authority:** **Playbook** is **authoritative**; **durable memory** and **global knowledge** are **supporting** only and **must not** override stated rules.";

export type FormatAssistantContextForOperatorLlmOptions = {
  /**
   * When set (non-null string), a deterministically fetched Open-Meteo weather block for this question.
   * `null`/`undefined` = no weather section.
   */
  weatherToolMarkdown?: string | null;
};

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}...`;
}

function studioProfileLine(label: string, value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") {
    return `- **${label}:** *(not set)*`;
  }
  return `- **${label}:** ${value}`;
}

/** Compact studio capability + settings identity for operator prompts (read-only). */
export function formatStudioProfileForOperatorLlm(sp: AssistantStudioProfile): string {
  const lines: string[] = [];
  lines.push("## Studio profile (capability boundary, not playbook policy)");
  lines.push(
    "*(**What the studio is / can do** from `studio_business_profiles` + key `photographers.settings`. **Not** automation policy — **Playbook** blocks below are **authoritative** for automation; this profile does **not** override them. If something is *not set* or the business-profile row is missing, say so — **do not invent** services, travel, or currency.)*",
  );
  lines.push("");
  lines.push("### Identity (`photographers.settings`)");
  const id = sp.identity;
  lines.push(studioProfileLine("Studio name", id.studio_name));
  lines.push(studioProfileLine("Manager name", id.manager_name));
  lines.push(studioProfileLine("Photographer names", id.photographer_names));
  lines.push(studioProfileLine("Timezone", id.timezone));
  lines.push(studioProfileLine("Currency", id.currency));
  lines.push(studioProfileLine("Base location", id.base_location));
  lines.push(studioProfileLine("Inquiry first-step style", id.inquiry_first_step_style));
  lines.push("");
  lines.push("### Services & scope (`studio_business_profiles`)");
  if (!sp.hasBusinessProfileRow || !sp.capability) {
    lines.push("- *(No `studio_business_profiles` row — service/geography/deliverable scope not loaded.)*");
  } else {
    const c = sp.capability;
    lines.push(studioProfileLine("Service types", c.service_types));
    lines.push(studioProfileLine("Core services", c.core_services));
    lines.push(studioProfileLine("Deliverable types", c.deliverable_types));
    lines.push(studioProfileLine("Geographic scope", c.geographic_scope));
    lines.push(studioProfileLine("Travel policy", c.travel_policy));
    lines.push(studioProfileLine("Service availability", c.service_availability));
    lines.push(studioProfileLine("Booking scope", c.booking_scope));
    lines.push(studioProfileLine("Client types", c.client_types));
    lines.push(studioProfileLine("Lead acceptance rules", c.lead_acceptance_rules));
    lines.push(studioProfileLine("Language support", c.language_support));
    lines.push(studioProfileLine("Team structure", c.team_structure));
    lines.push(studioProfileLine("Extensions (notes/custom labels, clipped)", c.extensions_summary));
    lines.push(studioProfileLine("Profile source_type", c.source_type));
    lines.push(studioProfileLine("Profile updated_at", c.updated_at));
  }
  return lines.join("\n");
}

/** Read-only: capped `studio_offer_builder_projects` list + Puck-derived outline text per row (no raw JSON). */
export function formatStudioOfferBuilderForOperatorLlm(ob: AssistantStudioOfferBuilderRead): string {
  const lines: string[] = [];
  lines.push("## Offer projects (grounded — investment guide / Offer builder)");
  lines.push(
    "*(**Factual (database):** `id`, `name`, `updated_at` on each row. **Summarized (derived):** `compactSummary` is a **heuristic outline** from stored Puck `puck_data` — **not** a client PDF, live site, or guaranteed-complete package list. **Not** CRM **wedding** booking packages on a project — use **Focused project** + **operator_lookup_project_details** for those. If you need a **longer** outline for **one** row, use **operator_lookup_offer_builder** with that row’s `offerProjectId`.)*",
  );
  lines.push("");
  if (ob.projects.length === 0) {
    lines.push(
      "- *(No rows returned in this read — the tenant may have no offer-builder projects yet, or the list is empty in `studio_offer_builder_projects`.)*",
    );
  } else {
    if (ob.truncated) {
      lines.push(
        "- **List cap:** The newest-first list may be **truncated**; more older rows may exist than shown.",
      );
    }
    lines.push(`- **Note:** ${ob.note}`);
    lines.push("");
    for (const p of ob.projects) {
      lines.push(`### ${p.displayName || "Untitled offer"}`);
      lines.push(`- **offerProjectId:** \`${p.id}\``);
      lines.push(`- **updated_at:** ${p.updatedAt}`);
      lines.push(`- **compactSummary (derived):** ${clip(p.compactSummary, MAX_OFFER_PROJECT_COMPACT_SUMMARY_IN_PROMPT)}`);
      lines.push("");
    }
  }
  return clip(lines.join("\n"), MAX_STUDIO_OFFER_BUILDER_SECTION_CHARS);
}

/** Read-only: one `studio_invoice_setup` row — text fields + logo **summary** only (no data URL). */
export function formatStudioInvoiceSetupForOperatorLlm(inv: AssistantStudioInvoiceSetupRead): string {
  const lines: string[] = [];
  lines.push("## Invoice setup (grounded — PDF template / Settings → Invoice)");
  lines.push(
    "*(**Factual:** `legalName`, `invoicePrefix`, `paymentTerms`, `accentColor`, `footerNote` strings and `updated_at` from `studio_invoice_setup` when present. **Not** a specific issued invoice, line items, or amounts for a client. **Logo:** only **hasLogo**, **MIME**, and **stored data-URL length** — the **image bytes are never** included in this prompt.)*",
  );
  lines.push("");
  if (!inv.hasRow) {
    lines.push(`- *(No row in this read — ${inv.note})*`);
    return clip(lines.join("\n"), MAX_STUDIO_INVOICE_SETUP_SECTION_CHARS);
  }
  lines.push(`- **updated_at:** ${inv.updatedAt ?? "—"}`);
  lines.push(`- **legalName:** ${inv.legalName || "*(empty)*"}`);
  lines.push(`- **invoicePrefix:** ${inv.invoicePrefix || "*(empty)*"}`);
  lines.push(`- **paymentTerms:** ${inv.paymentTerms || "*(empty)*"}`);
  lines.push(`- **accentColor:** ${inv.accentColor || "*(empty)*"}`);
  lines.push(
    `- **footerNote:** ${inv.footerNote || "*(empty)*"}${
      inv.footerNoteTruncated ? " *(clipped in this block — use **operator_lookup_invoice_setup** for a longer excerpt.)*" : ""
    }`,
  );
  lines.push("");
  lines.push("### Logo (summary only)");
  lines.push(`- **hasLogo:** ${inv.logo.hasLogo}`);
  lines.push(`- **mimeType:** ${inv.logo.mimeType ?? "—"}`);
  lines.push(`- **approxDataUrlChars:** ${inv.logo.approxDataUrlChars}`);
  lines.push(`- **${inv.logo.note}**`);
  lines.push("");
  lines.push(`- **Note:** ${inv.note}`);
  return clip(lines.join("\n"), MAX_STUDIO_INVOICE_SETUP_SECTION_CHARS);
}

function formatFocusedProjectSummaryBlock(s: AssistantFocusedProjectSummary): string {
  const lines: string[] = [];
  lines.push(
    "*(**Summary / pointer only** — not full CRM. For venue, package, money, story, people, contact points, and task/draft/escalation counts, call the read-only tool **operator_lookup_project_details** with this **projectId**.)*",
  );
  lines.push("");
  lines.push(`- **projectId:** \`${s.projectId}\``);
  lines.push(`- **projectType:** ${s.projectType || "—"}`);
  lines.push(`- **stage:** ${s.stage || "—"}`);
  lines.push(`- **displayTitle:** ${s.displayTitle || "—"}`);
  return lines.join("\n");
}

function formatOperatorStateSummary(s: AssistantOperatorStateSummary): string {
  const lines: string[] = [];
  lines.push(
    "(**Read-only snapshot** — same sources as the operator Today / Zen feed. **Counts and named samples** are the only queue evidence; **do not invent** items, sends, or SLA urgency. Suggest next steps; do not assert completions.)",
  );
  lines.push("");
  lines.push("### Snapshot-derived priorities (counts + samples; evidence-backed)");
  for (const h of s.queueHighlights) {
    lines.push(`- ${h}`);
  }
  lines.push("");
  lines.push("### Counts");
  const c = s.counts;
  lines.push(
    `- **Pending-approval drafts:** ${c.pendingApprovalDrafts} · **Open tasks:** ${c.openTasks} · **Open escalations:** ${c.openEscalations} · **Linked open leads (pre-booking):** ${c.linkedOpenLeads}`,
  );
  lines.push(
    `- **Unlinked (inbox bucket — all unlinked in projection):** inquiry ${c.unlinked.inquiry}; needs filing ${c.unlinked.needsFiling}; operator review ${c.unlinked.operatorReview}; suppressed ${c.unlinked.suppressed}`,
  );
  lines.push(
    `- **Zen tabs (escalations + operator-review unfiled → Review; drafts → Drafts; inquiries + open leads → Leads; other unfiled needs filing → Needs filing; tasks are not in a tab):** Review ${c.zenTabs.review}; Drafts ${c.zenTabs.drafts}; Leads ${c.zenTabs.leads}; Needs filing ${c.zenTabs.needs_filing}`,
  );
  lines.push("");
  lines.push("### Inbox thread samples (titles only; linked + unlinked buckets)");
  const ub = s.samples.unlinkedBuckets;
  const hasBucketSamples =
    s.samples.linkedLeads.length > 0 ||
    ub.inquiry.length > 0 ||
    ub.needsFiling.length > 0 ||
    ub.operatorReview.length > 0;
  if (s.samples.linkedLeads.length > 0) {
    lines.push("**Linked open leads:**");
    for (const x of s.samples.linkedLeads) {
      lines.push(`  - ${x.title} — ${x.subtitle} — thread \`${x.threadId}\``);
    }
  }
  if (ub.inquiry.length > 0) {
    lines.push("**Unlinked inquiry:**");
    for (const x of ub.inquiry) {
      lines.push(`  - ${x.title} — thread \`${x.threadId}\``);
    }
  }
  if (ub.operatorReview.length > 0) {
    lines.push("**Unlinked operator review:**");
    for (const x of ub.operatorReview) {
      lines.push(`  - ${x.title} — thread \`${x.threadId}\``);
    }
  }
  if (ub.needsFiling.length > 0) {
    lines.push("**Unlinked needs filing:**");
    for (const x of ub.needsFiling) {
      lines.push(`  - ${x.title} — thread \`${x.threadId}\``);
    }
  }
  if (!hasBucketSamples) {
    lines.push("(no inbox thread samples in this snapshot — bucket lists empty or suppressed-only)");
  }
  lines.push("");
  lines.push("### Recent action samples (mixed types by recency; titles only; no message bodies)");
  if (s.samples.topActions.length > 0) {
    lines.push("**By recency (mixed):**");
    for (const a of s.samples.topActions) {
      lines.push(`  - [${a.typeLabel}] ${a.title} — \`${a.id}\``);
    }
  } else {
    lines.push("**By recency (mixed):** (none)");
  }
  if (s.samples.openEscalations.length > 0) {
    lines.push("**Escalations:**");
    for (const e of s.samples.openEscalations) {
      lines.push(`  - \`${e.actionKey}\` — ${e.title} — \`${e.id}\``);
    }
  }
  if (s.samples.pendingDrafts.length > 0) {
    lines.push("**Pending drafts:**");
    for (const d of s.samples.pendingDrafts) {
      lines.push(`  - ${d.title} — ${d.subtitle || "—"} — \`${d.id}\``);
    }
  }
  if (s.samples.openTasks.length > 0) {
    lines.push("**Open tasks (by due date):**");
    for (const t of s.samples.openTasks) {
      lines.push(`  - ${t.title} (due ${t.dueDate}) — ${t.subtitle ?? "—"} — \`${t.id}\``);
    }
  }
  lines.push("");
  lines.push(`*Snapshot time: \`${s.fetchedAt}\` (ISO). ${s.sourcesNote}*`);
  return lines.join("\n");
}

function formatPlaybookCoverageSummaryForOperatorLlm(ctx: AssistantContext): string {
  const c: AssistantPlaybookCoverageSummary =
    ctx.playbookCoverageSummary ?? EMPTY_ASSISTANT_PLAYBOOK_COVERAGE_SUMMARY;
  const lines: string[] = [];
  lines.push("## Playbook coverage summary (effective rules — read-only aggregate, domain-first)");
  lines.push(
    "*(**Bounded index:** aggregate counts and hints from **effective** rules for this tenant — **not** an omniscient map of every edge case. The **Playbook (effective rules)** block below is capped (**max " +
      MAX_PLAYBOOK_RULES +
      "** lines) for prompt budget — **not** proof that no other rule exists. For **policy / rule text** when the operator names a topic not visible here, call **operator_lookup_playbook_rules** (keywords). **Do not** invent **action_key**s from this summary alone. " +
      OPERATOR_CONTEXT_AUTHORITY_PLAYBOOK_FIRST +
      ")*",
  );
  lines.push("");
  lines.push(
    `- **Total active rules (effective set for this build):** ${c.totalActiveRules} *(detailed rule lines below: at most ${MAX_PLAYBOOK_RULES} for prompt budget.)*`,
  );
  lines.push(
    `- **Distinct topics (${c.uniqueTopics.length}):** ${clip(
      c.uniqueTopics.length ? c.uniqueTopics.map((t) => `\`${t}\``).join(", ") : "(none)",
      MAX_PLAYBOOK_COVERAGE_TOPIC_LIST_CHARS,
    )}`,
  );
  lines.push(
    `- **Distinct action keys (${c.uniqueActionKeys.length}):** ${clip(
      c.uniqueActionKeys.length ? c.uniqueActionKeys.map((k) => `\`${k}\``).join(", ") : "(none)",
      MAX_PLAYBOOK_COVERAGE_KEY_LIST_CHARS,
    )}`,
  );
  if (c.rulesWithCaseException > 0) {
    lines.push(`- **Rules with an active case-exception overlay:** ${c.rulesWithCaseException}`);
  }
  lines.push(
    `- **Scopes:** ${c.scopes.length ? c.scopes.join(", ") : "(none)"} · **Channels:** ${c.channels.length ? c.channels.join(", ") : "(none)"} · **Decision modes:** ${c.decisionModes.length ? c.decisionModes.join(", ") : "(none)"}`,
  );
  lines.push(
    `- **Source types:** ${c.sourceTypes.length ? c.sourceTypes.join(", ") : "(none)"} · **Confidence labels:** ${c.confidenceLabels.length ? c.confidenceLabels.join(", ") : "(none)"}`,
  );
  if (c.topicCounts.length > 0) {
    lines.push("- **Rules per topic (when topic field is set):**");
    for (const row of c.topicCounts.slice(0, MAX_PLAYBOOK_COVERAGE_TOPICS_IN_TABLE)) {
      lines.push(`  - \`${row.topic}\`: ${row.count}`);
    }
    if (c.topicCounts.length > MAX_PLAYBOOK_COVERAGE_TOPICS_IN_TABLE) {
      lines.push(
        `  - *(…omitted ${c.topicCounts.length - MAX_PLAYBOOK_COVERAGE_TOPICS_IN_TABLE} more topic row(s) in this sub-list — full counts are in structured context.)*`,
      );
    }
  }
  if (c.actionKeyTokenHints.length > 0) {
    lines.push(
      `- **Action-key word hints** (from \`action_key\` segments, e.g. \`wedding_travel\` → \`wedding\`, \`travel\`): ${c.actionKeyTokenHints.join(", ")}`,
    );
  }
  if (c.coverageKeywordHints.length > 0) {
    lines.push(
      `- **Content keyword hints (from topic + instruction text; high-frequency, capped, not a full taxonomy):** ${clip(
        c.coverageKeywordHints.join(", "),
        MAX_PLAYBOOK_COVERAGE_KEYWORD_LINE_CHARS,
      )}`,
    );
  }
  return lines.join("\n");
}

function shouldPrioritizeInboxThreadEvidence(ctx: AssistantContext): boolean {
  if (hasOperatorQueueStateIntent(ctx.queryText)) return false;
  if (!ctx.operatorThreadMessageLookup.didRun) return false;
  if (ctx.operatorThreadMessageLookup.selectionNote.includes("inbox_scored")) return true;
  return querySuggestsCommercialOrNonWeddingInboundFocus(ctx.queryText);
}

function formatMatchedEntitiesForOperatorLlm(ctx: AssistantContext): string | null {
  const e = ctx.operatorQueryEntityResolution;
  if (!e.didRun) return null;
  const hasPeople = e.personMatches.length > 0;
  const sameAsFocus =
    e.weddingSignal === "unique" &&
    e.uniqueWeddingId != null &&
    e.uniqueWeddingId === ctx.focusedWeddingId;
  /** Domain-first: never duplicate the focused-project pointer as query-resolved when ids match. */
  const queryResolvedSummaryForPrompt =
    e.queryResolvedProjectSummary != null && !sameAsFocus ? e.queryResolvedProjectSummary : null;
  const hasBoost = queryResolvedSummaryForPrompt != null;
  if (e.weddingSignal === "none" && !hasPeople && !hasBoost) return null;

  const lines: string[] = [];
  lines.push("## Matched entities (bounded resolver — CRM project / people index)");
  lines.push(
    "*(**Resolver / index only** — read-only, deterministic recent `weddings` + `people` rows, tenant-bounded. **Not** inbox/message history, not all-time search, **not** deep CRM. After you have a **projectId**, use **operator_lookup_project_details** for venue, money, people, story, counts.)*",
  );
  lines.push("");
  if (
    hasOperatorThreadMessageLookupIntent(ctx.queryText) &&
    querySuggestsCommercialOrNonWeddingInboundFocus(ctx.queryText)
  ) {
    lines.push(
      "- **Inbound kind:** The operator may mean a **commercial / non-wedding** inquiry — treat **Recent thread & email activity** (below or above) as primary evidence; do not assume wedding-couple CRM semantics unless thread rows show a `wedding` id matching a named project.",
    );
    lines.push("");
  }
  lines.push(`- **Wedding / project match signal:** \`${e.weddingSignal}\``);
  if (e.uniqueWeddingId) {
    lines.push(`- **Query-resolved wedding id:** \`${e.uniqueWeddingId}\``);
  }
  if (sameAsFocus) {
    lines.push(
      "- **Note:** The query names the **same project** as the **Focused project (summary)** block above; use **operator_lookup_project_details** for full CRM (not duplicated here).",
    );
  }
  if (e.weddingSignal === "ambiguous" && e.weddingCandidates.length > 0) {
    lines.push("- **Plausible projects (ask which one, or disambiguate using these fields):**");
    for (const c of e.weddingCandidates) {
      const date = c.wedding_date ?? "—";
      const loc = c.location.trim() ? c.location : "—";
      lines.push(
        `  - **${c.couple_names}** — stage: ${c.stage}; date: ${date}; location: ${loc}; type: ${c.project_type} — \`${c.weddingId}\``,
      );
    }
  }
  if (e.personMatches.length > 0) {
    lines.push("- **People rows whose `display_name` plausibly matches the query (bounded list):**");
    for (const p of e.personMatches) {
      lines.push(`  - ${p.display_name} (${p.kind}) — \`${p.id}\``);
    }
  }
  if (queryResolvedSummaryForPrompt) {
    lines.push("### Query-resolved project (summary — call operator_lookup_project_details for specifics)");
    lines.push(
      "*(Same **pointer** contract as **Focused project (summary)** — **projectType** is for vocabulary; not venue, money, people, or counts.)*",
    );
    lines.push("");
    lines.push(formatFocusedProjectSummaryBlock(queryResolvedSummaryForPrompt));
  }
  return lines.join("\n");
}

function formatInquiryCountSnapshotForOperatorLlm(ctx: AssistantContext): string | null {
  const s = ctx.operatorInquiryCountSnapshot;
  if (!s.didRun) return null;
  const lines: string[] = [];
  lines.push("## Inquiry counts / comparisons (read-only, UTC windows)");
  lines.push(
    "*(**First client inbound** per thread — `messages.direction=in` min time — filtered to pre-booking inquiry semantics. Not total messages; not studio-local timezone in this pass.)*",
  );
  lines.push("");
  lines.push(`- **Computed at:** \`${s.computedAt}\` · ${s.timezoneNote}`);
  lines.push(`- **Semantics:** ${clip(s.semanticsNote, 600)}`);
  if (s.truncated) {
    lines.push(
      "- **Caution:** Row cap hit; counts may be **undercounts**. Increase cap only with care; this is not a data warehouse path.",
    );
  }
  lines.push("");
  const w = s.windows;
  lines.push("### Counts (side-by-side for comparisons)");
  lines.push(
    `- **Today:** ${w.today.count} — ${w.today.label} — bounds \`${w.today.startIso}\` … \`${w.today.endIso}\` `,
  );
  lines.push(
    `- **Yesterday:** ${w.yesterday.count} — ${w.yesterday.label} — bounds \`${w.yesterday.startIso}\` … \`${w.yesterday.endIso}\` `,
  );
  lines.push(
    `- **This week (so far, Mon → now):** ${w.thisWeek.count} — ${w.thisWeek.label} — from \`${w.thisWeek.startIso}\` through \`${w.thisWeek.endIso}\` `,
  );
  lines.push(
    `- **Last week (full ISO week):** ${w.lastWeek.count} — ${w.lastWeek.label} — \`${w.lastWeek.startIso}\` … \`${w.lastWeek.endIso}\` `,
  );
  if (s.comparison.todayMinusYesterday != null) {
    const d = s.comparison.todayMinusYesterday;
    const tag = d > 0 ? "more" : d < 0 ? "fewer" : "same";
    lines.push("");
    lines.push(
      `- **Today vs yesterday (today − yesterday):** ${d >= 0 ? "+" : ""}${d} — **${tag}** inquiries than yesterday (same semantics as above).`,
    );
  }
  return lines.join("\n");
}

function formatOperatorCalendarSnapshotForOperatorLlm(ctx: AssistantContext): string | null {
  const s = ctx.operatorCalendarSnapshot;
  if (!s.didRun) return null;
  const lines: string[] = [];
  lines.push("## Calendar lookup (read-only — Slice 5 domain-first, `calendar_events`)");
  lines.push(
    "*(**Question-shaped evidence only:** this block is the **bounded `calendar_events` read** for **this** UTC window and filters — **not** a full personal agenda, not other systems, and **not** implied by project summaries, queue, or memory. **No writes** here: creating/moving/deleting uses **calendar_event_*** proposals after confirm. **Tasks are not calendar events.**)*",
  );
  lines.push("");
  lines.push(
    "- **Evidence contract:** This list is **complete for this fetch only** — **not** your whole calendar everywhere. If empty, say **no matching rows in this window** — **not** “free,” not “nothing scheduled” outside this query. If rows exist, cite them; **never** invent times or events. **Do not** fill schedule gaps from **Focused project**, **Operator state**, memory, knowledge, or unrelated Context.",
  );
  lines.push(`- **Lookup mode:** \`${s.lookupMode}\``);
  lines.push(`- **Lookup basis:** ${clip(s.lookupBasis, 600)}`);
  lines.push(`- **Time window:** \`${s.windowStartIso}\` … \`${s.windowEndIso}\` — ${s.windowLabel}`);
  if (s.weddingFilter) {
    const cn = s.weddingFilter.coupleNames?.trim() ? s.weddingFilter.coupleNames : "—";
    lines.push(`- **Wedding / project filter:** **${clip(cn, 80)}** — \`${s.weddingFilter.weddingId}\``);
  }
  if (s.titleContains) {
    lines.push(`- **Title contains (case-insensitive):** “${clip(s.titleContains, 80)}”`);
  }
  if (s.eventTypeFilter && s.eventTypeFilter.length > 0) {
    lines.push(`- **Event types filter:** ${s.eventTypeFilter.map((t) => `\`${t}\``).join(", ")}`);
  }
  lines.push(
    `- **Row budget:** up to **${s.maxRows}** rows · returned **${s.rowCountReturned}**`,
  );
  lines.push(`- **Computed at:** \`${s.computedAt}\` · ${s.timeZoneNote}`);
  lines.push(`- **Semantics:** ${clip(s.semanticsNote, 500)}`);
  if (s.truncated) {
    lines.push(
      "- **Caution:** Row cap hit — additional matching events may exist outside this list.",
    );
  }
  if (s.events.length === 0) {
    lines.push("");
    lines.push("- **Events in window:** (none)");
  } else {
    lines.push("");
    lines.push(s.orderAscending === false ? "### Events (most recent first)" : "### Events (chronological)");
    for (const e of s.events) {
      const who = e.coupleNames != null && e.coupleNames.trim() ? e.coupleNames : "—";
      const wtag = e.weddingId != null ? ` — wedding \`${e.weddingId}\`` : "";
      lines.push(
        `- **${clip(e.title, 200)}** (${e.eventTypeLabel}) — start \`${e.startTime}\` end \`${e.endTime}\` — project: **${clip(who, 80)}**${wtag} — id \`${e.id}\``,
      );
    }
  }
  return lines.join("\n");
}

function formatThreadMessageLookupForOperatorLlm(ctx: AssistantContext): string | null {
  const t = ctx.operatorThreadMessageLookup;
  if (!t.didRun) return null;
  const bodies = ctx.operatorThreadMessageBodies;
  const hasExcerpts = bodies.didRun && bodies.messages.length > 0;
  const lines: string[] = [];
  lines.push("## Recent thread & email activity (orienting envelope — Slice 4, read-only)");
  if (hasExcerpts) {
    lines.push(
      "*(**Rare:** excerpts appear only when explicitly injected into Context. Normally, **message bodies** come from the **operator_lookup_thread_messages** tool, not this block.)*",
    );
    lines.push(
      "*(**Envelope:** deterministic `threads` metadata — title, channel, kind, timestamps, thread id. **Bounded message excerpts** from `messages.body` under **Thread message excerpts** below — summarize body-level questions **only** from that subsection, not from the subject line alone.)*",
    );
  } else {
    lines.push(
      "*(**Domain-first:** this block is a **small, recency-biased orienting list** (envelope metadata only) when the question is about inbox/thread **activity**, not **message meaning**. **Do not** treat subject lines as proof of what someone **said** or **wanted**.)*",
    );
    lines.push(
      "*(**Envelope only** — last activity / inbound / outbound times; **no** `messages.body` here unless a **Thread message excerpts** subsection appears (rare). For *what they said* / *what they want* / *email body* questions, call **operator_lookup_threads** (resolver) then **operator_lookup_thread_messages** with a **threadId**, or use **lastThreadId** from the **Carry-forward pointer** when clearly one thread. Not a full-history search.)*",
    );
  }
  lines.push("");
  if (ctx.investigationSpecialistFocus) {
    lines.push(
      "- **Deep search mode:** Inbox/thread retrieval used a **wider scored-candidate window** than normal mode (still tenant-bounded). Prefer citing matches here; if still ambiguous, use extra **operator_lookup_** tools this turn.",
    );
    lines.push("");
  }
  if (hasOperatorPersonNameCommunicationLookupIntent(ctx.queryText)) {
    lines.push(
      "- **Honesty (named person / sender):** If the operator asked whether anyone **messaged, emailed, or talked** with a **named** contact, treat **absence from this block** as *not found in this bounded retrieval* — **not** proof they never reached out. Say what was checked (e.g. title / latest_sender hints, row caps) and offer **Deep search** or **operator_lookup_threads** for a wider pass.",
    );
    lines.push("");
  }
  if (t.selectionNote.includes("recent tenant threads")) {
    lines.push(
      "- **Caution:** The thread list included a **generic recent-inbox fallback** — not fully targeted to the question. Do **not** conclude there is **no** older correspondence with a named sender.",
    );
    lines.push("");
  }
  if (
    querySuggestsCommercialOrNonWeddingInboundFocus(ctx.queryText) ||
    t.selectionNote.includes("inbox_scored")
  ) {
    lines.push(
      "- **Interpretation:** “Inquiry” can be **wedding**, **commercial**, or other inbound — **unlinked** threads (`wedding: —`) are normal for brand/campaign leads; answer from thread titles/timestamps unless CRM rows clearly name the same project.",
    );
    lines.push("");
  }
  lines.push(`- **Selection:** ${clip(t.selectionNote, 500)}`);
  if (t.threads.length === 0) {
    lines.push("- **Matching threads in this window:** (none)");
  } else {
    lines.push("- **Threads (compare inbound vs outbound times for “did they email / when did we last write”):**");
    for (const row of t.threads) {
      const wid = row.weddingId != null ? `\`${row.weddingId}\`` : "—";
      const li = row.lastInboundAt != null ? row.lastInboundAt : "—";
      const lo = row.lastOutboundAt != null ? row.lastOutboundAt : "—";
      lines.push(
        `  - **${clip(row.title, 200)}** — channel: ${row.channel}; kind: ${row.kind} — wedding: ${wid} — last activity: ${row.lastActivityAt} — last inbound: ${li} — last outbound: ${lo} — thread \`${row.threadId}\``,
      );
    }
  }
  if (hasExcerpts) {
    lines.push("");
    lines.push("### Thread message excerpts (bounded read-only)");
    lines.push(
      `*(Actual \`messages.body\` text for thread \`${bodies.threadId}\` (**${clip(bodies.threadTitle ?? "—", 120)}**). **Up to 8** most recent messages; each body **≤900** UTF-8 chars; chronological order. **Tenant-scoped read** — not full thread history if older messages exist.)*`,
    );
    if (bodies.truncatedOverall) {
      lines.push("- **Caution:** At least one body was clipped or the **8-message** cap applied — additional content may exist in Inbox.");
    }
    lines.push("");
    for (const m of bodies.messages) {
      const clipNote = m.bodyClipped ? " *(body clipped)*" : "";
      lines.push(
        `- **${m.direction}** · \`${m.sentAt}\` · sender: ${clip(m.sender, 160)} · message \`${m.messageId}\`${clipNote}`,
      );
      const excerpt = m.bodyExcerpt.replace(/\n/g, "\n  ");
      lines.push(`  ${excerpt}`);
    }
  }
  return lines.join("\n");
}

const MAX_CORPUS_THREAD_LINES = 14;
const MAX_CORPUS_PROJECT_LINES = 14;
const MAX_CORPUS_PLAYBOOK_LINES = 12;
const MAX_CORPUS_EXCEPTION_LINES = 8;
const MAX_CORPUS_MEMORY_LINES = 10;
const MAX_CORPUS_OFFER_LINES = 8;

function formatOperatorCorpusSearchForOperatorLlm(ctx: AssistantContext): string | null {
  const c = ctx.operatorCorpusSearch;
  if (!c.didRun) return null;
  const lines: string[] = [];
  lines.push("## Corpus search (tenant-wide indexed hits — phase 1)");
  lines.push(
    "*(**Phase 1:** SQL `ilike` on indexed/light columns + in-memory playbook/exception/invoice-template matches — **not** full message history or raw Puck JSON. **Phase 2:** use **operator_lookup_project_details**, **operator_lookup_thread_messages**, **operator_lookup_offer_builder**, etc., for top ids. If this block is empty, say **no indexed matches** for the tokens — not “nothing exists anywhere”.)*",
  );
  lines.push("");
  lines.push(`- **Tokens:** ${c.tokensQueried.length ? c.tokensQueried.map((t) => `\`${clip(t, 48)}\``).join(", ") : "*(none)*"}`);
  lines.push(`- **Deep caps:** ${c.deepMode ? "on" : "off"} · **messages.body probe:** ${c.messageBodyProbeRan ? "yes (bounded)" : "no"}`);
  lines.push(`- **Scope:** ${clip(c.scopeNote, 900)}`);
  lines.push("");

  if (c.threadHits.length > 0) {
    lines.push("### Threads / inbox (matched on title, sender, latest snippet, or body probe)");
    for (const h of c.threadHits.slice(0, MAX_CORPUS_THREAD_LINES)) {
      const sn = h.snippet ? ` — snippet: ${clip(h.snippet, 140)}` : "";
      lines.push(
        `  - **${clip(h.title, 160)}** — \`${h.matchedOn}\`${sn} — last: ${h.lastActivityAt} — wedding: ${h.weddingId ?? "—"} — thread \`${h.threadId}\``,
      );
    }
    if (c.threadHits.length > MAX_CORPUS_THREAD_LINES) {
      lines.push(`  - *(…${c.threadHits.length - MAX_CORPUS_THREAD_LINES} more thread hit(s) omitted — use tools to expand.)*`);
    }
    lines.push("");
  }

  if (c.projectHits.length > 0) {
    lines.push("### Projects (weddings — names, location, package, story_notes)");
    for (const p of c.projectHits.slice(0, MAX_CORPUS_PROJECT_LINES)) {
      lines.push(
        `  - **${clip(p.coupleNames, 120)}** (${p.projectType}, ${p.stage}) — ${clip(p.location, 80)} — date: ${p.weddingDate ?? "—"} — \`${p.weddingId}\` — *${clip(p.matchedOn, 40)}*`,
      );
    }
    if (c.projectHits.length > MAX_CORPUS_PROJECT_LINES) {
      lines.push(`  - *(…${c.projectHits.length - MAX_CORPUS_PROJECT_LINES} more project hit(s) omitted.)*`);
    }
    lines.push("");
  }

  if (c.playbookHits.length > 0) {
    lines.push("### Playbook rules (in-memory match on topic / instruction / action_key)");
    for (const r of c.playbookHits.slice(0, MAX_CORPUS_PLAYBOOK_LINES)) {
      lines.push(
        `  - **\`${r.actionKey}\`** — topic: ${clip(r.topic ?? "—", 80)} — mode: ${r.decisionMode} — \`${r.ruleId}\``,
      );
      lines.push(`    ${clip(r.snippet, 260)}`);
    }
    lines.push("");
  }

  if (c.caseExceptionHits.length > 0) {
    lines.push("### Authorized case exceptions (notes matched)");
    for (const e of c.caseExceptionHits.slice(0, MAX_CORPUS_EXCEPTION_LINES)) {
      lines.push(
        `  - **${e.status}** — wedding: ${e.weddingId ?? "—"} — \`${e.id}\` — ${clip(e.snippet, 200)}`,
      );
    }
    lines.push("");
  }

  if (c.memoryHits.length > 0) {
    lines.push("### Memories (title/summary)");
    for (const m of c.memoryHits.slice(0, MAX_CORPUS_MEMORY_LINES)) {
      lines.push(`  - **${clip(m.title, 120)}** (${m.scope}) — \`${m.id}\` — ${clip(m.snippet, 180)}`);
    }
    lines.push("");
  }

  if (c.offerProjectHits.length > 0) {
    lines.push("### Offer builder projects (name ilike)");
    for (const o of c.offerProjectHits.slice(0, MAX_CORPUS_OFFER_LINES)) {
      lines.push(`  - **${clip(o.name, 120)}** — updated ${o.updatedAt} — \`${o.offerProjectId}\``);
    }
    lines.push("");
  }

  if (c.invoiceTemplateMentioned) {
    lines.push("### Invoice template (Context row)");
    lines.push(
      "  - **Match:** Invoice setup fields in Context mention a query token — see **Invoice setup** block for full bounded text; not a separate DB pass.",
    );
    lines.push("");
  }

  const anyHits =
    c.threadHits.length +
      c.projectHits.length +
      c.playbookHits.length +
      c.caseExceptionHits.length +
      c.memoryHits.length +
      c.offerProjectHits.length +
      (c.invoiceTemplateMentioned ? 1 : 0) >
    0;
  if (!anyHits) {
    lines.push("*No indexed hits for this query’s tokens in the surfaces above (still bounded — not proof of global absence.)*");
    lines.push("");
  }

  return lines.join("\n");
}

function formatStudioAnalysisSnapshotBlock(s: AssistantStudioAnalysisSnapshot): string {
  const lines: string[] = [];
  lines.push(
    "(**Read-only — this studio’s CRM `weddings` rows** in a rolling window, plus **open task** and **open escalation** head counts. **Not** competitors, **not** market benchmarks, **not** industry norms.)",
  );
  lines.push("");
  lines.push("### Grounding (read before JSON)");
  for (const note of s.evidenceNotes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  lines.push("### Snapshot JSON");
  lines.push("```json");
  lines.push(clip(JSON.stringify(s), MAX_STUDIO_ANALYSIS_JSON_CHARS));
  lines.push("```");
  return lines.join("\n");
}

/**
 * Produces compact markdown-style blocks for the model (deterministic ordering).
 */
export function formatAssistantContextForOperatorLlm(
  ctx: AssistantContext,
  options?: FormatAssistantContextForOperatorLlmOptions,
): string {
  const parts: string[] = [];
  const weatherMd = options?.weatherToolMarkdown;

  parts.push("## Operator question");
  parts.push(clip(ctx.queryText, 8000));
  parts.push("");

  parts.push("## Triage (v1 hint — not a gate)");
  parts.push(
    JSON.stringify({
      primary: ctx.operatorTriage.primary,
      secondary: [...ctx.operatorTriage.secondary],
    }),
  );
  parts.push("");

  if (ctx.escalationResolverFocus) {
    parts.push("## Escalation resolver (specialist mode — pinned)");
    parts.push(
      "*(S1 — single pinned **escalation_requests** row. Help the operator interpret evidence and draft resolution text. **Do not** claim the escalation is closed until they confirm on a card. If **selectionNote** is not **ok** or **escalation.status** is not **open**, explain and **do not** emit an **escalation_resolve** proposal.)*",
    );
    parts.push("```json");
    parts.push(clip(JSON.stringify(ctx.escalationResolverFocus.toolPayload), 14_000));
    parts.push("```");
    parts.push("");
  }

  if (ctx.offerBuilderSpecialistFocus) {
    parts.push("## Offer builder specialist (pinned project)");
    parts.push(
      "*(S2 — single pinned **studio_offer_builder_projects** row. Prioritize this document for naming / outline questions. **No** raw **puck_data** or layout edits in chat. Bounded **metadata** changes use **offer_builder_change_proposal** only when **selectionNote** is **ok** and **project_id** matches the pin. If **selectionNote** is not **ok**, explain incomplete or denied access — **do not** emit that proposal kind.)*",
    );
    parts.push("```json");
    parts.push(clip(JSON.stringify(ctx.offerBuilderSpecialistFocus.toolPayload), 14_000));
    parts.push("```");
    parts.push("");
  }

  if (ctx.invoiceSetupSpecialistFocus) {
    parts.push("## Invoice setup specialist (pinned template lane)");
    parts.push(
      "*(S3 — tenant **studio_invoice_setup** row (one per photographer). Prioritize grounded template fields; **logo** is summary-only — **no** binary or **logoDataUrl** in chat. **invoice_setup_change_proposal** only when **selectionNote** is **ok** (saved row). If **no_invoice_setup_row**, explain — **do not** emit that proposal kind.)*",
    );
    parts.push("```json");
    parts.push(clip(JSON.stringify(ctx.invoiceSetupSpecialistFocus.toolPayload), 14_000));
    parts.push("```");
    parts.push("");
  }

  if (ctx.investigationSpecialistFocus) {
    parts.push("## Deep search / investigation mode (S4)");
    parts.push(
      "*(Read-first lane: chain **operator_lookup_*** tools on purpose; **cite** tool JSON and Context; **say unknown** when evidence was not fetched — **no** invented email bodies, counts, or money. **Not** bulk triage. Higher read-only tool budget this turn — see **maxLookupToolCallsThisTurn** in the JSON.)*",
    );
    parts.push("```json");
    parts.push(clip(JSON.stringify(ctx.investigationSpecialistFocus.toolPayload), 14_000));
    parts.push("```");
    parts.push("");
  }

  if (ctx.playbookAuditSpecialistFocus) {
    parts.push("## Rule authoring / audit mode (S5)");
    parts.push(
      "*(Playbook policy lane: use **Playbook** + coverage summary + **Authorized case exceptions** in Context. **playbook_rule_candidate** only for staged reusable rules — confirm in chat; promote on **Rule candidates (review)**. **No** direct **playbook_rules** edits. Server drops other proposal kinds in this mode.)*",
    );
    parts.push("```json");
    parts.push(clip(JSON.stringify(ctx.playbookAuditSpecialistFocus.toolPayload), 14_000));
    parts.push("```");
    parts.push("");
  }

  if (ctx.bulkTriageSpecialistFocus) {
    parts.push("## Bulk queue triage mode (S6)");
    parts.push(
      "*(Today / operator queue lane: use **Operator queue / Today** counts, samples, **topActions**, and **queue highlights** only — bounded like the dashboard. Discuss multiple items on purpose; **at most one** confirmable **proposedActions** entry this turn. No batch automation.)*",
    );
    parts.push("```json");
    parts.push(clip(JSON.stringify(ctx.bulkTriageSpecialistFocus.toolPayload), 14_000));
    parts.push("```");
    parts.push("");
  }

  if (typeof weatherMd === "string" && weatherMd.trim().length > 0) {
    parts.push("## Weather lookup (external tool — Open-Meteo)");
    parts.push(
      "The block below is **read from Open-Meteo** (geocoding + short-range **forecast** only). It is not CRM data. " +
        "**Cite the source** when you summarize. **Never invent** temperatures, conditions, or probabilities that are not listed. " +
        "If the block says the lookup was not run, failed, is outside the forecast window, or is for a **past** date, say so honestly; do not substitute guessed weather.",
    );
    parts.push(clip(weatherMd, 6000));
    parts.push("");
  }

  parts.push("## Effective scope");
  parts.push(`- Studio (tenant): ${ctx.photographerId}`);
  parts.push(`- Focused project id (\`weddings.id\`, all \`project_type\`): ${ctx.focusedWeddingId ?? "none"}`);
  parts.push(`- Focused person id: ${ctx.focusedPersonId ?? "none"}`);
  parts.push("");

  parts.push(formatStudioProfileForOperatorLlm(ctx.studioProfile));
  parts.push("");

  parts.push(formatStudioOfferBuilderForOperatorLlm(ctx.studioOfferBuilder));
  parts.push("");

  parts.push(formatStudioInvoiceSetupForOperatorLlm(ctx.studioInvoiceSetup));
  parts.push("");

  if (ctx.carryForward) {
    parts.push(formatCarryForwardBlockForLlm(ctx.carryForward));
    parts.push("");
  }

  const studioAnalysisFirst = ctx.operatorTriage.primary === "studio_analysis";
  if (studioAnalysisFirst && ctx.studioAnalysisSnapshot != null) {
    parts.push("## Studio analysis snapshot (read-only — prioritize for this question)");
    parts.push(
      "*(Studio-level **pricing, pipeline, mix, or “what the data shows”** — cite **Grounding** and JSON **only**. Frame as **observations**; **no** market or competitor advice; **no** invented medians or benchmarks.)*",
    );
    parts.push(formatStudioAnalysisSnapshotBlock(ctx.studioAnalysisSnapshot));
    parts.push("");
  }

  const queueIntent = ctx.retrievalLog.operatorQueueIntentMatched === true;
  if (queueIntent) {
    parts.push("## Operator queue / Today snapshot (read-only — prioritize for this question)");
    parts.push(
      "*(The operator asked about **workload, what’s waiting, urgency, or what to do next**. For queue claims, use **only** **Snapshot-derived priorities**, **Counts**, and **samples** in this block. **Open tasks** appear here but **not** in Zen tab totals. **Do not invent** queue rows, deadlines, or sends.)*",
    );
    parts.push(formatOperatorStateSummary(ctx.operatorStateSummary));
    parts.push("");
  }

  const matched = formatMatchedEntitiesForOperatorLlm(ctx);
  const threadLookupMd = formatThreadMessageLookupForOperatorLlm(ctx);
  const inboxFirst = shouldPrioritizeInboxThreadEvidence(ctx);

  if (inboxFirst && threadLookupMd) {
    parts.push(threadLookupMd);
    parts.push("");
  }

  if (matched) {
    parts.push(matched);
    parts.push("");
  }

  const corpusMd = formatOperatorCorpusSearchForOperatorLlm(ctx);
  if (corpusMd) {
    parts.push(corpusMd);
    parts.push("");
  }

  if (ctx.studioAnalysisSnapshot != null && !studioAnalysisFirst) {
    parts.push("## Studio analysis snapshot (from this studio’s data)");
    parts.push(formatStudioAnalysisSnapshotBlock(ctx.studioAnalysisSnapshot));
    parts.push("");
  }

  if (ctx.includeAppCatalogInOperatorPrompt) {
    parts.push("## App help / navigation (in-repo catalog — authoritative for *this* app only)");
    parts.push(
      "For **where to find** something, **how to** do something in the product, or **what a status/label means**, use **only** the JSON object below. " +
        "For **procedural** questions, pick the closest **`APP_PROCEDURAL_WORKFLOWS`** entry by `title`/`id`, follow **`steps` in order**, and quote control labels (e.g. **Edit**, **Save**, **Has draft**) **exactly** as written there — **do not** add steps, buttons, or tabs that are not in that workflow’s `steps` or `notes`. " +
        "If no workflow fits, say the catalog does not list a procedure for that and use **`APP_WORKFLOW_POINTERS`** / **`APP_WORKFLOW_HONESTY_NOTES`** or **Settings**/**Onboarding** — **do not** invent a flow. " +
        "**Grounding contract:** Every **`/path`**, dock **`label`**, quick-filter name, and status string you mention must appear in the JSON (or be an exact substring of a catalog string). If you are unsure, say so instead of guessing a label. " +
        "Respect **`groundingConfidence`**: **`high`** = full steps are fine; **`medium`** = stay coarse; **do not** fabricate fine-grained controls or tab names not in the workflow text. " +
        "For surfaces that are **not** built, use **`APP_WORKFLOW_HONESTY_NOTES`** and state the gap honestly. " +
        "If the question is about **generic software** (browsers, Git, other apps), say briefly you only help with **this** studio app and suggest **Settings** or **Onboarding** — **do not invent** UI.",
    );
    parts.push("```json");
    parts.push(clip(ctx.appCatalog.catalogJson, MAX_APP_CATALOG_JSON_CHARS));
    parts.push("```");
    parts.push(`*Catalog UTF-8 size: ${ctx.appCatalog.serializedUtf8Bytes} bytes, format v${ctx.appCatalog.version}.*`);
  } else {
    parts.push("## App help / navigation");
    parts.push(
      "*(Full in-repo app catalog **not** included for this question — the query was not treated as app-navigation, label, or in-product “where/how” help.)* " +
        "**Do not invent** routes, tab names, or status labels, and **do not** give step-by-step UI walkthroughs from memory. If the user needs grounded navigation or label meanings, they can rephrase (e.g. *“Where do I find drafts in the app?”*); otherwise use **Playbook**, **Durable memory**, **Global knowledge** excerpts, operator state, and **project / thread** lookup tools above — all **bounded**; cite what loaded.",
    );
  }
  parts.push("");

  if (!queueIntent) {
    parts.push("## Operator state (Today / Inbox — read-only snapshot)");
    parts.push(formatOperatorStateSummary(ctx.operatorStateSummary));
    parts.push("");
  }

  if (!inboxFirst && threadLookupMd) {
    parts.push(threadLookupMd);
    parts.push("");
  }

  const inquirySnap = formatInquiryCountSnapshotForOperatorLlm(ctx);
  if (inquirySnap) {
    parts.push(inquirySnap);
    parts.push("");
  }

  const calendarSnap = formatOperatorCalendarSnapshotForOperatorLlm(ctx);
  if (calendarSnap) {
    parts.push(calendarSnap);
    parts.push("");
  }

  if (ctx.focusedProjectSummary) {
    parts.push("## Focused project (summary — call operator_lookup_project_details for specifics)");
    parts.push(formatFocusedProjectSummaryBlock(ctx.focusedProjectSummary));
    parts.push("");
  }

  parts.push(formatPlaybookCoverageSummaryForOperatorLlm(ctx));
  parts.push("");

  parts.push("## Playbook (effective rules — domain-first, authoritative over memory / knowledge)");
  parts.push(
    "*(**Automation policy:** these lines are **effective** `playbook_rules` after **authorized case exception** merge for the **focused project** when applicable. " +
      OPERATOR_CONTEXT_AUTHORITY_PLAYBOOK_FIRST +
      " This list is **capped** for this prompt — **not** the entire policy graph. **(no active rules returned)** means the effective set is empty in this read, not “the studio has no playbook”. If the operator needs rules on a **specific topic** not listed, use **operator_lookup_playbook_rules**.)*",
  );
  parts.push("");
  const rules = ctx.playbookRules.slice(0, MAX_PLAYBOOK_RULES);
  if (rules.length === 0) {
    parts.push("- **Rules in prompt:** (no active rules returned)");
  } else {
    for (const r of rules) {
      const line = `- **${r.action_key}** (${r.topic}): ${clip(r.instruction ?? "", MAX_PLAYBOOK_INSTRUCTION_CHARS)}`;
      parts.push(line);
    }
  }
  parts.push("");

  parts.push("## Durable memory (read-only — domain-first, bounded `memories`)");
  parts.push(
    "*(**Slice — memory retrieval:** this block is a **keyword-ranked subset** for **this** turn only (caps per scope: studio + optional project/person when focus allows). It is **not** the full memory database, **not** proof of everything the studio ever saved. " +
      OPERATOR_CONTEXT_AUTHORITY_PLAYBOOK_FIRST +
      " **(none selected)** means **no rows matched this turn’s deterministic pick**, not “there are no memories”. For **memory-heavy** questions or when this list is too thin, call **operator_lookup_memories** (keywords + optional **scope**) or **operator_lookup_corpus** for tenant-wide light hits — then cite tool JSON.)*",
  );
  parts.push("");
  const selCount = ctx.retrievalLog.selectedMemoryIds?.length ?? 0;
  parts.push(
    `- **Selection contract:** up to **${MAX_MEMORY_SNIPPETS}** snippets in prompt · **selectedMemoryIds** this turn: **${selCount}** (see Retrieval debug).`,
  );
  parts.push("");
  const mem = ctx.selectedMemories.slice(0, MAX_MEMORY_SNIPPETS);
  if (mem.length === 0) {
    parts.push("- **Snippets:** (none selected)");
  } else {
    for (const m of mem) {
      parts.push(
        `- **${m.title}** (${m.type}): ${clip(`${m.summary}\n${m.full_content ?? ""}`, MAX_MEMORY_SNIPPET_CHARS)}`,
      );
    }
  }
  parts.push("");

  parts.push("## Global knowledge excerpts (tenant KB — domain-first, supporting reference only)");
  parts.push(
    "*(**Reference / background:** first-pass lines are **semantic** `knowledge_base` matches for **this** question — **capped** (**≤" +
      MAX_KB_ROWS +
      "** rows here), **not** the entire KB, **not** a complete studio reference corpus. **Durable memory** is for **saved notes**; **knowledge** here is **supporting** studio reference (e.g. brand voice, contract excerpts) only. " +
      OPERATOR_CONTEXT_AUTHORITY_PLAYBOOK_FIRST +
      " **(none retrieved)** means **no** match above the embedding threshold **in this read**, not “the KB is empty”. For **what does our KB say about…**, **brand voice**, **contract wording**, or other **reference** when this block is **thin or missing**, call **operator_lookup_knowledge** (bounded semantic rows) and cite tool JSON. Honor **project type discipline** when mapping generic KB text to a **specific** project.)*",
  );
  parts.push("");
  const kb = ctx.globalKnowledge.slice(0, MAX_KB_ROWS);
  if (kb.length === 0) {
    parts.push("- **Excerpts in prompt:** (none retrieved)");
  } else {
    for (const row of kb) {
      const r = row as Record<string, unknown>;
      const dt = String(r.document_type ?? "");
      const content = clip(String(r.content ?? ""), MAX_KB_CONTENT_CHARS);
      parts.push(`- **${dt}**: ${content}`);
    }
  }
  parts.push("");

  // Slice 4: do not render recent digest rows — they competed with the project tool path. `ctx.crmDigest` may still be loaded for compatibility.
  parts.push("## CRM digest (omitted in prompt — Slice 4)");
  parts.push(
    "*(**Slice 4** — the bounded **recent projects & people** list is **not** included in this prompt, so a project is **not** “in your Context” just because it is active in the studio. For **project-specific** CRM, follow **Project CRM — resolver vs detail (Slice 3)** in the system prompt and use **operator_lookup_projects** / **operator_lookup_project_details**. For **queue / what’s on my plate**, rely on **Operator state (Today / Inbox)** and the rest of the Context blocks, not a static digest list.)*",
  );
  parts.push("");

  parts.push("## Retrieval debug");
  parts.push("```json");
  parts.push(
    JSON.stringify({
      fingerprint: ctx.retrievalLog.queryDigest.fingerprint,
      scopesQueried: ctx.retrievalLog.scopesQueried,
      appCatalogUtf8Bytes: ctx.appCatalog.serializedUtf8Bytes,
      appCatalogInPrompt: ctx.includeAppCatalogInOperatorPrompt,
      studioAnalysisInPrompt: ctx.studioAnalysisSnapshot != null,
      studioAnalysisProjectCount: ctx.retrievalLog.studioAnalysisProjectCount,
      selectedMemoryIds: ctx.retrievalLog.selectedMemoryIds,
      globalKnowledgeRowCount: ctx.retrievalLog.globalKnowledgeRowCount,
      focus: ctx.retrievalLog.focus,
      entityResolution: ctx.retrievalLog.entityResolution,
      threadMessageLookup: ctx.retrievalLog.threadMessageLookup,
      threadMessageBodies: ctx.retrievalLog.threadMessageBodies,
      operatorQueueIntentMatched: ctx.retrievalLog.operatorQueueIntentMatched ?? false,
      inquiryCountSnapshot: ctx.retrievalLog.inquiryCountSnapshot,
      calendarSnapshot: ctx.retrievalLog.calendarSnapshot,
      readOnlyLookupTools: ctx.retrievalLog.readOnlyLookupTools,
      playbookCoverage: ctx.retrievalLog.playbookCoverage,
    }),
  );
  parts.push("```");

  return parts.join("\n");
}
