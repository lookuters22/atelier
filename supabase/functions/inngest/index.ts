/**
 * Inngest API endpoint for Supabase Edge Functions.
 * Register this URL in Inngest Cloud (GET/PUT/POST for sync + invoke).
 */
import { serve } from "npm:inngest@3/edge";
import { inngest } from "../_shared/inngest.ts";
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

const handler = serve({
  client: inngest,
  functions: [triageFunction, intakeFunction, outboundFunction, rewriteFunction, conciergeFunction, logisticsFunction, commercialFunction, projectManagerFunction, studioFunction, personaFunction, internalConciergeFunction],
});

Deno.serve(handler);
