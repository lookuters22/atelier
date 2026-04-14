/**
 * Shared copy for V3 audience/RBAC proof harnesses and unit tests.
 * Stress Test 7 (Parya / Infinity): commission secrecy + direct vs agency merge context.
 * Stress Test 5 (Lavender & Rose): agency CC, assistant mail, direct client contact — audience must stay safe when mixed.
 * Stress Test 8 (Mark/Jessica/Alex): planner-started vs groom direct outreach — conservative classification when roles are unclear.
 */

/** Stress Test 7 — private commercial text as it might appear in `memories` or thread summaries. */
export const STRESS_TEST_7_PRIVATE_COMMERCIAL_MEMORY = `Stress Test 7 harness — private commercial context.
Planner commission: 12% on net package after agency fee.
Agency fee: 15% on vendor referrals.
Internal negotiation: agreed not to disclose markup margin to the couple.`;

/**
 * Stress Test 5 — agency-managed dossier; same sensitive token shapes as ST7 for redaction/auditor parity tests.
 */
export const STRESS_TEST_5_PRIVATE_COMMERCIAL_MEMORY = `Stress Test 5 — Lavender & Rose agency thread.
Planner commission and agency fee are agreed with the agency only — internal negotiation: list 39k vs client budget 30k.
Direct WhatsApp with the couple does not change that planner commission is invisible to the client thread.`;

/**
 * Stress Test 8 — entity-merge confusion; same sensitive shapes so redaction proves end-to-end.
 */
export const STRESS_TEST_8_PRIVATE_COMMERCIAL_MEMORY = `Stress Test 8 — planner-started wedding + groom direct outreach merged.
Internal markup notes and planner commission stay in the studio/agency lane; agency fee handling is internal only.
Internal negotiation: do not surface agency fee to the couple until credits clear.`;

/** Live DB harness uses one canonical blob so signal probes stay stable across ST5/ST8 participant shapes. */
export const STRESS_TEST_RBAC_LIVE_HARNESS_MEMORY = STRESS_TEST_7_PRIVATE_COMMERCIAL_MEMORY;

/** Synthetic persona draft that must be blocked when audience is client-visible (verifier backstop). */
export const STRESS_TEST_7_LEAKY_DRAFT_SIMULATION =
  "We confirm the planner commission and agency fee as discussed in our internal negotiation.";

/** Safe client-facing draft under enforcement. */
export const STRESS_TEST_7_CLEAN_DRAFT_SIMULATION =
  "Thank you — we will send the timeline you requested and follow up on the venue walk-through.";

/** Stress Test 5 (Lavender & Rose): agency CC + direct WhatsApp — future replay should prove planner CC + audience. */
export const STRESS_TEST_5_AUDIENCE_NOTES = `Stress Test 5 — agency-managed thread shape (fixture notes only).
Prove: assistant emails and direct client contact still attach to planner dossier; agency CC rules and audience classification.`;

/** Stress Test 8 (Mark/Jessica/Alex): entity merge + PR — future replay. */
export const STRESS_TEST_8_AUDIENCE_NOTES = `Stress Test 8 — planner-started vs direct outreach merge (fixture notes only).
Prove: Alex outreach resolves to existing wedding; audience + publication/insurance paths remain separate slices.`;
