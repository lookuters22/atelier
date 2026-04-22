# Real Threads Analysis — Issues Found & Proposals

**Date:** 2026-04-22
**Scope:** Consolidated findings from 8 real project threads (inquiry → delivery) analysed independently. Purpose: validate the Phase 1 memory plan in [`MEMORIES_SYSTEM_VERDICT_AND_THREAD_ANALYSIS_CONTEXT.md`](./MEMORIES_SYSTEM_VERDICT_AND_THREAD_ANALYSIS_CONTEXT.md) against what actually happens in the wild, surface issues memory alone cannot solve, and propose the smallest set of adjacent systems that close the remaining gaps.

**Framing:** The product is a photographer + videographer CRM. Weddings are a specialty with slightly more weight in the domain model, but every recommendation in this document is evaluated against general photo/video studio work — commercial, editorial, brand, portrait, event, video production. Patterns that only matter for weddings are flagged; patterns that generalise (the majority) are prioritised.

---

## 1. Method

Eight folders, eight projects. Each folder contains 2–8 email threads covering one project arc from first contact through post-delivery. Each folder also contains a "stress test" — a prior LLM's opinion of what's wrong. We did **not** trust stress tests; each project was read end-to-end and classified against a fixed 15-category taxonomy, then the stress test's claims were verified, refuted, or extended.

**Per-project issue counts** (raw):

| # | Project | Threads | Size | Issues found |
|---|---|---|---|---|
| 1 | Dana & Matt (US + safari) | 6 | ~46 KB | 15 |
| 2 | C&D Cambodia | 2 | ~58 KB | 10 |
| 3 | C&D Italy | 3 | ~32 KB | 12 |
| 4 | B&A (Cartagena) | 5 | ~35 KB | 13 |
| 5 | R&D (French chateau, planner-mediated) | 4 | ~450 KB | 26 |
| 6 | K&N (French chateau, planner-brokered) | 7 | ~150 KB | 9 |
| 7 | P&R (Italy, planner collision) | 3 | ~321 KB | 22 |
| 8 | J&A (London, planner + couple entity split) | 8 | ~56 KB | 9 |
| | **Total** | **38** | **~1.15 MB** | **~116** |

These 116 raw issues collapse into **20 recurring patterns**, ranked below by frequency × severity.

**Note on the stress tests.** They were mostly directionally useful but consistently (a) overstated severity in luxury-brand language ("critical architecture gap," "the system must…"), (b) leaned on AI-orchestration framings that don't match the actual failures (which are human-CRM failures), and (c) missed specific concrete details that end-to-end reading surfaced (e.g. the passport email in wedding 2, the "regarding" keyword issue class, address shifts in wedding 4, the offline Dec 23 consultation call in wedding 1). They were helpful as cross-checks, but every non-trivial finding in this document was verified against the primary thread evidence.

---

## 2. Executive summary

Of the 20 recurring patterns, the Phase 1 memory plan fully covers **4**, partially covers **9**, and does not address **7**. This validates the memory plan as necessary but not sufficient. The seven uncovered patterns cluster into **six adjacent systems** the app eventually needs — most importantly:

1. **Entity resolution / duplicate-inquiry detection** (planner and couple inquiring about the same project from different channels, weeks apart).
2. **Thread participant and audience model** (planner-only sub-threads vs. couple-visible ones, and who-can-see-what rules).
3. **Verbal / offline / multi-channel fact capture** (WhatsApp, phone calls, in-person meetings that never reach email).
4. **Billing contact separation from client** (payer ≠ user; address/currency/entity drift).
5. **Life-event pause propagation** (compassion/crisis/emergency flags that cross all automations).
6. **Contract amendment / scope-change data model** (soft commitments, "up to X" that never become binding, fee exceptions, photographer-count changes).

Phase 1 memory changes plus these six adjacent systems cover **~85%** of observed issues. The remaining ~15% is email hygiene, attachment/vision processing, and publication rights — lower priority.

**Execution note:** use this document to understand product pressure and prioritization, not to batch implementation into one giant phase. The current execution plan should break memory/lookup work into smaller slices, with the handover doc as the source of truth for slice order and current shipped status.

---

## 3. The 20 recurring patterns

Ranked by (frequency across projects) × (severity). "Generalises" = applies to commercial / editorial / portrait / video as much as weddings.

| # | Pattern | In how many projects | Severity | Generalises? |
|---|---|---:|---|---|
| P1 | Entity collision: same project enters via 2+ channels, gets 2 quotes | 2/8 | Critical | Yes |
| P2 | Multi-channel context loss (WhatsApp / phone / in-person fact never in email) | 6/8 | High | Yes |
| P3 | Same person, multiple roles and/or multiple projects | 5/8 | High | Yes |
| P4 | Planner as gatekeeper / filter losing nuance | 6/8 | High | Partly wedding-shaped; applies to any agent-mediated work |
| P5 | Payer ≠ user; billing contact drift | 5/8 | Medium-High | Yes |
| P6 | Banking / payment infrastructure fragility (currency, routing, names) | 5/8 | High | Yes |
| P7 | PII exposure (passports, DOBs, IDs in plaintext email) | 2/8 | Critical where present | Yes |
| P8 | Life-event pause needed (crisis on either side) | 2/8 | High | Yes |
| P9 | Decision reversal / supersession (X then ¬X, no audit trail) | 4/8 | Medium-High | Yes |
| P10 | Offline / verbal-only decisions (calls, meetings) never captured | 4/8 | High | Yes |
| P11 | Soft-commitment drift ("up to X hours", "starting at") never finalised | 4/8 | Medium-High | Yes |
| P12 | Visual / attachment context (screenshots, PDFs, dress photos, annotated images) | 5/8 | Medium-High | Yes |
| P13 | Publication / credit / usage-rights management | 5/8 | High | Yes |
| P14 | Late or missing timeline / operational logistics delivery | 4/8 | Critical | Yes |
| P15 | Tone / language / cultural register mismatch | 4/8 | Low-Medium | Yes |
| P16 | Post-delivery preference evolution / rework cycles | 5/8 | Medium | Yes |
| P17 | Multiple email addresses / alias / delivery failure | 4/8 | Low-Medium | Yes |
| P18 | Questionnaire / form completion never verified | 4/8 | Medium | Yes |
| P19 | Scope creep on upsells without formal addendum | 6/8 | High | Yes |
| P20 | Email parsing artifacts / template noise | 3/8 | Low | Yes |

Patterns 2, 4, 19 hit six projects each — the most pervasive issues in the dataset.

---

## 4. Pattern deep dives

### P1 — Entity collision: same project, two entry points, two quotes

**Observed in:** P&R (wedding 7), J&A (wedding 8).

**What happens.** In J&A, planner Mark Niemierko inquired in July 2024 at €21.5k. Three months later, Alex Latinovic and Jessica Nicholls (the couple) inquired independently about *the same wedding*, unaware their planner had already pitched them. The studio requoted at €26.4k — about €5k higher — and had to negotiate down to €21k, while never explicitly reconciling that the two inquiries were the same wedding. In P&R, Parya inquired directly in July 2024 (€12.5k starting-price discussion); planner Olga Bongini pitched the same wedding separately in September 2024 at €35k agency-structured price. The studio produced both quotes without internally linking them.

**Why it happens.** There is no **entity resolution / duplicate-inquiry detection**. Inquiries are handled thread-first; there's no step that asks "does this inquiry match an existing project by date + venue + couple names + vendor circle?"

**Consequence.** Direct financial impact (couple quoted higher than planner), trust erosion when inconsistencies surface, commission structure confusion between agency-mediated vs direct deals.

**Generalises.** Yes — same applies to commercial shoots (brand + agency + direct contact), editorial (photographer + magazine + subject + publisher), video production (studio + agency + client).

### P2 — Multi-channel context loss

**Observed in:** Dana & Matt (1), C&D Cambodia (2), C&D Italy (3), R&D (5), P&R (7), J&A (8).

**What happens.** In C&D Cambodia, the client sent the wedding timeline to Danilo via WhatsApp; Ana kept asking for it on email and looked out of the loop. In Dana & Matt, a Dec 23 consultation call produced no documented notes; four months later, a colour-correction dispute referenced "instructions you previously shared" — but it's unclear whether that meant the call, the Google Form questionnaire, or the lookbook. In C&D Italy, a London in-person meeting resulted in a two-photobook gift offer that only appeared in email *after the fact*. In R&D, Ryan & Davina reached Danilo via WhatsApp, the planner was bypassed, contract amendments were agreed verbally, and the planner discovered them secondhand.

**Why it happens.** The CRM only sees email. Phone calls, WhatsApp, Instagram DMs, in-person meetings, Zoom calls — all generate decisions and facts that never get back into the system of record.

**Consequence.** The AI (and the human operator) reason from an incomplete picture. Decisions get re-litigated. Clients grow frustrated when asked for things they already sent elsewhere.

**Generalises.** Yes — this is a universal pattern.

### P3 — Same person, multiple roles and/or multiple projects

**Observed in:** Dana & Matt (1) — bride *and* Indalo-Travel founder, B2B commercial partner. C&D Cambodia + C&D Italy (2+3) — *same client, two weddings in two countries*. B&A (4) — Belen (bride/user) + Javier (father/payer). J&A (8) — Jessica, Alex, and father Stanislav all appear on different invoices. P&R (7) — multiple planners (Olga vs Sara Mazzei) with unclear primacy.

**Why it happens.** The data model assumes one project = one client pair. It doesn't account for:
- a single human having two projects in two different jurisdictions;
- a single human being both client-for-wedding and commercial partner;
- one identity wearing different roles (payer vs user vs approver) within one project.

**Consequence.** When someone asks Ana "what do we know about Chanthima?", the right answer spans two weddings. When the AI drafts to Belen, it needs to know that billing went to Javier. When Dana asks for a "partnership discount," the AI should realise she's an Indalo Travel principal, not just a bride.

**Generalises.** Very strongly. In commercial photography a single point-of-contact may commission shoots for three different brands under one corporate parent.

### P4 — Planner as gatekeeper / filter losing nuance

**Observed in:** C&D Italy (3), B&A (4), R&D (5), K&N (6), P&R (7), J&A (8).

**What happens.** In K&N, the planner Rhiann told Ana "the couple are feeling a softer look" without the couple ever saying that to Ana directly. Their exact preference is filtered through Rhiann's interpretation. In C&D Italy, Chanthima told Ana she didn't want specific photos published; Cinzia (the planner) later asked for a "green light" from Chanthima without knowing the specific exclusions existed. In J&A, Mark received the Lancaster House security protocol (photo ID, police gate, insurance specs); Jessica and Alex *never saw it*, and Jessica later asked about logistics as if they were unresolved. In R&D, the couple bypassed the planner via WhatsApp; the planner found out through the vendor, felt excluded, and explicitly asked to be CCed.

**Why it happens.** Threads don't encode **audience / visibility** rules. All recipients of a thread can see everything on it. There's no way to say "this fact came from the planner, the couple shouldn't necessarily see it" — or conversely "this was said to the couple, make sure the planner knows."

**Consequence.** Information silos between planner-only and couple-only threads. The AI, if it drafts replies, risks leaking planner-internal context to the couple or surfacing couple-private preferences to the planner.

**Generalises.** Yes. Any agency-mediated work has this: brand + agency + creative, production company + talent + crew, etc.

### P5 — Payer ≠ user; billing contact drift

**Observed in:** Dana & Matt (1), B&A (4), R&D (5), J&A (8), P&R (7).

**What happens.** In B&A, Javier Torrens paid for the wedding but Belen used the service. His billing address also changed mid-contract from Boca Raton to Medley, FL, without anyone noting why. In J&A, invoicing shifted over time: first to Jessica's personal address (London), then to father Stanislav (at his company), then to husband Alex in Serbian dinars after the couple moved to Budapest. In R&D, Ryan's *assistant* negotiated the contract and submitted 9 redline changes without explicit authority handoff.

**Why it happens.** The `wedding_people` table already supports `is_billing_contact` / `is_payer` flags (per the V3 docs), but the practical workflow doesn't enforce capturing who pays, in what currency, to which address, and when that changes.

**Consequence.** Invoices sent to the wrong person; payments delayed; address changes requiring manual reconciliation; currency/entity confusion; in dispute scenarios, no clear audit of who was authorised to sign what.

**Generalises.** Yes — corporate shoots where procurement pays, creative approves, and marketing consumes have the same split.

### P6 — Banking / payment infrastructure fragility

**Observed in:** C&D Cambodia (2), B&A (4), R&D (5), P&R (7), J&A (8).

**What happens.** In C&D Cambodia, the client's Cambodian bank refused to transfer to Serbia; the studio switched to a UK account. Nothing recorded this as a durable fact for future invoices. In B&A, the Serbian company legal name was too long for Bank of America's portal; Ana manually shortened it to "DANILO VASIC PR" without confirming the shortened name matches the actual bank registration. In R&D, a wire bounced due to wrong account number and a €100 fee was absorbed; separately, the invoice listed "Wise Europe SA" which the client's bank rejected as "not a bank." In J&A, the client paid in EUR when GBP was quoted, leaving a €2,820 shortfall the studio had to chase. Then later the couple moved to Budapest and asked for invoices in Serbian dinars. In P&R, the invoice was missing the studio's business address; Parya's bank rejected it and sent a screenshot of the error.

**Why it happens.** Banking quirks are memorable but not durable in the current system. Every new invoice rediscovers the same routing pitfalls.

**Consequence.** Payment delays (often weeks), tax / audit ambiguity, repeated operator effort on the same problem, chronic chasing of receivables.

**Generalises.** Strongly — any international photo/video studio hits this on commercial clients too.

### P7 — PII exposure

**Observed in:** C&D Cambodia (2) — passport number in an invoice correction email. B&A (4) — full team passport numbers + DOBs sent in plaintext to the planner for venue access.

**What happens.** Sensitive documents get posted into email bodies because the venue asked, or the bank asked, or the planner asked, with no intermediate secure channel.

**Consequence.** Tier-1 PII now sits on third-party mail servers indefinitely, in threads visible to anyone who gains access to the thread, and searchable/retrievable by AI systems reading the threads. Legal/compliance exposure.

**Generalises.** Yes — any destination or venue-controlled work triggers this.

### P8 — Life-event pause

**Observed in:** C&D Cambodia (2) — studio-side: Danilo's son hospitalised, calls rescheduled, but no system pause. K&N (6) — client-side: Karissa disclosed she was homeless and relocating; Ana paused the album pitch personally, but the planner (Rhiann) had no visibility into this.

**What happens.** A crisis or emergency arrives; the operator responds with grace; but there is no flag to suspend automated follow-ups, reminders, drafts, and other AI-driven activity on that wedding for the duration.

**Consequence.** If the studio's drip system had fired a "Time to choose your 200 album photos!" reminder during Karissa's crisis, or a billing reminder at 3 AM the night Danilo's son was in hospital, the relationship damage would have been disproportionate to the tiny effort needed to flag it.

**Generalises.** Yes — studios serving high-trust clients of any kind need this.

### P9 — Decision reversal / supersession

**Observed in:** Dana & Matt (1), R&D (5), P&R (7), J&A (8).

**What happens.** In R&D, pricing evolved €39.5k → €30k → €34k across proposals with no audit trail; the engagement-shoot price was reduced €6,500 → €5,000 as "an exception" without documentation. In P&R, the studio sent a "fully booked" rejection on Oct 18 and reversed it three days later as "an exception." In J&A, Mark was told pricing was non-negotiable; Jessica later got a discount under the same contract. In Dana & Matt, the 3€-per-image special rate was offered without clarity on whether it supersedes the standard 10€ or is a one-off.

**Why it happens.** Memories (or their equivalent) are append-only in practice. When a decision reverses, the new one gets recorded but the old one doesn't get marked superseded.

**Consequence.** Audit hell, inconsistent pricing across clients, the AI's retrieval may surface the old decision and present it as current.

**Generalises.** Yes.

### P10 — Offline / verbal-only decisions

**Observed in:** Dana & Matt (1) — Dec 23 consultation call produced no documented output. C&D Italy (3) — London in-person meeting resulted in free-photobook offer, appearing in email only retrospectively. R&D (5) — Ryan's assistant submitted contract changes via email after a WhatsApp exchange. P&R (7) — May 8 call produced documentary-shoot verbal consent with no written record.

**Why it happens.** Operators don't have a habit (or a tool) for "I just agreed to X on a call / in person / over WhatsApp — capture this." The system is email-centric.

**Consequence.** Legal gaps, dispute risk, AI drafts that ignore commitments made offline.

**Generalises.** Yes — commercial shoots routinely involve phone and in-person negotiations.

### P11 — Soft-commitment drift

**Observed in:** B&A (4) — "up to 2h" brunch coverage never turned into a binding hours number. R&D (5) — photographer count dropped 5 → 4 with no explicit scope-change doc. P&R (7) — "starting price €12.5k / €18k" language floated between quotes. Dana & Matt (1) — "80 free edits" and "3€ rate" evolved without formal addendum.

**Why it happens.** Proposals use soft-commitment language ("up to," "starting at," "around") that never gets resolved into a binding term in a final contract or signed amendment.

**Consequence.** Scope disputes near delivery. Clients remember the generous side of the soft commitment; operators remember the ceiling.

**Generalises.** Yes.

### P12 — Visual / attachment context

**Observed in:** C&D Italy (3) — bride drew arrows on a photo attachment, meaning unclear from email text. B&A (4) — dress photos attached with a shoe-caveat, never routed to the photographer. R&D (5) — eye-editing request referencing an attached photo. P&R (7) — bank-error screenshot. J&A (8) — photobook PDF mockup with "Karis" typo the AI could not see.

**Why it happens.** Text-processing AI doesn't read attached images or PDFs. Critical detail hides in the attachment.

**Consequence.** AI drafts that ignore important visual context; operators who miss flagged issues because they live in attachments.

**Generalises.** Yes.

### P13 — Publication / credit / usage-rights management

**Observed in:** Dana & Matt (1) — raw files granted for Instagram with "don't tag us" caveat, granted ad-hoc. C&D Italy (3) — publication control with multiple gallery versions and photo-exclusion rules fed piecemeal over days. B&A (4) — Galia Lahav permission granted verbally in email without attribution spec. J&A (8) — WedLuxe published without credits; vendors angry; studio submitted "Over The Moon" instead, scrambled to compile a 13-vendor credit list. P&R (7) — documentary filming consent verbal only.

**Why it happens.** No structured "rights granted" data model. Every permission is ad-hoc text in an email.

**Consequence.** Vendor relationship damage, permission scope creep, loss of studio portfolio rights, IP disputes.

**Generalises.** Strongly — this is arguably *more* relevant to commercial/editorial work than to weddings.

### P14 — Late or missing timeline / logistics delivery

**Observed in:** R&D (5) — 7-month gap between contract and timeline details. P&R (7) — timeline sent 2 days before wedding (May 27 for May 28–29). J&A (8) — Jessica asked about timings; Ana acted as if unresolved despite Mark having briefed her 38 days earlier (logistics siloed in a different thread). C&D Cambodia (2) — timeline sent to Danilo via WhatsApp; Ana kept asking for it on email.

**Why it happens.** No workflow-state model to track "timeline locked: yes/no" per project milestone. No automation to chase it proactively.

**Consequence.** Day-of-event risk — wrong full names with venue security, equipment wrong for location, crew unaware of key moments.

**Generalises.** Yes — commercial event shoots have identical risk.

### P15 — Tone / language / cultural register mismatch

**Observed in:** R&D (5), P&R (7), K&N (6), C&D Cambodia (2).

**What happens.** Different stakeholders use different registers — planner emoji-heavy, bride enthusiastic all-caps, Ana professionally warm, venue operational and formal. The AI, if it drafts replies, needs to match the recipient's register.

**Generalises.** Yes.

### P16 — Post-delivery preference evolution / rework

**Observed in:** Dana & Matt (1) — post-delivery colour correction complaint. B&A (4) — photo 770 duplicated across 14+ album revision rounds. R&D (5) — "preview photos" absent from final gallery, added after request; red-curtain photos requested post-delivery. C&D Italy (3) — four parallel gallery versions (highlights, guest, full, raw-for-mom). P&R (7) — photobook upsell with bespoke curation.

**What happens.** What the client says 6 months in doesn't reflect what they said at the start, and rework cycles multiply.

**Consequence.** Labour undercount on the upsell; edit caps silently breached; client satisfaction drifts.

**Generalises.** Yes.

### P17 — Multiple email addresses / alias / delivery failure

**Observed in:** Dana & Matt (1) — dana@indalo.travel, erin@indalo.travel, implied personal email. K&N (6) — kiki6725@yahoo.com + karissaandnicolaswedding@gmail.com. J&A (8) — emails silently not arriving; Ana assumed delivery and re-sent without investigating.

**Consequence.** Duplicate contact records, missed emails, broken automations.

**Generalises.** Yes.

### P18 — Questionnaire / form completion never verified

**Observed in:** B&A (4), R&D (5), K&N (6), P&R (7).

**What happens.** Operator sends a Google Form link. Whether the client filled it out, when, with what answers — all invisible to the thread.

**Generalises.** Yes.

### P19 — Scope creep on upsells without formal addendum

**Observed in:** Dana & Matt (1), C&D Italy (3), B&A (4), R&D (5), P&R (7), J&A (8). Six of eight.

**What happens.** A new service (safari add-on, family day, photobook, extra hour, discount bundle) gets offered and accepted in chat-style email without any contract amendment. Often the service is rendered and invoiced afterwards.

**Consequence.** Commission disputes (agency commission on family day never answered in C&D Italy), retroactive billing (P&R extra hour), margin compression (J&A 10% discount applied mid-negotiation), and eventual audit headaches.

**Generalises.** Yes.

### P20 — Email parsing artifacts

**Observed in:** Dana & Matt (1), C&D Cambodia (2), B&A (4). Low-severity hygiene issue.

---

## 5. Memory system coverage — does Phase 1 handle these?

The Phase 1 memory plan (per [`MEMORIES_SYSTEM_VERDICT_AND_THREAD_ANALYSIS_CONTEXT.md`](./MEMORIES_SYSTEM_VERDICT_AND_THREAD_ANALYSIS_CONTEXT.md), §5) proposed five changes:

1. Add `person_id` nullable (intersectional with `wedding_id`).
2. Add `supersedes_memory_id` (self-FK).
3. Add `last_accessed_at`.
4. Drop the magic-string ranker cues.
5. Summary-writing convention: decision/outcome, not topic.

Running each of the 20 patterns against this plan:

### 5a — Fully addressed by Phase 1 memory changes

| Pattern | How Phase 1 addresses it |
|---|---|
| **P6** Banking/payment fragility | Person-scoped memory ("Chanthima's Cambodian bank blocks Serbia; use UK account") carries across future invoices and across her two weddings. `supersedes_memory_id` handles routing changes. `last_accessed_at` enables future decay. |
| **P8** Life-event pause | Project-scoped memory ("compassion pause active until X"). Memory retrieval surfaces it on every turn; the operator-side workflow consumes and propagates it to `thread_workflow_state`. |
| **P9** Decision reversal | `supersedes_memory_id` is literally the shape of this fix. New memory with `supersedes_memory_id` pointing to the old one; old one excluded from ranking. |
| **P10** Offline/verbal decisions | Memory write after a verbal moment, tagged with a new `type` value (e.g. `operator_verbal_capture`). The summary-writing convention (decision, not topic) ensures it's usable later. |

**Verdict on 5a: four patterns cleanly solved by Phase 1 memory as already planned.** These four cover the pain in roughly 4/8 of the projects.

### 5b — Partially addressed; gaps to close

| Pattern | What Phase 1 does | What remains missing |
|---|---|---|
| **P2** Multi-channel context loss | Memory can hold the fact once captured | There is no *write trigger* for WhatsApp/phone/in-person. Memories are today only written from escalations. Needs: a lightweight "capture this fact" path (operator-initiated, via Ana) that works from any channel. |
| **P3** Multi-role, multi-project person | `person_id` adds cross-wedding recall | Two weddings for one client (Chanthima Cambodia + Italy) still need a **person-level project index** (list of projects this person is involved in, with roles). Memory helps per-fact; aggregation is a different UI. |
| **P4** Planner as gatekeeper | Person-scoped memory holds planner facts across projects | The core problem is **thread audience / visibility**: who sent what, who sees what. Memory doesn't answer "can this fact appear in a couple-facing reply?" That requires a participant-role / audience model on threads. |
| **P5** Payer ≠ user | Memory can note "billing goes to Javier" | Structural fix is `wedding_people.is_billing_contact` (already in schema). The gap is *workflow enforcement*: prompting capture at quote time and alerting on change. |
| **P11** Soft-commitment drift | Memory captures "operator agreed to 2h brunch" | Proper fix is a **contract amendment / scope-change data model** that binds the commitment to the contract row. Memory is a consolation prize. |
| **P13** Publication rights | Memory holds "client approved raw files for Instagram with no-tag caveat" | Proper fix is a rights-management surface (grant, scope, attribution, expiry). Memory carries the advisory note pending that. |
| **P15** Tone/language | Memory can tag "client prefers formal register" | Proper fix is tone metadata on persona-writer inputs, per-person. Memory is the interim cache. |
| **P16** Preference evolution | Memory + supersession handles classic "preference changed" | What memory cannot do is *proactively detect* drift across galleries / revision rounds. That's a workflow observer, not retrieval. |
| **P19** Scope creep on upsells | Memory captures "operator granted €1k extra-hour rate on date X" | Proper fix is a proposal / amendment workflow with operator confirmation; memory is the audit trail of "we said yes to this." |

**Verdict on 5b: nine patterns where Phase 1 memory provides grounding but doesn't close the loop.** These need adjacent systems (detailed in §6).

### 5c — Not a memory problem; different system needed

| Pattern | Why memory doesn't help | Right system |
|---|---|---|
| **P1** Entity collision | Memory only works *after* linkage. Linkage itself is matching/dedup. | **Inquiry dedup / entity resolution** layer on intake. |
| **P7** PII exposure | Memory should not store PII. | **Sensitive-document handling** (secure vault / `documents` table) + prompt guardrail. |
| **P12** Visual/attachment context | Text memory doesn't parse images. | **Attachment / visual pipeline** (vision model or structured attachment routing). |
| **P14** Late/missing timeline | Memory doesn't schedule or chase. | **Workflow state / milestone tracking** with proactive nudges. |
| **P17** Email alias / delivery | Memory doesn't resolve identities. | **Contact aliasing / identity graph** on `people` + `contact_points`. |
| **P18** Questionnaire completion | Not a memory fact. | **Form integration / workflow state**. |
| **P20** Email parsing artifacts | Hygiene, not retrieval. | **Email-ingestion parser** cleanup. |

**Verdict on 5c: seven patterns memory cannot solve.** They cluster into six adjacent systems (see §6).

---

## 6. Adjacent systems needed (non-memory)

Ordered by leverage — how many patterns each system closes.

### 6a. Thread participant + audience / visibility model
**Closes:** P4 (planner as gatekeeper), partially P2 (multi-channel), partially P3 (multi-role).

**Shape.** Each thread has a `thread_participants` list (already exists). Extend it with:
- `role` enum: `couple`, `planner`, `venue`, `vendor`, `family`, `assistant`, `operator_internal`, `other`.
- `visibility_role` enum on the participant: who can see this thread row — `all_thread`, `operator_only`, `planner_tier`, `client_tier`.
- A thread-level flag: `audience_tier` (e.g. `planner_only`, `client_facing`).

**Why it matters for memory.** Memories written from planner-tier threads should carry an `audience_source` tag; when Ana drafts a client-tier reply, the retrieval prefers memories with matching or broader audience and warns when a planner-tier-only fact is relevant but should not surface.

**Scope.** Medium. Not a full redesign; it extends a table that already exists and adds a soft enforcement rule in the persona writer.

**Generalises.** Strongly — this is the canonical multi-party-communication pattern for any professional service.

### 6b. Billing / payer separation from user
**Closes:** P5 (payer ≠ user), partially P6 (banking routing is person-level fact).

**Shape.** The schema has `wedding_people.is_billing_contact` and `is_payer` (per V3 docs). The gap is workflow: at quote acceptance, *force* capture of:
- Who pays (person).
- Where invoices go (address / entity).
- In what currency.
- On what schedule.

Amendments to any of these produce a structured change record (not just an email agreement).

**Why memory isn't enough.** Payer identity is structural, not soft. A change needs to trigger invoice reissue, not just a note.

**Generalises.** Yes. Commercial work routinely has procurement-pays-creative-consumes splits.

### 6c. Inquiry dedup / entity resolution
**Closes:** P1 (entity collision), partially P17 (email aliases).

**Shape.** On new inquiry intake:
- Extract candidate entities: client names, event date, venue, planner email domain.
- Match against open projects in last 365 days: fuzzy-name match + date proximity + venue match + known-planner-domain match.
- If score > threshold → surface "this looks like an existing project: X. Link or treat as new?"

**Why it matters.** Prevents two quotes going out for one wedding, one high one low. Also catches the case where one person inquires about two separate projects (Chanthima: Cambodia + Italy) and links them into a person profile.

**Generalises.** Yes — same issue in commercial work where a brand's marketing and creative teams both reach out separately.

### 6d. Contract amendment / scope-change data model
**Closes:** P11 (soft-commitment drift), partially P19 (upsells), partially P9 (pricing reversal audit).

**Shape.** A structured amendment row per project:
- `amendment_id`
- `project_id` (the wedding row)
- `change_type`: `pricing` / `scope_add` / `scope_remove` / `timeline_change` / `team_change` / `payment_schedule_change`
- `old_value`, `new_value`
- `rationale`, `source_email_id`
- `status`: `proposed` / `operator_confirmed` / `client_confirmed` / `superseded`
- `effective_from`, `effective_until`

Ana proposes amendments; operator confirms; client-facing confirmation captured by email + stored. Invoices reference amendments, not freeform text.

**Why memory isn't enough.** Memory is advisory; amendments are binding. Conflating them is what the external-LLM review called out as "policy backdoor" risk.

**Generalises.** Yes — every commercial shoot has scope changes.

### 6e. Verbal / offline capture workflow
**Closes:** P10 (offline decisions), much of P2 (multi-channel loss).

**Shape.** A single entry point the operator can hit (via Ana, via a "capture this" button on mobile, via a keyboard shortcut) that creates a `verbal_capture` record with:
- Which project it relates to (if linkable)
- Which person(s) involved
- Summary of what was said/agreed
- Whether it should become a memory, a task, a proposed playbook rule, a proposed amendment, or just a note
- Channel tag: `phone`, `whatsapp`, `instagram_dm`, `in_person`, `zoom`, `other`

Ana can propose any of those downstream artifacts; operator confirms; they become durable.

**Why memory isn't enough on its own.** The capture trigger is the missing piece. Without it, facts keep falling through the cracks between channels.

**Generalises.** Yes. Strongly. This alone might be the single biggest UX unlock.

### 6f. Life-event pause propagation
**Closes:** P8 (life-event pause).

**Shape.** A pause is a project-level (and optionally person-level) flag:
- `compassion_pause_until` (timestamp)
- `compassion_reason` (free text, operator-confirmed)
- `compassion_scope`: `this_project` / `this_person` / `this_studio`

When set, it overrides all automated nudges, drip emails, AI-drafted replies, invoice reminders for affected projects. Memories render it with high salience in every turn until cleared.

**Why memory alone isn't enough.** The pause has to be *propagated* to automations; memory's read path doesn't gate sending.

**Scope.** Small. One boolean plus a handful of `if not paused` checks across the automation surfaces.

### 6g. Sensitive-document handling
**Closes:** P7 (PII exposure).

**Shape.**
- When an inbound message contains a passport number, national ID, DOB + full name combination, credit card, etc., the ingestion pipeline detects it (regex + structured patterns).
- The PII is extracted to a `sensitive_document` table (tenant-scoped, RLS, access-logged), leaving a placeholder in the thread.
- Ana never receives the raw PII in retrieval; she sees "passport document attached for this person, stored secure, 7-day retention."
- Persona writer is explicitly forbidden from echoing PII into client-facing drafts.

**Scope.** Medium. Needs an ingestion scanner, a new table, and a surface for authorised operator retrieval.

### 6h. Workflow state / milestone tracking
**Closes:** P14 (late timeline), P18 (form completion verification), partially P16 (rework loops).

**Shape.** Each project has a milestone ladder: `quote_sent`, `contract_signed`, `retainer_paid`, `questionnaire_returned`, `consultation_booked`, `timeline_received`, `pre_event_briefing_done`, `event_captured`, `gallery_delivered`, `album_curated`, `final_paid`, `archived`. Each milestone has a deterministic check (e.g. "did we receive a Google Form response?"), a target date, and a proactive nudge when overdue. Memory helps the operator understand *why* a milestone slipped; workflow state makes the slip visible.

**Scope.** Medium. It's a status field, a table of nudge rules, and integration with the form surfaces.

### 6i. Attachment / visual pipeline
**Closes:** P12 (visual/attachment context).

**Shape.** When an inbound email arrives with an attachment:
- Image → optional vision-model pass to generate a short structured description (e.g. "bride in white dress, indoor getting-ready room, arrows drawn on 3 faces").
- PDF → text extraction (bodies, captions).
- Results stored on `message_attachments` with a `description` field.
- Retrieval surfaces the description to Ana so replies don't ignore the attachment content.

**Scope.** Medium-Large. Vision calls cost money; only run on operator demand or on specific signals (e.g. operator CC'd on a client reply with an image).

**Defer.** Not urgent; operator can read attachments manually. Revisit once memory + audience work lands.

### 6j. Publication / credit / usage-rights surface
**Closes:** P13 (rights management).

**Shape.** A `rights_grant` row per permission:
- Project / person it applies to
- Media scope (specific photo IDs, whole gallery, specific galleries)
- Usage scope (personal / social / print / commercial / editorial / magazine submission)
- Attribution requirement
- Exclusivity constraints
- Expiry
- Source (email thread, signed release, verbal-capture)

The persona writer and Ana both gate replies on rights state.

**Scope.** Medium. Defer until after the memory and audience slices.

---

## 7. Revised roadmap

### Phase 1 — memory foundation (already scoped; unchanged by this analysis)

Add `person_id` nullable, `supersedes_memory_id`, `last_accessed_at`; drop magic-string ranker cues; summary-writing convention. This lands the groundwork for P6, P8, P9, P10 and the memory half of P3, P11, P13, P15, P16, P19.

### Phase 2 — high-leverage adjacent systems (from §6)

In payoff order:

1. **Verbal / offline capture workflow (§6e)** — unlocks P10 fully, P2 mostly, and is the single biggest UX jump.
2. **Thread participant + audience model (§6a)** — unlocks P4, makes memory's audience-tagging meaningful.
3. **Inquiry dedup / entity resolution (§6c)** — unlocks P1, prevents repeat pricing collisions.
4. **Life-event pause propagation (§6f)** — small, high-impact for P8.
5. **Billing separation workflow (§6b)** — unlocks P5 without schema changes (schema already supports it).

### Phase 3 — structural data-model additions

6. **Contract amendment / scope-change model (§6d)** — unlocks P11, P19, audit of P9.
7. **Workflow state / milestone tracking (§6h)** — unlocks P14, P18.
8. **Sensitive-document handling (§6g)** — unlocks P7; higher priority if any regulated tenant onboards.

### Phase 4 — lower-priority enhancements

9. **Publication rights surface (§6j)** — unlocks P13; defer until Phase 2 is in production.
10. **Attachment / visual pipeline (§6i)** — unlocks P12; most expensive per outcome; defer until real operator pain measured.
11. **Contact aliasing / identity graph** — unlocks P17.
12. **Email-ingestion cleanup** — unlocks P20.

---

## 8. Photographer + videographer generalisation

Every pattern in §3 was evaluated for generality. **All 20 patterns generalise to commercial, editorial, portrait, event, and video-production work** with only cosmetic wedding-flavour differences. Specifically:

- **Multi-party coordination (P4, P5, P13).** Commercial shoots: brand + agency + creative + procurement. Editorial: photographer + magazine + subject + PR. Video: production company + talent + crew. All need the same audience / visibility / rights machinery.
- **Cross-project person continuity (P3).** A brand's marketing lead who commissions three campaigns a year is exactly Chanthima-with-two-weddings.
- **Banking / currency / entity (P6).** International commercial work has this in spades.
- **Scope creep on upsells (P19).** Extra shoot days, additional formats, re-edits for different channels — identical pattern.
- **Late logistics (P14).** Event coverage, corporate launches, product shoots all have the same pre-event-pack problem.
- **Publication rights (P13).** Arguably *more* prominent in commercial/editorial than in weddings.
- **Offline / verbal capture (P10, P2).** Industry norms (phone calls, on-site briefings, show-the-boss-the-proof-in-person) make this even more pervasive in B2B creative.

**Wedding-specific framing to keep but not over-index on:**
- Couple (bride/groom) terminology — current schema uses `couple_names` and `project_type: wedding` to handle this correctly, bleeding to commercial-safe vocab elsewhere.
- Planner role — the analog in commercial work is "agency producer," "creative director," or "talent agent" — the *mechanics* are the same, the labels differ.
- Gallery delivery vs. album vs. video reel — unified as a "deliverable" abstraction across project types.

**Recommendation:** every feature in the Phase 2–3 roadmap should be built on the existing `project_type` abstraction (wedding / commercial / video / other) and should avoid wedding-only wording in the operator-facing UI and in Ana's prompt. Memory content, playbook rules, and thread audience roles should all carry neutral names (e.g. `planner` → `coordinator` in generic surfaces; `couple` → `primary_client` where appropriate).

---

## 9. Appendix — per-project issue counts by pattern

Matrix of which projects hit which patterns (×  = observed, blank = not observed).

| Pattern | 1 Dana | 2 Camb | 3 Ita | 4 B&A | 5 R&D | 6 K&N | 7 P&R | 8 J&A |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| P1 Entity collision | | | | | | | × | × |
| P2 Multi-channel loss | × | × | × | | × | | × | × |
| P3 Multi-role person | × | × | × | × | | | × | × |
| P4 Planner gatekeeper | | | × | × | × | × | × | × |
| P5 Payer ≠ user | × | | | × | × | | × | × |
| P6 Banking fragility | | × | | × | × | | × | × |
| P7 PII exposure | | × | | × | | | | |
| P8 Life-event pause | | × | | | | × | | |
| P9 Decision reversal | × | | | | × | | × | × |
| P10 Offline/verbal | × | | × | | × | | × | |
| P11 Soft-commitment drift | × | | | × | × | | × | |
| P12 Visual/attachment | | | × | × | × | | × | × |
| P13 Rights management | × | | × | × | | | × | × |
| P14 Late timeline | | × | | | × | | × | × |
| P15 Tone mismatch | | × | | | × | × | × | |
| P16 Preference evolution | × | | × | × | × | | × | |
| P17 Email alias/delivery | × | | | | | × | | × |
| P18 Form completion | | | | × | × | × | × | |
| P19 Scope creep / upsell | × | | × | × | × | | × | × |
| P20 Email parsing | × | × | | × | | | | |

---

## 10. Final note

The Phase 1 memory plan is confirmed necessary and well-shaped. What this thread analysis adds is the **next tier of work** — six adjacent systems that memory depends on or is dependent by. Without them, memory alone will only solve about a third of the real pain; with them, the coverage rises to roughly 85%.

**Do not pile every observation into the memory slice.** Memory stays narrow, strong, and advisory. The adjacent systems (especially verbal-capture, audience model, and inquiry dedup) are what turn the CRM into something that actually behaves like a manager across the full lifecycle of a project — whether that project is a wedding, a commercial campaign, or a video production.

**Next concrete move:** take this document and the verdict document together, draft the first Phase 2 slice plan for the **verbal / offline capture workflow**. That is the single highest-leverage adjacent system and is also the most natural extension of Ana's existing propose-confirm pattern.

No code should be changed from reading this document alone. This is strategic context; slice plans come next.
