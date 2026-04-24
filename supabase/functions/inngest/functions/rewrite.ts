/**
 * Rewrite Worker — regenerates a rejected draft using photographer feedback.
 *
 * Step 9C: rewrite feedback is captured as a `memories` learning input — not playbook_rules.
 *
 * Listens for ai/draft.rewrite_requested.
 *
 * 1. Fetch the draft, its thread, and wedding context.
 * 2. Call the Persona Agent with the feedback as an overriding instruction.
 * 3. Update the draft with the new body, flip status back to pending_approval,
 *    and append the feedback to instruction_history for audit.
 */
import { captureDraftLearningInput } from "../../_shared/captureDraftLearningInput.ts";
import { evaluateRewriteDraftUpdatePauseGate } from "../../_shared/inngestClientFreshPauseGates.ts";
import { inngest } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { runPersonaAgent, type PersonaContext } from "../../_shared/agents/persona.ts";
import {
  isWeddingAutomationPaused,
  logAutomationPauseObservation,
  WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
} from "../../_shared/weddingAutomationPause.ts";

export const rewriteFunction = inngest.createFunction(
  { id: "rewrite-worker", name: "Rewrite Worker — Feedback Loop" },
  { event: "ai/draft.rewrite_requested" },
  async ({ event, step }) => {
    const { draft_id, feedback } = event.data;

    const context = await step.run("fetch-draft-context", async () => {
      const { data: draft, error: draftErr } = await supabaseAdmin
        .from("drafts")
        .select("*, threads(id, title, wedding_id)")
        .eq("id", draft_id)
        .single();

      if (draftErr || !draft) {
        throw new Error(`Draft not found: ${draftErr?.message ?? draft_id}`);
      }

      const thread = draft.threads as Record<string, unknown>;
      const weddingId = thread.wedding_id as string;

      const photographerId = draft.photographer_id as string;

      const { data: wedding, error: weddingErr } = await supabaseAdmin
        .from("weddings")
        .select("couple_names, wedding_date, location, compassion_pause, strategic_pause")
        .eq("id", weddingId)
        .eq("photographer_id", photographerId)
        .single();

      if (weddingErr || !wedding) {
        throw new Error(`Wedding not found: ${weddingErr?.message ?? weddingId}`);
      }

      return {
        draftBody: draft.body as string,
        instructionHistory: (draft.instruction_history ?? []) as Record<string, unknown>[],
        photographerId,
        threadId: thread.id as string,
        weddingId,
        couple_names: wedding.couple_names as string,
        wedding_date: (wedding.wedding_date as string) ?? null,
        location: (wedding.location as string) ?? null,
        compassion_pause: wedding.compassion_pause as boolean | null,
        strategic_pause: wedding.strategic_pause as boolean | null,
      };
    });

    if (isWeddingAutomationPaused(context)) {
      logAutomationPauseObservation({
        observation_type: "inngest_worker_skipped",
        skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
        inngest_function_id: "rewrite-worker",
        wedding_id: context.weddingId,
        thread_id: context.threadId,
        photographer_id: context.photographerId,
        draft_id,
        gate: "post_fetch_context",
      });
      return {
        status: "skipped_wedding_automation_paused" as const,
        draft_id,
        skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
      };
    }

    const newBody = await step.run("rewrite-with-persona", async () => {
      const bullets: string[] = [
        `PHOTOGRAPHER FEEDBACK (highest priority): ${feedback}`,
        `Previous draft for reference:\n${context.draftBody}`,
      ];

      const personaContext: PersonaContext = {
        couple_names: context.couple_names,
        wedding_date: context.wedding_date,
        location: context.location,
        budget: null,
      };

      return runPersonaAgent(bullets, personaContext);
    });

    const updateGate = await step.run("rewrite-pause-gate-before-update", async () =>
      evaluateRewriteDraftUpdatePauseGate(supabaseAdmin, {
        weddingId: context.weddingId,
        photographerId: context.photographerId,
        draftId: draft_id,
        threadId: context.threadId,
      }),
    );

    if (!updateGate.allowUpdate) {
      return {
        status:
          updateGate.skip_reason === WEDDING_AUTOMATION_PAUSED_SKIP_REASON
            ? ("skipped_wedding_automation_paused" as const)
            : ("skipped_wedding_pause_state_unconfirmed" as const),
        draft_id,
        skip_reason: updateGate.skip_reason,
      };
    }

    await step.run("update-draft-with-rewrite", async () => {
      const updatedHistory = [
        ...context.instructionHistory,
        {
          step: "rewrite",
          feedback,
          rewritten_at: new Date().toISOString(),
        },
      ];

      const { error } = await supabaseAdmin
        .from("drafts")
        .update({
          body: newBody,
          status: "pending_approval",
          instruction_history: updatedHistory,
        })
        .eq("id", draft_id);

      if (error) {
        throw new Error(`Failed to update draft: ${error.message}`);
      }
    });

    await step.run("capture-draft-rewrite-feedback-learning", async () => {
      const fb = String(feedback ?? "").trim();
      if (!fb) return;
      await captureDraftLearningInput(supabaseAdmin, {
        channel: "rewrite_feedback",
        photographerId: context.photographerId,
        weddingId: context.weddingId,
        draftId: draft_id,
        feedback: fb,
      });
    });

    return { status: "rewrite_complete", draft_id };
  },
);
