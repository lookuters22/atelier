/**
 * Outbound Worker — Send & Record.
 *
 * Listens for approval/draft.approved.
 *
 * 1. Fetch the draft and verify it's still pending_approval (prevent double-send).
 * 2. Execute the outbound delivery (Gmail/WhatsApp — mock for now).
 * 3. Record the sent message in the messages table.
 * 4. Mark the draft as approved.
 */
import { inngest } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

export const outboundFunction = inngest.createFunction(
  { id: "outbound-worker", name: "Outbound Worker — Send & Record" },
  { event: "approval/draft.approved" },
  async ({ event, step }) => {
    const { draft_id } = event.data;

    // ── Step 1: Fetch draft & guard against double-send ──────────
    const draft = await step.run("fetch-draft", async () => {
      const { data, error } = await supabaseAdmin
        .from("drafts")
        .select("id, thread_id, body, status")
        .eq("id", draft_id)
        .single();

      if (error || !data) {
        throw new Error(`Draft not found: ${error?.message ?? draft_id}`);
      }

      if ((data.status as string) !== "pending_approval") {
        throw new Error(
          `Draft ${draft_id} is not pending_approval (status: ${data.status}). Aborting to prevent double-send.`,
        );
      }

      return {
        id: data.id as string,
        threadId: data.thread_id as string,
        body: data.body as string,
      };
    });

    // ── Step 2: Execute outbound delivery (mock) ─────────────────
    await step.run("execute-send", async () => {
      console.log(
        `[MOCK SEND] Executing outbound delivery for thread ${draft.threadId}...`,
      );
    });

    // ── Step 3: Record the sent message ──────────────────────────
    await step.run("record-message", async () => {
      const { error } = await supabaseAdmin.from("messages").insert({
        thread_id: draft.threadId,
        direction: "out",
        sender: "photographer",
        body: draft.body,
      });

      if (error) {
        throw new Error(`Failed to record outbound message: ${error.message}`);
      }
    });

    // ── Step 4: Mark draft as approved ───────────────────────────
    await step.run("update-draft-status", async () => {
      const { error } = await supabaseAdmin
        .from("drafts")
        .update({ status: "approved" })
        .eq("id", draft_id);

      if (error) {
        throw new Error(`Failed to update draft status: ${error.message}`);
      }
    });

    return {
      status: "sent_and_recorded",
      draft_id,
      thread_id: draft.threadId,
    };
  },
);
