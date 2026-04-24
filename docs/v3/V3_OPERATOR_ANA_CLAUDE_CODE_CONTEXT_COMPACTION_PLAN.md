# Operator Ana Conversation Context Compaction Plan

Date: 2026-04-23

Status: **deferred / not done**. Revised after code review against:

- `C:\Users\Despot\Desktop\wedding`
- `C:\Users\Despot\Downloads\claude-code-main`

Verdict: **measure first; do not build persistent compaction yet.**

This work is intentionally parked. Do not implement the slices in this file until higher-priority real-thread / wedding-manager gaps are handled and we have telemetry showing Ana conversation continuity is a real bottleneck.

The first draft correctly mapped Claude Code's context model, but it overbuilt the Ana adaptation. Ana currently sends at most 3 turn pairs / 6000 chars of browser-only conversation history. The bigger token cost is the server-built Context block, not conversation memory. We should lock down the current behavior, add telemetry, then optimize prompt/context ordering before adding new DB tables.

---

## 1. What Claude Code Actually Proves

Claude Code is a strong example of **active context projection**, not a reason to immediately add transcript tables to Ana.

Claude Code pattern:

1. Persist full transcript separately.
2. Send only an active view to the LLM.
3. Start from messages after the latest compact boundary.
4. Replace huge tool/file results with previews/pointers.
5. Estimate context fullness from API usage + new messages.
6. Compact only when the active context approaches a large model window.

Source anchors:

- `C:\Users\Despot\Downloads\claude-code-main\src\query.ts`: creates `messagesForQuery` from `getMessagesAfterCompactBoundary(messages)`, then applies tool-result budgeting and compaction checks before `callModel`.
- `C:\Users\Despot\Downloads\claude-code-main\src\services\compact\autoCompact.ts`: defines effective window, autocompact threshold, manual threshold, and failure circuit breaker.
- `C:\Users\Despot\Downloads\claude-code-main\src\services\compact\compact.ts`: LLM-based summary compaction, compact boundary creation, prompt-too-long retry.
- `C:\Users\Despot\Downloads\claude-code-main\src\utils\tokens.ts`: token fullness estimation.
- `C:\Users\Despot\Downloads\claude-code-main\src\utils\toolResultStorage.ts`: large tool result replacement with frozen decisions.
- `C:\Users\Despot\Downloads\claude-code-main\src\utils\sessionStorage.ts`: transcript persistence separate from prompt assembly.

Lessons to copy:

- Keep full history separate from active LLM context.
- Keep recent turns verbatim only while useful.
- Add compact boundaries only when there is evidence of pressure.
- Add a circuit breaker if compaction fails.
- Never store/send full raw tool/retrieval payloads when a pointer is enough.

Lessons not to copy yet:

- 200k/1M-context assumptions.
- dual compaction paths.
- microcompact/snip/context-collapse machinery.
- persistent tool result storage.
- branch/fork semantics for specialist modes.
- auto memory/session-memory subsystems.

---

## 2. Ana Current State

Ana already has a bounded recent-conversation layer.

Files:

- `src/components/SupportAssistantWidget.tsx`
- `src/lib/operatorAnaWidgetConversation.ts`
- `src/lib/operatorAnaWidgetConversationBounds.ts`
- `supabase/functions/_shared/operatorStudioAssistant/validateOperatorStudioAssistantConversation.ts`
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts`

Current behavior:

- Widget stores chat lines in React state only.
- Before a turn, it extracts completed user/assistant pairs.
- It keeps only same-focus turns.
- It sends at most `OPERATOR_ANA_WIDGET_CONVERSATION_MAX_TURN_PAIRS = 3`.
- User turn max: 800 chars.
- Assistant turn max: 1200 chars.
- Total conversation max: 6000 chars.
- Backend mirrors validation and trimming.
- Backend injects these messages before the fresh formatted Context block.
- System prompt adds `OPERATOR_STUDIO_ASSISTANT_RECENT_SESSION_ADDENDUM` only when conversation exists.
- Fresh facts come from `buildAssistantContext`; conversation is only for pronouns/follow-ups.
- `carryForward` already preserves selected ids/pointers between turns without storing a transcript.

This is already a good v0 for Ana. The unanswered question is whether operators actually hit its limits.

---

## 3. Revised Direction

Do not add `ana_conversation_sessions` or `ana_conversation_messages` yet.

Do not add a session brief yet.

Do not add deterministic compaction yet.

First:

1. Lock current recent-conversation behavior with tests.
2. Add structured telemetry for real usage.
3. Refactor prompt/context ordering for better provider prompt caching and lower cost.
4. Review telemetry after production use.

Only if telemetry shows real sessions exceeding the current ceiling or users experiencing "Ana forgot" should we add persistence/compaction.

---

## 4. Why The First Draft Was Too Big

Conversation history is not the main cost lever.

Rough cost shape:

- system prompt: large but stable,
- formatted Context block: often much larger than conversation,
- app catalog / studio analysis blocks can dominate,
- conversation history ceiling is only around 6000 chars / roughly 1500 tokens.

Therefore compaction of history addresses the smaller cost surface. Prompt ordering and context gating are likely higher-leverage.

Server-side transcript persistence also creates product/security work:

- retention policy,
- deletion policy,
- RLS tests,
- PII handling,
- browser refresh/session lifecycle,
- multi-tab races,
- interaction with `operator_assistant_write_audit`,
- possible drift with `carryForward`.

That work may become worthwhile later, but not before telemetry.

---

## 5. Revised Slice Plan

### Slice 1 — Lock Current Recent Conversation Contract

Goal: test and document what Ana already does.

Files:

- `src/lib/operatorAnaWidgetConversation.ts`
- `src/lib/operatorAnaWidgetConversationBounds.ts`
- `src/lib/operatorAnaWidgetConversation.test.ts`
- `supabase/functions/_shared/operatorStudioAssistant/validateOperatorStudioAssistantConversation.ts`
- related tests only if needed

Work:

- Ensure tests cover completed pair extraction, in-flight assistant exclusion, focus filtering, max pairs, per-message clipping, total char trimming, backend role validation, backend too-many-messages validation, and backend clipping parity.
- Add a concise comment explaining this is **recent verbatim turn context**, not persistent memory.

No behavior change.

### Slice 2 — Add Per-Turn Telemetry

Goal: measure real Ana session/context pressure before adding persistence.

Primary file:

- `supabase/functions/_shared/operatorStudioAssistant/handleOperatorStudioAssistantPost.ts`

Likely helper/test files if needed:

- backend handler tests

Log one JSON line per turn after context is built and before the LLM call:

- `type: "operator_ana_turn_telemetry"`
- `photographerId`
- retrieval fingerprint
- conversation message count
- conversation turn pairs
- conversation chars
- context chars
- query text chars
- carry-forward present
- carry-forward approximate age if available
- specialist mode
- focused wedding/person present

No persistence. No feature flag needed. No LLM behavior change.

### Slice 3 — Prompt/Context Ordering For Cache Friendliness

Goal: reduce input cost before solving a smaller conversation-history problem.

Files to inspect:

- `supabase/functions/_shared/operatorStudioAssistant/formatAssistantContextForOperatorLlm.ts`
- `supabase/functions/_shared/operatorStudioAssistant/formatAssistantContextForOperatorLlm.test.ts`
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts`

Work:

- Identify stable blocks vs volatile blocks.
- Move stable, repeated blocks earlier where safe:
  - studio profile,
  - playbook,
  - app help/catalog,
  - invoice setup/offer setup if stable enough.
- Keep volatile/current-turn blocks later:
  - query text,
  - queue snapshots,
  - thread/message lookup,
  - weather/calendar,
  - tool/corpus query-specific hits.
- Do not change semantics.
- Preserve tests/goldens.

Rationale: provider prompt caching benefits from stable prefixes. This is likely a bigger cost win than conversation compaction.

### Stop Point

After slices 1-3, observe logs in production for 2-4 weeks.

Questions to answer from logs:

- How often do users send more than 2 turn pairs?
- How often does conversation hit 6000 chars?
- Which specialist modes get real multi-turn usage?
- Is context size or conversation size the dominant input cost?
- Does carry-forward already solve most follow-ups?

---

## 6. Conditional Future Slices

Only if telemetry proves a real gap:

### Future Slice 4 — Raise Conversation Caps + Extend Carry-Forward

Possible changes:

- `MAX_TURN_PAIRS`: 3 -> 5.
- `MAX_TOTAL_CHARS`: 6000 -> 9000.
- Extend `carryForward` with small, non-PII-ish hints:
  - `lastOperatorGoalHint`
  - `lastProposedActionKinds`
  - maybe last surfaced thread/project ids if not already carried.

Still no DB.

### Future Slice 5 — Minimal Server Transcript Table

Only if browser-only recent turns are not enough.

Prefer one table first, not two:

- `ana_conversation_messages`
- columns: `id`, `photographer_id`, `session_id`, `role`, `content`, `mode`, `retrieval_fingerprint`, `created_at`

No separate `session_brief` column yet.

Important requirements:

- retention/deletion policy before migration ships,
- tenant RLS test,
- service-role writes only,
- do not store formatted Context or raw tool payloads.

### Future Slice 6 — LLM Summary Boundary

Only if transcript rows become useful and session length still exceeds active-view budget.

Use one LLM summarizer path, not deterministic + LLM dual paths.

Rules:

- summarize old transcript rows into one inline summary/boundary message,
- keep last N verbatim turns,
- no tools,
- no raw Context,
- summary max small,
- failure circuit breaker after 3 attempts.

---

## 7. What Not To Do

- Do not use the existing `memories` table for Ana chat continuity.
- Do not persist transcripts before telemetry proves value.
- Do not create both `ana_conversation_sessions` and `ana_conversation_messages` as the next step.
- Do not fork sessions per specialist mode; if future persistence exists, tag mode and filter.
- Do not store full formatted Supabase Context.
- Do not store raw message bodies/tool output in transcript.
- Do not add deterministic compaction now.
- Do not combine Gemini/OpenAI provider changes with this work.

---

## 8. First Composer Prompt

Use this first:

```text
Implement Slice 1 from docs/v3/V3_OPERATOR_ANA_CLAUDE_CODE_CONTEXT_COMPACTION_PLAN.md.

Goal:
Lock down the current Ana widget recent-conversation contract before adding telemetry, persistence, or compaction.

Do not add DB tables, session ids, summarizers, new LLM behavior, or prompt ordering changes.
Do not touch Gemini/provider code, search retrieval, memories, or specialist gates.

Inspect:
- src/lib/operatorAnaWidgetConversation.ts
- src/lib/operatorAnaWidgetConversationBounds.ts
- src/lib/operatorAnaWidgetConversation.test.ts
- supabase/functions/_shared/operatorStudioAssistant/validateOperatorStudioAssistantConversation.ts
- related tests only if needed

Tasks:
1. Ensure tests cover:
   - only completed user/assistant pairs are extracted;
   - in-flight assistant rows are ignored;
   - trailing user-only turn is dropped;
   - turns from a different focus are dropped;
   - max turn pairs is enforced;
   - user/assistant per-message clipping is enforced;
   - total conversation char budget drops oldest pairs;
   - backend validation rejects malformed role order;
   - backend validation rejects too many messages;
   - backend validation mirrors client clipping and total budget.
2. Add a concise comment/docstring in the conversation bounds/helper files explaining that this is the current "recent verbatim turns" layer, not persistent memory or durable studio facts.
3. If existing tests already cover an item, do not duplicate heavily; add only missing coverage.

Acceptance:
- Vitest subset for operatorAnaWidgetConversation and validateOperatorStudioAssistantConversation passes.
- No runtime behavior change except clearer comments/tests.
- Report exactly what tests/comments were added.
```

After Slice 1, the next prompt should be Slice 2 telemetry, not DB sessions.
