/**
 * A6: Single emit for `approval/draft.approved` (outbound worker input).
 */
import { inngest } from "./inngest.ts";

export async function emitDraftApprovedEvent(params: {
  draft_id: string;
  photographer_id: string;
  edited_body: string | null;
}): Promise<void> {
  await inngest.send({
    name: "approval/draft.approved",
    data: params,
  });
}
