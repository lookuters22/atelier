/**
 * A6: Single emit for `ai/draft.rewrite_requested` (reject → AI rewrite pipeline).
 */
import { inngest } from "./inngest.ts";

export async function emitDraftRewriteRequestedEvent(params: {
  draft_id: string;
  feedback: string;
}): Promise<void> {
  await inngest.send({
    name: "ai/draft.rewrite_requested",
    data: params,
  });
}
