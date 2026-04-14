/**
 * V3 stress replay batch 3 — additional critical decision points from stress tests **8, 1, 2, 4**
 * not exhaustively covered by batch 1 + 2 (`Ana real pdf/8|1|2|4/stress test *.txt` + REAL_CONVERSATION_STRESS_TEST_PLAN).
 *
 * Focus: Mark/Jessica/Alex (ST8) deep cuts, plus thin replay rows for ST1/ST2/ST4 gaps.
 */
import type { StressReplayDecisionPoint, StressReplayEvalResult } from "./v3StressReplayBatch1Harness.ts";
import { evaluateDecisionPoint, FAKE_WEDDING, minimalAudience } from "./v3StressReplayBatch1Harness.ts";

const MARK_PLANNER_PERSON = "00000000-0000-4000-8000-0000000000e2";
const ANNE_PLANNER_PERSON = "00000000-0000-4000-8000-0000000000e3";

const plannerAuthority = (personId: string) =>
  ({
    bucket: "planner" as const,
    personId,
    isApprovalContact: false,
    source: "thread_sender" as const,
  });

/** Critical decision points only — not full transcript replay. */
export const BATCH3_DECISION_POINTS: StressReplayDecisionPoint[] = [
  // ── Stress test 8 (Mark / Jessica / Alex — Niemierko / Lancaster House) ──
  {
    id: "st8-planner-mark-21500-excessive-quote",
    stressTest: 8,
    title: "Planner pushback: €21.5k quote 'very high' / excessive vs market",
    rawMessage:
      "Danilo — honestly €21,500 feels very high and excessive for one wedding day given what other studios quoted us. We need to renegotiate the package price and contract terms before we go back to Mark and Jessica — please confirm a revised quote.",
    audience: minimalAudience({ recipientCount: 4 }),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    inboundSenderAuthority: plannerAuthority(MARK_PLANNER_PERSON),
    expectedProductBehavior:
      "Planner-led price defense / discount pressure — halt autonomous negotiation; authority policy + operator.",
    primaryGapIfUnmet: "missing_operator_behavior",
  },
  {
    id: "st8-jessica-drop-rehearsal-26400-budget",
    stressTest: 8,
    title: "Client: drop rehearsal + re-scope package (€26.4k still over budget)",
    rawMessage:
      "Hi Danilo — we need to trim the package to fit our budget: please drop rehearsal dinner coverage and only photograph the wedding day because €26,400 total is still too high. What would the wedding-day-only package cost?",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Package restructure + implicit large price move — high-magnitude concession / operator, not autonomous pricing.",
    primaryGapIfUnmet: "missing_verifier_rule",
  },
  {
    id: "st8-rsd-invoice-belgrade-bank",
    stressTest: 8,
    title: "Banking: re-issue invoice in Serbian dinars (Belgrade bank)",
    rawMessage:
      "Our bank cannot send a wire in euros on this invoice — please re-issue the final album invoice in Serbian dinars (RSD) and provide the IBAN your studio uses for Belgrade settlement.",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "No autonomous FX or invoice currency edits — banking/compliance exception + operator.",
    primaryGapIfUnmet: "missing_verifier_rule",
  },
  {
    id: "st8-lancaster-venue-pl-insurance-ids",
    stressTest: 8,
    title: "Venue compliance: UK govt building — IDs, no freestanding lights, £10m PL cert",
    rawMessage:
      "Lancaster House security confirmed: they need full legal names and passport photo IDs submitted 30 days before access, absolutely no freestanding lighting equipment on site, and we must upload your £10 million public liability insurance certificate to their vendor portal before load-in.",
    audience: minimalAudience({ recipientCount: 5 }),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    inboundSenderAuthority: plannerAuthority(MARK_PLANNER_PERSON),
    expectedProductBehavior:
      "Compliance asset retrieval for PL certificate; ID lists via secure channel — not generic AI attachment trust.",
    primaryGapIfUnmet: "missing_tool",
  },
  {
    id: "st8-wedluxe-angry-vendors-13-credits",
    stressTest: 8,
    title: "PR crisis: WedLuxe unauthorized + angry vendors + missing 13 credits",
    rawMessage:
      "I'm furious — WedLuxe published without permission and angry vendors are calling because the 13 editorial credits Mark emailed you are still missing from the online story.",
    audience: minimalAudience({ recipientCount: 6 }),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    inboundSenderAuthority: plannerAuthority(MARK_PLANNER_PERSON),
    expectedProductBehavior:
      "Non-commercial PR / vendor dispute lane — urgent operator; no weak generic apology draft.",
    primaryGapIfUnmet: "missing_operator_behavior",
  },
  {
    id: "st8-alex-groom-direct-preflight-ie2",
    stressTest: 8,
    title: "Entity: groom emails direct first time — names, date, venue (merge to planner file)",
    rawMessage:
      "Hi Danilo — Alex Latinovic here (groom). Jessica Nicholls and I are getting married May 31 at Lancaster House — can we schedule a short pre-wedding call this week?",
    audience: minimalAudience({ recipientCount: 3 }),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    inboundSenderIdentity: {
      email: "alex.latinovic.personal@gmail.com",
      displayName: "Alex Latinovic",
      domain: "gmail.com",
    },
    expectedProductBehavior:
      "Match direct groom email to existing planner-started dossier; identity/entity routing before routine reply.",
    primaryGapIfUnmet: "routing_identity_bug",
  },
  {
    id: "st8-whatsapp-instead-of-zoom-review",
    stressTest: 8,
    title: "Channel preference: WhatsApp voice instead of Zoom (timeline review)",
    rawMessage:
      "Mark here — for Friday's timeline review can we do WhatsApp voice instead of Zoom? Your Zoom links keep dropping on my phone when I travel.",
    audience: minimalAudience({ recipientCount: 4 }),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    inboundSenderAuthority: plannerAuthority(MARK_PLANNER_PERSON),
    expectedProductBehavior:
      "Honor explicit channel preference in scheduling tools / CRM — orchestrator proposals alone do not replace calendar + channel policy.",
    primaryGapIfUnmet: "missing_tool",
  },
  // ── Stress test 1 (Dana & Matt / Indalo) ──
  {
    id: "st1-planner-10pct-referral-commission-confirm",
    stressTest: 1,
    title: "Commercial: planner asks to confirm 10% referral commission (Indalo)",
    rawMessage:
      "Anne here from Indalo Travel — we need to renegotiate the referral terms: please confirm in writing our standard 10% referral commission on every wedding booking we introduce to the studio, and update the contract addendum accordingly.",
    audience: minimalAudience({ recipientCount: 4 }),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    inboundSenderAuthority: plannerAuthority(ANNE_PLANNER_PERSON),
    expectedProductBehavior:
      "Planner cannot bind commission terms autonomously — authority policy + operator-owned commercial reply.",
    primaryGapIfUnmet: "missing_operator_behavior",
  },
  // ── Stress test 2 (Chanthima / dual wedding + banking) ──
  {
    id: "st2-uk-sterling-only-clauses-13-14",
    stressTest: 2,
    title: "Banking: UK sterling only per modified contract clauses 13–14",
    rawMessage:
      "Our bank will not transfer to Serbia anymore — per our modified contract clauses 13 and 14, all remaining balances must be wired to the UK sterling account only. Please re-send the GBP IBAN and sort code.",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Payment-rail change + rail details — banking compliance exception; never invent account numbers.",
    primaryGapIfUnmet: "missing_verifier_rule",
  },
  {
    id: "st2-dual-invoice-which-wedding-text-only",
    stressTest: 2,
    title: "Dual-booking text: Cambodia vs Italy weddings + which deposit (single CRM wedding link)",
    rawMessage:
      "For our Cambodia wedding in April vs the Italy wedding in June — does the wire we sent Tuesday apply to the Cambodia deposit invoice or the Italy deposit invoice?",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    candidateWeddingIds: [FAKE_WEDDING],
    expectedProductBehavior:
      "Same as batch-1 Phase-2 dual-booking cue — IE2 should block routine send when only one thread_weddings row.",
    primaryGapIfUnmet: "routing_identity_bug",
  },
  // ── Stress test 4 (Javier / Belén — shipping + post-wedding) ──
  {
    id: "st4-album-shipping-miami-bogota-customs",
    stressTest: 4,
    title: "Logistics: two-hop shipping Miami customs → Bogotá (labels sent)",
    rawMessage:
      "Belén here — please ship both Reflections albums to our Miami forwarding address first for Florida customs clearance, then we will re-ship to Bogotá. Use the DHL labels I emailed yesterday.",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Operational fulfillment + customs — CRM/shipping tools; proposal layer alone does not validate labels or duties.",
    primaryGapIfUnmet: "missing_tool",
  },
  {
    id: "st4-third-party-publication-rights-galia-followup",
    stressTest: 4,
    title: "Publication rights: follow-up on third-party designer site (batch-2 adjacent)",
    rawMessage:
      "Following up — did Galia Lahav approve using these ceremony portraits on their editorial blog, or do we still need written permission from the couple?",
    audience: minimalAudience(),
    requestedExecutionMode: "draft_only",
    weddingCrmParityHints: null,
    expectedProductBehavior:
      "Rights / publication judgment — operator or legal workflow; same family as st4-galia-lahav in batch 2.",
    primaryGapIfUnmet: "missing_operator_behavior",
  },
];

export async function runBatch3Harness(): Promise<StressReplayEvalResult[]> {
  const out: StressReplayEvalResult[] = [];
  for (const dp of BATCH3_DECISION_POINTS) {
    out.push(await evaluateDecisionPoint(dp));
  }
  return out;
}
