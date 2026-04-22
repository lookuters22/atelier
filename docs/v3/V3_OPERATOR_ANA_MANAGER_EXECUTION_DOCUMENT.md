# V3 Operator Ana - Manager Execution Document

> Status: Active long-term execution document.
> Scope: Internal Ana operator widget only.
> Audience: Humans, Claude, Composer, and future implementation agents.
> Purpose: Turn the "Ana as the studio manager" vision into a grounded execution plan that stays compatible with the actual repo, keeps fast-path latency low, and breaks work into small, Composer-safe slices.

---

## 1. Why this doc exists

Ana is no longer just a support widget.

The real target is:

- a fast conversational manager for day-to-day operator work
- a set of explicit specialist modes for heavier workflows
- an approval surface for higher-risk writes

We need one document that does all of the following at once:

- preserves the full long-term product direction
- stays grounded in the real app, schema, and current codebase
- makes future slices small enough for Composer / Vibecoder to implement safely
- prevents us from adding one-off hacks that later block invoice/package/search/editing work
- distinguishes what belongs on the default fast path from what should be an explicit heavier mode

This doc is intentionally more execution-oriented than a product memo and more future-oriented than a single slice plan.

---

## 2. Relationship to existing docs

This document does not replace the existing Ana docs.
It sits above them and turns them into a practical long-term execution spine.

Primary companion docs:

- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_FULL_CAPABILITY_EXECUTION_PACKET.md`
- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_WIDGET_CAPABILITY_PLAN.md`
- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_WIDGET_CAPABILITY_SLICES.md`
- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_DOMAIN_FIRST_RETRIEVAL_PLAN.md`
- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_PROJECT_TYPE_SEMANTICS_SLICE.md`
- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_FOLLOW_UP_AND_CARRY_FORWARD_SLICE.md`
- `C:\Users\Despot\Desktop\wedding\docs\v3\V3_OPERATOR_ANA_STREAMING_IMPLEMENTATION_SLICES.md`
- `C:\Users\Despot\Desktop\wedding\docs\v3\DATABASE_SCHEMA.md`

If there is a conflict:

- architecture / repo truth comes from the code and the source docs above
- long-term capability framing and slice sequencing come from this document

---

## 3. Current repo reality we should assume

These are already landed or treated as baseline:

### Already landed

- domain-first projects retrieval foundation
- project resolver/detail split
- focused project summary and focused project facts work
- project-type semantics enforcement
- carry-forward transport + advisory behavior
- inquiry-count continuity follow-up fix
- thread title/body honesty fix
- thread retrieval quality fix for fuzzy inbox queries
- deterministic triage v1
- calendar hardening
- app-help grounding completion
- bounded thread message-body lookup
- operator-state / inbox-state refinement
- streaming infrastructure and multiple streaming fixes

### Important product / code constraints

- Ana currently runs as a fast helper widget
- current main LLM loop uses `gpt-4.1-mini`
- some future high-value surfaces still live in client-side storage or UI-only shells
- specialist write/edit capabilities are blocked until their data is actually server-readable and patchable

### Known product blockers for later manager modes

- offer builder data is currently local/browser-oriented, not a server-side structured store Ana can safely read/write
- invoice setup/template surfaces are not yet a safe structured server-side editing contract
- booking links / richer scheduling flows are not fully backed by domain storage yet
- there is no rule-candidate review dashboard yet, which blocks the policy-learning loop

These are product blockers first, not prompt-engineering problems.

---

## 4. The three-layer Ana model

Ana should be designed as three concentric layers, not one giant assistant.

### Layer 1 - Conversational Ana (fast path)

This is the default widget path.

Properties:

- target latency: normal operator turns stay fast
- one context build
- deterministic retrieval where possible
- bounded tool use
- lightweight follow-up handling
- mostly read-only plus some simple, reversible writes under approval

This is where everyday manager behavior lives:

- CRM reads
- inbox/thread questions
- inquiry counts
- calendar questions
- operator queue / Today questions
- app-help
- studio analysis first cut
- simple direct actions with approval/undo

### Layer 2 - Specialist modes (slow path, explicit)

These are heavier, narrower workflows.
They must be explicitly entered from the relevant surface or clearly invoked by the operator.

Examples:

- invoice editor mode
- offer/package builder mode
- escalation resolver mode
- deep search / investigation mode
- rule authoring / policy audit mode
- bulk triage mode
- draft refinement bridge mode

Properties:

- slower is acceptable
- different context shape
- different tool set
- often structured patch outputs
- not auto-entered just because chat text resembles the mode

### Layer 3 - Approval surface

This is the trust layer.

Higher-risk writes should not become silent direct actions.
They should become:

- proposal
- clear diff / scope
- explicit confirmation
- audit trail
- ideally undo

This is required for:

- policy changes
- financial changes
- invoice / offer edits
- calendar writes with conflicts
- case exceptions
- rule promotion

---

## 5. Core architecture principles to lock in now

These principles should shape all future Ana work.

### 5.1 Answer / Propose / Act

Every capability should explicitly fall into one of these modes:

- `answer`: read-only answer from evidence
- `propose`: produce a structured suggested change for operator confirmation
- `act`: perform a bounded write directly, ideally with approval chip and undo

Do not create muddy middle states.

### 5.2 Domain-first retrieval with bounded contracts

Every major domain should have:

- a dedicated retrieval surface
- a bounded result shape
- a clear statement of what the evidence is and is not

Do not collapse everything into one generic "search anything" fast-path tool.

### 5.3 Specialist modes are explicit, not guessed

Do not try to infer invoice editing, offer editing, or deep investigation from normal chat whenever possible.

Preferred model:

- operator is in a relevant surface
- clicks "Ask Ana" / "Send to Ana"
- Ana opens in a named mode with the right context and tool contract

### 5.4 Structured patches, not raw HTML / freeform writes

For templates and builders:

- Ana should emit structured patches
- runtime validates and previews them
- operator confirms before save

Do not let Ana free-write raw HTML or arbitrary text blobs into product-critical surfaces.

### 5.5 Telemetry before classifier

Before adding any LLM classifier or more complex routing layer:

- log intent shapes
- log triage verdicts
- log tool usage
- log failure modes

Only add heavier routing if deterministic rules and telemetry clearly fail.

### 5.6 Persona-writer firewall holds

Ana must not write client-facing text directly.

Ana may:

- inspect drafts
- explain drafts
- refine internal operator understanding
- hand work to a persona-writer flow

But Ana herself should not become the client-facing sender.

### 5.7 Product storage gaps must be solved as product work

If a capability depends on data that only lives in:

- localStorage
- browser-only state
- non-versioned editor state

then the next move is product/storage work first, not Ana prompt work.

### 5.8 Small slices beat clever slices

This document is explicitly written with Vibecoder / Composer constraints in mind.

That means:

- one small slice at a time
- small write sets
- no hidden prerequisites inside prompts
- explicit out-of-scope boundaries
- no giant "implement the vision" asks

---

## 6. Capability map

This is the long-term Ana capability map, grounded in the actual app direction.

For each domain:

- what Ana should eventually do
- where it belongs
- what blocks it today

### A. Retrieval and search

Ana should eventually:

- find any relevant fact in the studio data
- distinguish source types clearly
- return bounded, trustworthy evidence
- later support cross-domain investigation

Belongs to:

- fast path for bounded domain reads
- specialist mode for broader investigation

Blocks today:

- missing universal cross-domain search surface
- incomplete document/body access across all source types

### B. CRM / project management

Ana should eventually:

- read full project truth
- answer project detail questions accurately
- edit bounded project fields under approval
- use project-scoped memories and context correctly

Belongs to:

- fast path for reads
- fast path with approval for simple writes

Blocks today:

- some writes still only exist as proposals

### C. Inbox / communication intelligence

Ana should eventually:

- explain what a thread says
- summarize the right thread
- explain why a draft/escalation exists
- connect related thread history

Belongs to:

- fast path for thread reads and bounded summaries
- specialist mode for escalation resolution / bulk inbox work

Blocks today:

- still no full deep-search inbox mode
- escalation companion flow still immature

### D. Calendar / scheduling

Ana should eventually:

- answer schedule questions
- create/move/delete events under confirmation
- propose slots
- later handle booking-link workflows

Belongs to:

- fast path for read questions
- fast path with approval for simple writes

Blocks today:

- richer scheduling and booking-link product support is not complete
- external sync is a separate product problem

### E. Operator state / queue management

Ana should eventually:

- answer what needs attention
- explain queue composition
- prioritize work from real evidence
- later support bulk triage

Belongs to:

- fast path for state and prioritization
- specialist mode for bulk actions

Blocks today:

- urgency is still largely count-driven, not full business-priority aware

### F. Pricing / packages / offers

Ana should eventually:

- inspect package structure
- edit offer/package blocks
- change pricing and composition
- produce structured offer patches

Belongs to:

- specialist mode

Blocks today:

- offer builder storage is not yet a safe server-side structured contract

### G. Invoices / payment operations

Ana should eventually:

- inspect invoice templates and generated invoices
- adjust wording, line items, fees, payment structure
- support payment operations under approval

Belongs to:

- specialist mode

Blocks today:

- invoice setup/template editing is not yet a safe server-side structured patch contract
- payment operations and ledger model are incomplete

### H. Knowledge / playbook / policy

Ana should eventually:

- explain rules
- propose rule candidates
- help author and review policy
- surface conflicts and missing coverage

Belongs to:

- fast path for explanations and small proposals
- specialist mode for rule authoring/audit

Blocks today:

- missing rule-candidate review dashboard is a real product gap

### I. Workflow execution / state changes

Ana should eventually:

- create tasks
- complete tasks
- save memories
- add case exceptions
- perform bounded reversible writes

Belongs to:

- fast path with approval/undo

Blocks today:

- some actions still only exist as proposals, not direct managed writes

### J. Editing / generation modes

Ana should eventually:

- orchestrate refinement of drafts
- edit templates through structured patches
- help rewrite operational copy for internal use

Belongs to:

- specialist modes

Blocks today:

- no general structured patch framework across all editable surfaces

### K. Studio analysis / business insight

Ana should eventually:

- summarize studio performance
- explain trends from real data
- answer pricing/conversion/performance questions

Belongs to:

- fast path for bounded snapshot analysis
- specialist mode for deeper investigation

Blocks today:

- analytics are still snapshot-limited and not full historical analysis

### L. File / template / document manipulation

Ana should eventually:

- inspect document/template content
- edit structured template data
- support controlled versioned changes

Belongs to:

- specialist modes only

Blocks today:

- document/template editing contracts are incomplete
- versioning/undo for these surfaces needs product support

---

## 7. Fast path vs specialist modes

This split should be preserved aggressively.

### Fast path capabilities

These should remain in the default low-latency Ana path:

- project CRM reads
- inbox/thread metadata + bounded body reads
- inquiry counts
- calendar reads
- operator queue / Today state
- app-help
- studio analysis first cut
- follow-up handling
- simple direct writes with approval/undo:
  - task create/complete
  - memory save
  - some simple project/calendar state updates

### Specialist modes

These should be explicit heavier modes:

- invoice editor mode
- offer/package builder mode
- deep search / investigation mode
- escalation resolver mode
- rule authoring / policy audit mode
- bulk triage mode
- draft refinement bridge mode
- later document/template manipulation modes

### Hard rule

Do not quietly move a specialist-mode capability into the fast path just because the user asks for it in chat.

If the mode is complex enough to require:

- larger context
- structured patches
- diff preview
- multiple validations
- slower reasoning

it belongs in a specialist mode.

---

## 8. Product blockers and prerequisite work

These are not optional.
If we ignore them, future Ana slices will hallucinate around missing foundations.

### P0 product blockers

These must be acknowledged now:

1. Offer builder state needs server-side storage and a structured patchable representation.
2. Invoice template/setup state needs server-side storage and a structured patchable representation.
3. Rule-candidate review dashboard needs to exist so Ana-generated rule learning has a human review loop.
4. Risky writes need durable audit + preferably undo.

### P1 product enablers

These strongly improve later Ana capability:

1. Structured diff preview surfaces for template edits.
2. Booking-link / scheduling product support.
3. Better analytics surfaces for deeper studio analysis.
4. Better escalation tooling for Ana-assisted resolution.

Do not frame these as "future prompt work."
They are product/platform prerequisites.

---

## 9. Vibecoder / Composer slice rules

This section is here specifically to keep future implementation prompts safe and low-hallucination.

### Every slice should:

- target one capability or one narrow improvement only
- list exact files to inspect first
- list exact docs to read first
- explicitly state what is already landed and must not be redone
- clearly separate in-scope from out-of-scope
- avoid hidden architecture changes
- include required tests
- include a deliverable summary format

### Every slice should avoid:

- mixing retrieval + prompt + write + UI + product-storage changes unless that is absolutely necessary
- inventing new broad abstractions without immediate usage
- changing multiple capability families at once
- "while we are here" refactors
- adding new top-level triage domains casually

### Preferred slice size

Good slices look like:

- 1 new pure helper module + 2–4 wiring edits + tests
- one retrieval-quality improvement + tests
- one formatter/prompt honesty improvement + tests
- one bounded read tool + tests

Bad slices look like:

- "implement invoice editing support"
- "build search everything"
- "make Ana the manager"
- "refactor all routing around a new unified engine"

---

## 10. Long-term phased roadmap

This is the recommended phased order.

### Phase 1 - Harden the fast advisor

Goal:
Make the existing fast path trustworthy across core operator domains.

Representative scope:

- retrieval quality fixes
- honesty fixes
- deterministic routing/triage
- queue/state improvements
- calendar/app-help hardening
- bounded thread body access
- studio analysis first cut hardening

Exit condition:

- core reads are trustworthy enough that operators use Ana daily without feeling like she guesses

### Phase 2 - Promote safe writes

Goal:
Move selected low-risk actions from "propose only" into "direct managed action with approval/undo."

Representative scope:

- task create/complete
- memory save
- some simple project updates
- some simple calendar writes
- better approval chip behavior
- audit/undo hardening

Exit condition:

- Ana starts behaving like a manager, not just an explainer

### Phase 3 - Specialist mode foundations

Goal:
Create the infrastructure and product surfaces required for heavier modes.

Representative scope:

- rule-candidate review dashboard
- server-side offer storage and structured representation
- server-side invoice template/setup storage and structured representation
- structured patch contracts
- explicit specialist-mode entry points from the UI

Exit condition:

- heavy edit workflows are product-ready for Ana integration

### Phase 4 - Specialist modes

Goal:
Add powerful, explicit heavier workflows safely.

Representative scope:

- offer builder mode
- invoice editor mode
- escalation resolver mode
- bulk triage mode
- rule authoring / audit mode
- deep search mode

Exit condition:

- Ana can handle important specialized operator work without polluting the fast path

### Phase 5 - Manager-grade operations

Goal:
Turn Ana from a competent assistant into a true operating layer.

Representative scope:

- broader workflow orchestration through explicit operator approval
- directory dedupe / merge proposals
- payment ops once product supports it
- richer predictive / analytical operator support

Exit condition:

- Ana is a real operational manager, not just a retrieval/chat surface

---

## 11. Recommended slice backlog

This is the practical backlog shape to use after the currently active hardening work.

### Track F - Fast path completion

- F1: studio profile grounding v1 (read-only capability boundary from `studio_business_profiles` + key `photographers.settings`)
- F2: safe write promotion for memories
- F3: simple calendar write proposal/confirmation path
- F4: draft-inspection / "why did this draft happen?" read path
- F5: queue urgency refinement
- F6: studio profile update path only after review/apply UI + validated RPC exist

### Track P - Product enablers

- P1: offer builder server-side storage fix/deploy (migration-safety fix before rollout)
- P2: invoice template/setup server-side storage foundation
- P3: structured patch contract for builder/template surfaces
- P4: audit + undo infrastructure for Ana-originated writes
- P5: studio-profile review/apply surface for future Ana-proposed business-profile changes

### Track S - Specialist modes

- S1: escalation resolver mode
- S2: offer builder specialist mode
- S3: invoice editor specialist mode
- S4: deep search / investigation mode
- S5: rule authoring / audit mode
- S6: bulk triage mode

These should become concrete slice docs only when the prerequisite layer is ready.

### Already landed from this backlog

These are no longer pending and should be treated as baseline:

- studio analysis first-cut hardening
- safe write promotion for tasks
- rule-candidate review dashboard foundation

---

## 12. Strong opinions / non-goals

These are deliberate constraints.

### We should do

- small bounded slices
- domain-first retrieval
- specialist modes entered explicitly
- structured patch workflows
- approval and undo for risky writes
- product-storage migrations before assistant edits

### We should not do

- multi-agent orchestration
- generic "search everything" fast-path tool
- always-on classifier LLM call before every turn
- raw HTML editing from chat
- letting Ana directly write client-facing text
- using Ana to paper over missing product storage or missing review surfaces

---

## 13. What future Composer prompts should assume

When using this document to drive future implementation:

1. Reference this doc plus the specific source docs for the relevant domain.
2. State whether the slice belongs to:
   - fast path
   - product enabler
   - specialist mode
3. State the prerequisite product/storage assumptions.
4. Tell Composer exactly which layer is being touched.
5. Keep slices narrow even if the long-term capability family is large.

This is the key operational rule:

**Plan for the whole manager now, but implement one trustworthy surface at a time.**

---

## 14. Immediate next-use guidance

Use this document when:

- deciding what family of capability Ana should cover next
- deciding whether a new request belongs on fast path or specialist mode
- deciding whether the blocker is product/storage vs assistant logic
- writing future Composer prompts

Do not use this document as a direct implementation prompt by itself.

Instead:

- read this document
- choose one slice
- write a narrow implementation prompt against that slice only
