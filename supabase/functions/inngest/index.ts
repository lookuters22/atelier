/**
 * Inngest API endpoint for Supabase Edge Functions.
 * Register this URL in Inngest Cloud (GET/PUT/POST for sync + invoke).
 *
 * ## Hosted Supabase — required secrets (project → Edge Functions → Secrets)
 * - `INNGEST_SIGNING_KEY` — Inngest Cloud → signing key for this environment (validates sync + invokes).
 * - `INNGEST_EVENT_KEY` — Event API key (used by `gmail-enqueue-label-sync` and other emitters; must match app `atelier-os`).
 * - `INNGEST_ALLOW_IN_BAND_SYNC=1` — strongly recommended so Cloud sync registers the full function bundle (see #1929 below).
 * - Optional: `INNGEST_SERVE_HOST` — set to `https://<project-ref>.supabase.co` if the sync URL is rewritten (edge-runtime) and functions are missing.
 *
 * ## Post-deploy verification (Inngest Cloud)
 * 1. Apps → Sync URL must be `https://<project-ref>.supabase.co/functions/v1/inngest` (PUT/GET for sync).
 * 2. After sync, Functions includes `sync-gmail-label-import-candidates` with trigger `import/gmail.label_sync.v1`.
 * 3. Send a test event or enqueue from Settings; Runs should show an execution for that function.
 *
 * **Supabase Edge:** set project secret `INNGEST_ALLOW_IN_BAND_SYNC=1` so Inngest Cloud sync picks up the
 * full `serve()` function list (avoids “event accepted, no functions triggered” for triggers like
 * `ai/orchestrator.client.v1`). See https://github.com/inngest/inngest/issues/1929#issuecomment-2474770494
 *
 * Phase 0 Step 0D (`docs/v3/execute_v3.md`): do not remove or unregister workers here
 * in small slices—keep every import and `functions` entry until a dedicated cutover phase.
 *
 * `clientOrchestratorV1Function` (`ai/orchestrator.client.v1`): QA/replay; optional **shadow** from `triage`; optional
 * **CUT2** live for web-widget known-wedding only (`TRIAGE_LIVE_ORCHESTRATOR_WEB_WIDGET_KNOWN_WEDDING_V1`, draft_only);
 * **CUT2 D1 execution:** triage reads `TRIAGE_D1_CUT2_WEB_WIDGET_LEGACY_CONCIERGE_DISPATCH_V1` on web-widget known-wedding; return `cut2_web_widget_d1_prep` v2 (`docs/v3/CUT2_WEB_WIDGET_D1_PREP_SLICE.md`);
 * optional **CUT4** live for main-path concierge + known wedding (`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_CONCIERGE_KNOWN_WEDDING_V1`);
 * **CUT4 D1 execution:** triage reads `TRIAGE_D1_CUT4_MAIN_PATH_CONCIERGE_LEGACY_CONCIERGE_DISPATCH_V1` on main-path concierge+known-wedding; `cut4_main_path_concierge_d1_prep` v2 (`docs/v3/CUT4_MAIN_PATH_CONCIERGE_D1_PREP_SLICE.md`);
 * **CUT5 D1 execution:** triage reads `TRIAGE_D1_CUT5_MAIN_PATH_PROJECT_MANAGEMENT_LEGACY_DISPATCH_V1` on main-path PM+known-wedding; `cut5_main_path_project_management_d1_prep` v2 (`docs/v3/CUT5_MAIN_PATH_PROJECT_MANAGEMENT_D1_PREP_SLICE.md`);
 * optional **CUT5** live for main-path project_management + known wedding
 * (`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_PROJECT_MANAGEMENT_KNOWN_WEDDING_V1`); optional **CUT6** live for main-path
 * logistics + known wedding (`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_LOGISTICS_KNOWN_WEDDING_V1`);
 * **CUT6 D1 execution:** triage reads `TRIAGE_D1_CUT6_MAIN_PATH_LOGISTICS_LEGACY_DISPATCH_V1` on main-path logistics+known-wedding; `cut6_main_path_logistics_d1_prep` v2 (`docs/v3/CUT6_MAIN_PATH_LOGISTICS_D1_PREP_SLICE.md`);
 * optional **CUT7** live for
 * main-path commercial + known wedding (`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_COMMERCIAL_KNOWN_WEDDING_V1`);
 * **CUT7 D1 execution:** triage reads `TRIAGE_D1_CUT7_MAIN_PATH_COMMERCIAL_LEGACY_DISPATCH_V1` on main-path commercial+known-wedding; `cut7_main_path_commercial_d1_prep` v2 (`docs/v3/CUT7_MAIN_PATH_COMMERCIAL_D1_PREP_SLICE.md`);
 * optional **CUT8** live for main-path studio + known wedding (`TRIAGE_LIVE_ORCHESTRATOR_MAIN_PATH_STUDIO_KNOWN_WEDDING_V1`);
 * **CUT8 D1 execution:** triage reads `TRIAGE_D1_CUT8_MAIN_PATH_STUDIO_LEGACY_DISPATCH_V1` on main-path studio+known-wedding; `cut8_main_path_studio_d1_prep` v2 (`docs/v3/CUT8_MAIN_PATH_STUDIO_D1_PREP_SLICE.md`).
 * Optional **intake post-bootstrap parity** (`INTAKE_SHADOW_ORCHESTRATOR_POST_BOOTSTRAP_V1`) — observation-only
 * `ai/orchestrator.client.v1` after lead bootstrap; legacy `ai/intent.persona` remains live.
 * Optional **intake post-bootstrap live email** (`INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1` + explicit email
 * reply_channel) — `draft_only` orchestrator replaces persona that turn (no duplicate parity send).
 * Optional **intake + web reply_channel hook** (`INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_WEB_V1`) — not a client-intake
 * migration target (dashboard web = photographer ↔ Ana). Client intake live path is email gate only.
 * All other live email/web remains legacy `ai/intent.*`.
 *
 * **Legacy email/web specialist workers (triage `INTENT_EVENT_MAP` + web-widget `ai/intent.concierge`):**
 * `concierge`, `logistics`, `commercial`, `projectManager`, `studio`, `intake` — remain registered until RET1+
 * proves triage no longer dispatches their event for supported paths; CUT2/CUT4–CUT8 gates **off** = rollback to
 * these workers. Inventory: `docs/v3/LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md`.
 * **RET1:** triage return `retirement_dispatch_observability_v1` + log `[triage.retirement_dispatch_v1]` (§5 same doc).
 *
 * **Phase 2 Slice D1 (retirement prep):** Producer/ingress audit — no workers removed; see
 * `docs/v3/PHASE2_SLICE_D1_RETIREMENT_PREP_AUDIT.md`. **RET2 unregister-readiness** (legacy `ai/intent.*` only):
 * `docs/v3/RET2_UNREGISTER_READINESS_AUDIT.md` — no unregister in that audit slice.
 * **RET2 pilot:** `docs/v3/RET2_PILOT_CANDIDATE_SELECTION.md` — production RET1 rollup + one pilot rule. Unregister only after D2 execution
 * with proven-dead paths per worker.
 */
import { serve } from "npm:inngest@3/edge";
import { inngest } from "../_shared/inngest.ts";
import { LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA } from "../_shared/legacyRoutingCutoverGate.ts";
import { triageFunction } from "./functions/triage.ts";
import { intakeFunction } from "./functions/intake.ts";
import { outboundFunction } from "./functions/outbound.ts";
import { rewriteFunction } from "./functions/rewrite.ts";
import { conciergeFunction } from "./functions/concierge.ts";
import { logisticsFunction } from "./functions/logistics.ts";
import { commercialFunction } from "./functions/commercial.ts";
import { projectManagerFunction } from "./functions/projectManager.ts";
import { studioFunction } from "./functions/studio.ts";
import { personaFunction } from "./functions/persona.ts";
import { internalConciergeFunction } from "./functions/internalConcierge.ts";
import { whatsappOrchestratorFunction } from "./functions/whatsappOrchestrator.ts";
import { calendarRemindersFunction } from "./functions/calendarReminders.ts";
import { contractFollowupFunction } from "./functions/milestoneFollowups.ts";
import { prepPhaseFunction } from "./functions/prepPhaseFollowups.ts";
import { postWeddingFunction } from "./functions/postWeddingFlow.ts";
import { clientOrchestratorV1Function } from "./functions/clientOrchestratorV1.ts";
import { operatorOrchestratorFunction } from "./functions/operatorOrchestrator.ts";
import { operatorEscalationDeliveryFunction } from "./functions/operatorEscalationDelivery.ts";
import { v3ThreadWorkflowSweepFunction } from "./functions/v3ThreadWorkflowSweep.ts";
import { syncGmailLabelImportCandidates } from "./functions/syncGmailLabelImportCandidates.ts";
import { prepareGmailImportCandidateMaterialization } from "./functions/prepareGmailImportCandidateMaterialization.ts";
import { backfillGmailImportCandidateMaterialization } from "./functions/backfillGmailImportCandidateMaterialization.ts";
import { processGmailLabelGroupApproval } from "./functions/processGmailLabelGroupApproval.ts";
import { processGmailSingleImportCandidateApprove } from "./functions/processGmailSingleImportCandidateApprove.ts";
import { processEscalationResolutionQueued } from "./functions/processEscalationResolutionQueued.ts";
import { processGmailLabelsRefresh } from "./functions/processGmailLabelsRefresh.ts";
import { repairGmailMessagesInlineHtmlArtifacts } from "./functions/repairGmailMessagesInlineHtmlArtifacts.ts";
import { repairGmailImportCandidateArtifactInlineHtml } from "./functions/repairGmailImportCandidateArtifactInlineHtml.ts";

/** Step 12D anchor: retain legacy registration until cutover; referenced so the gate module stays linked. */
void LEGACY_ROUTING_RETAINED_PENDING_STEP12_EXIT_CRITERIA;

/**
 * Public URL path on Supabase: `/functions/v1/inngest` (function name `inngest`).
 * `serveHost` defaults from the incoming request; override with `INNGEST_SERVE_HOST` if Inngest Cloud shows a wrong host.
 */
const serveHost = Deno.env.get("INNGEST_SERVE_HOST")?.trim();

const handler = serve({
  client: inngest,
  servePath: "/functions/v1/inngest",
  ...(serveHost ? { serveHost } : {}),
  functions: [
    triageFunction,
    intakeFunction,
    outboundFunction,
    rewriteFunction,
    conciergeFunction,
    logisticsFunction,
    commercialFunction,
    projectManagerFunction,
    studioFunction,
    personaFunction,
    internalConciergeFunction,
    whatsappOrchestratorFunction,
    calendarRemindersFunction,
    contractFollowupFunction,
    prepPhaseFunction,
    postWeddingFunction,
    clientOrchestratorV1Function,
    operatorOrchestratorFunction,
    operatorEscalationDeliveryFunction,
    v3ThreadWorkflowSweepFunction,
    syncGmailLabelImportCandidates,
    prepareGmailImportCandidateMaterialization,
    backfillGmailImportCandidateMaterialization,
    processGmailLabelGroupApproval,
    processGmailSingleImportCandidateApprove,
    processEscalationResolutionQueued,
    processGmailLabelsRefresh,
    repairGmailMessagesInlineHtmlArtifacts,
    repairGmailImportCandidateArtifactInlineHtml,
  ],
});

Deno.serve(handler);
