# V3 Production Readiness Slice 3

## Name

Browser Crash

## Goal

Reduce unnecessary client reloads, background polling, and oversized fetches so the dashboard stays responsive as tenant data grows.

## Canonical References

Read these first:

1. [ARCHITECTURE.md](C:/Users/Despot/Desktop/wedding/docs/v3/ARCHITECTURE.md)
2. [DATABASE_SCHEMA.md](C:/Users/Despot/Desktop/wedding/docs/v3/DATABASE_SCHEMA.md)
3. [V3_PRODUCTION_READINESS_ATTACK_PLAN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_PRODUCTION_READINESS_ATTACK_PLAN.md)
4. [V3_PRODUCTION_READINESS_SLICE2_DATABASE_MELTDOWN.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_PRODUCTION_READINESS_SLICE2_DATABASE_MELTDOWN.md)

This slice should build on the stabilized backend/query layer from the earlier slices.

## Scope

This slice covers exactly four areas:

1. global refetch storm removal
2. polling reduction
3. lazy-loading of expensive Gmail HTML
4. pagination and rendering safety for large lists

This slice does **not** include a full dashboard redesign or a migration to a different client-state library unless explicitly needed.

## Why This Slice Exists

The current frontend can generate a large amount of unnecessary traffic and rendering churn.

Current evidence includes:

- one global data-change event fanout
- broad tenant list reads with no pagination
- eager Gmail HTML fetches for inbox rows
- multiple short polling loops in Settings and escalation UI

Left alone, this can become:

- browser jank
- duplicate Supabase traffic
- slow dashboard loads
- hidden background cost

## Current Evidence In Repo

### Global Refetch Storm

Relevant files:

- `src/layouts/DashboardLayout.tsx`
- `src/lib/events.ts`

Current visible truth:

- `DashboardLayout` listens to realtime changes on `drafts`, `threads`, `messages`, `weddings`, and `tasks`
- every change calls `fireDataChanged()`
- many hooks subscribe to the same global event and refetch their own full datasets

This means one small mutation can fan out into whole-dashboard reloads.

### Overfetching / Unbounded Lists

Relevant files:

- `src/hooks/useWeddings.ts`
- `src/hooks/useUnfiledInbox.ts`
- `src/hooks/useWeddingThreads.ts`

Current visible truth:

- `useWeddings` fetches all weddings for the tenant
- `useUnfiledInbox` fetches all inbox threads plus all active weddings
- `useWeddingThreads` fetches the full message history for the selected thread

### Gmail HTML Eager Loading

Relevant files:

- `src/hooks/useUnfiledInbox.ts`
- `src/lib/gmailImportMessageMetadata.ts`

Current visible truth:

- after inbox rows load, the hook eagerly fetches sanitized HTML for every row that has `gmailRenderHtmlRef`
- helper creates a signed URL and downloads the HTML body immediately

### Polling Pressure

Relevant files:

- `src/pages/settings/SettingsHubPage.tsx`
- `src/components/escalations/EscalationResolutionPanel.tsx`

Current visible truth in `SettingsHubPage.tsx`:

- 2500ms Gmail label cache polling
- 12000ms staging/group polling
- 2500ms faster approval-progress polling
- 3000ms post-import watch loop
- global invalidation also triggers staging reload

## Required Implementation Rules

### 1. Do Not Rewrite The Entire Data Layer

You do not need a full React Query or SWR migration in this slice unless a very small scoped adoption is the safest path.

The priority is reducing waste, not replacing every hook pattern.

### 2. Prefer Scoped Invalidation Over Global Fanout

One mutation should only invalidate the surfaces that care about that entity.

### 3. Keep UI Behavior Stable

- do not redesign the inbox
- do not redesign settings
- do not redesign project views

Focus on fetch behavior, not cosmetic changes.

### 4. Break Up Large Hook Refactors

If a hook is becoming too large:

- extract fetch helpers
- extract pagination helpers
- extract HTML-loader helpers

Do not turn one hook into a larger untestable blob.

## Work Items

### A. Replace The Global Invalidation Bus

Tasks:

1. replace the single `atelier:data-changed` fanout with narrower invalidation scopes
2. map hooks to the entities they actually depend on
3. make task changes refresh tasks, not every surface
4. make approval changes refresh approval-related surfaces, not all project data

Expected direction:

- entity-scoped invalidation
- deduped refetches
- fewer whole-list reloads

Do not:

- keep a global event and just add more subscribers
- force all pages to refetch on every mutation

### B. Remove Aggressive Polling

Tasks:

1. collapse overlapping Settings pollers
2. pause polling when the tab is hidden if polling remains necessary
3. replace 2-second escalation polling with a more targeted strategy
4. prefer realtime or job-row-specific refreshes where already supported

Expected direction:

- one concern should have one refresh strategy
- polling should be time-bounded and justified

### C. Lazy-Load Gmail HTML

Tasks:

1. stop fetching HTML artifacts for every inbox row on initial load
2. load HTML only when the user opens or previews the relevant thread/message
3. cache loaded HTML per message or thread

Expected direction:

- inbox list stays lightweight
- signed URL generation only happens when needed

### D. Add Pagination And Rendering Safety

Tasks:

1. paginate weddings
2. paginate inbox thread lists
3. paginate or incrementally load long message histories
4. add virtualization only where list size justifies it
5. add route or pane error boundaries if a narrow implementation is available

Expected direction:

- large tenants do not require full dataset loads
- the browser is not forced to render huge lists at once

## File Targets To Inspect First

- `src/layouts/DashboardLayout.tsx`
- `src/lib/events.ts`
- `src/hooks/useUnfiledInbox.ts`
- `src/hooks/useWeddings.ts`
- `src/hooks/useWeddingThreads.ts`
- `src/pages/settings/SettingsHubPage.tsx`
- `src/components/escalations/EscalationResolutionPanel.tsx`
- `src/lib/gmailImportMessageMetadata.ts`

## Suggested Change Shape

Preferred implementation pattern:

1. introduce scoped invalidation helpers
2. update the highest-noise subscribers first
3. move Gmail HTML loading behind an explicit UI action
4. add pagination to the biggest list surfaces
5. only then consider optional virtualization

## Acceptance Criteria

This slice is complete when all of the following are true:

1. one task mutation no longer causes whole-dashboard reloads
2. inbox initial load does not fetch Gmail HTML artifacts for every row
3. stacked short-interval pollers are removed or sharply reduced
4. large wedding, inbox, and message datasets no longer require full eager loads
5. the dashboard remains responsive under larger tenant datasets

## Verification Checklist

1. mutate a task and confirm only task-relevant surfaces refresh
2. mutate a draft and confirm inbox/weddings do not all reload unless truly needed
3. load inbox and confirm HTML artifacts are fetched only on demand
4. leave Settings open and inspect network behavior for reduced background churn
5. test a tenant with large lists and confirm pagination or incremental loading works

## Out Of Scope

- replacing the entire frontend state stack
- redesigning dashboard information architecture
- changing the canonical backend schema
- AI prompt or model behavior changes unrelated to frontend fetch pressure
