/**
 * Studio Worker — Post-Production & Upsells.
 *
 * Listens for ai/intent.studio.
 *
 * 1. Fetch the wedding record for date, couple names, and stage.
 * 2. Calculate how many weeks since the wedding to determine editing status.
 * 3. Draft a polite progress update and insert it for human approval.
 */
import { inngest } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import {
  isWeddingAutomationPaused,
  logAutomationPauseObservation,
  WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
} from "../../_shared/weddingAutomationPause.ts";

type EditingStatus = {
  weeksPassed: number;
  estimatedDelivery: string;
  status: string;
};

function calculateEditingStatus(weddingDate: string): EditingStatus {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksPassed = Math.max(
    0,
    Math.floor((Date.now() - new Date(weddingDate).getTime()) / msPerWeek),
  );

  if (weeksPassed <= 2) {
    return { weeksPassed, estimatedDelivery: "6 weeks", status: "Culling & initial selects" };
  }
  if (weeksPassed <= 5) {
    return { weeksPassed, estimatedDelivery: "3 weeks", status: "Color grading in progress" };
  }
  if (weeksPassed <= 7) {
    return { weeksPassed, estimatedDelivery: "1 week", status: "Final retouching & gallery build" };
  }
  return { weeksPassed, estimatedDelivery: "Ready", status: "Gallery delivered" };
}

export const studioFunction = inngest.createFunction(
  { id: "studio-worker", name: "Studio Worker — Post-Production & Upsells" },
  { event: "ai/intent.studio" },
  async ({ event, step }) => {
    const { wedding_id, raw_message, photographer_id } = event.data;

    if (!photographer_id || typeof photographer_id !== "string") {
      throw new Error("ai/intent.studio: missing photographer_id (tenant-proof required)");
    }

    const wedding = await step.run("fetch-wedding", async () => {
      const { data, error } = await supabaseAdmin
        .from("weddings")
        .select("id, couple_names, wedding_date, stage, compassion_pause, strategic_pause")
        .eq("id", wedding_id)
        .eq("photographer_id", photographer_id)
        .single();

      if (error || !data) {
        throw new Error(`Wedding not found: ${error?.message ?? wedding_id}`);
      }

      return data as {
        id: string;
        couple_names: string;
        wedding_date: string;
        stage: string;
        compassion_pause: boolean;
        strategic_pause: boolean;
      };
    });

    if (isWeddingAutomationPaused(wedding)) {
      logAutomationPauseObservation({
        observation_type: "inngest_worker_skipped",
        skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
        inngest_function_id: "studio-worker",
        wedding_id,
        photographer_id,
      });
      return {
        status: "skipped_wedding_automation_paused" as const,
        skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
        wedding_id,
      };
    }

    const threadId = await step.run("resolve-thread", async () => {
      const { data } = await supabaseAdmin
        .from("threads")
        .select("id")
        .eq("wedding_id", wedding_id)
        .eq("photographer_id", photographer_id)
        .order("last_activity_at", { ascending: false })
        .limit(1);

      const id = (data?.[0]?.id as string) ?? null;
      if (!id) throw new Error(`No thread found for wedding ${wedding_id}`);
      return id;
    });

    const draftOutcome = await step.run("draft-response", async () => {
      const { data: weddingNow, error: wNowErr } = await supabaseAdmin
        .from("weddings")
        .select("couple_names, wedding_date, compassion_pause, strategic_pause")
        .eq("id", wedding_id)
        .eq("photographer_id", photographer_id)
        .single();

      if (wNowErr || !weddingNow) {
        throw new Error(`Wedding not found before studio draft: ${wNowErr?.message ?? wedding_id}`);
      }

      if (isWeddingAutomationPaused(weddingNow)) {
        logAutomationPauseObservation({
          observation_type: "inngest_worker_skipped",
          skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
          inngest_function_id: "studio-worker",
          wedding_id,
          photographer_id,
          gate: "draft_pre_insert",
        });
        return { kind: "skipped_pause" as const };
      }

      const timelineNow = calculateEditingStatus(weddingNow.wedding_date as string);
      const couple = (weddingNow.couple_names as string) || "there";
      const body =
        `Hi ${couple},\n\n` +
        `Your photos are currently in the ${timelineNow.status.toLowerCase()} phase! ` +
        `It has been ${timelineNow.weeksPassed} week${timelineNow.weeksPassed === 1 ? "" : "s"} since your wedding, ` +
        `and we are right on track to deliver your gallery in ${timelineNow.estimatedDelivery}.\n\n` +
        `If you'd like to discuss album options or wall art, just reply to this thread — ` +
        `we'd love to help you choose something beautiful.\n\n` +
        `Warmly,\nThe Studio`;

      const { data, error } = await supabaseAdmin
        .from("drafts")
        .insert({
          photographer_id,
          thread_id: threadId,
          status: "pending_approval",
          body,
          instruction_history: [
            {
              step: "studio",
              raw_message: raw_message.slice(0, 500),
              editing_status: timelineNow,
            },
          ],
        })
        .select("id")
        .single();

      if (error) throw new Error(`Failed to insert draft: ${error.message}`);
      return { kind: "drafted" as const, draftId: data.id as string, timeline: timelineNow };
    });

    if (draftOutcome.kind === "skipped_pause") {
      return {
        status: "skipped_wedding_automation_paused" as const,
        skip_reason: WEDDING_AUTOMATION_PAUSED_SKIP_REASON,
        wedding_id,
      };
    }

    return {
      status: "draft_pending_approval",
      wedding_id,
      threadId,
      draftId: draftOutcome.draftId,
      timeline: draftOutcome.timeline,
    };
  },
);
