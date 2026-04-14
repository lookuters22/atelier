/**
 * Hourly sweep for `v3_thread_workflow_state.next_due_at` — creates tenant-scoped `tasks` rows
 * when wire-chase or stalled-inquiry windows elapse (operator hold + wedding pause respected).
 */
import { inngest } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { runV3ThreadWorkflowDueSweep } from "../../_shared/workflow/runV3ThreadWorkflowDueSweep.ts";

export const v3ThreadWorkflowSweepFunction = inngest.createFunction(
  {
    id: "v3-thread-workflow-due-sweep",
    name: "V3 — thread workflow due sweep (wire chase / stalled nudge)",
  },
  { cron: "0 * * * *" },
  async ({ step }) => {
    return await step.run("v3-workflow-due-sweep", async () =>
      runV3ThreadWorkflowDueSweep(supabaseAdmin, { limit: 50 }),
    );
  },
);
