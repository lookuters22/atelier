import type { CrmSnapshot } from "./crmSnapshot.types.ts";

/** Thread / memory audience tiers for reply-side retrieval (project-type neutral). */
export type ThreadAudienceTier = "client_visible" | "internal_team" | "operator_only";

export type AgentContext = {
  photographerId: string;
  weddingId: string | null;
  threadId: string | null;
  replyChannel: "email" | "web" | "whatsapp";
  rawMessage: string;
  crmSnapshot: CrmSnapshot;
  recentMessages: Array<Record<string, unknown>>;
  threadSummary: string | null;
  /**
   * Distinct `thread_participants.person_id` for this thread (reply-mode person memory; Slice 4).
   * Empty when there is no thread or no linked participants.
   */
  replyModeParticipantPersonIds: string[];
  /**
   * `threads.audience_tier` when a thread is loaded; drives memory header + full-row gating for client-facing drafts.
   * Set by `buildAgentContext`; omitted in partial test fixtures (defaults to client_visible in hydration).
   */
  replyThreadAudienceTier?: ThreadAudienceTier;
  memoryHeaders: Array<{
    id: string;
    /** Null = tenant-wide memory; set when row is scoped to one wedding. */
    wedding_id: string | null;
    /** Set when `scope === 'person'` (`memories.person_id`). */
    person_id: string | null;
    /** Replaced-memory pointer for ranking exclusion (`memories.supersedes_memory_id` on the newer row). */
    supersedes_memory_id: string | null;
    /** When set, limits which reply contexts may load this memory; omitted/null = client-visible (legacy). */
    audience_source_tier?: ThreadAudienceTier | null;
    /** Production memory scope (`memories.scope`). */
    scope: "project" | "person" | "studio";
    type: string;
    title: string;
    summary: string;
  }>;
  selectedMemories: Array<{
    id: string;
    type: string;
    title: string;
    summary: string;
    full_content: string;
    /** From `memories.audience_source_tier`; used to re-filter after QA visibility overrides. */
    audience_source_tier?: ThreadAudienceTier | null;
  }>;
  globalKnowledge: Array<Record<string, unknown>>;
};

export type AgentResult<TFacts extends Record<string, unknown> = Record<string, unknown>> = {
  success: boolean;
  facts: TFacts;
  confidence: number;
  error: string | null;
};
