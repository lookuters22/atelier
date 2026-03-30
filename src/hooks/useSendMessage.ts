import { useCallback, useState } from "react";
import { supabase } from "../lib/supabase";

export type SendMessageParams = {
  threadId: string;
  photographerId: string;
  body: string;
  isInternal: boolean;
};

export type SendMessageResult =
  | { success: true }
  | { success: false; error: string };

export function useSendMessage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (params: SendMessageParams): Promise<SendMessageResult> => {
    const { threadId, photographerId, body, isInternal } = params;
    const trimmed = body.trim();
    if (!trimmed) {
      setError(null);
      return { success: false, error: "Message is empty." };
    }

    setIsLoading(true);
    setError(null);

    const fail = (msg: string): SendMessageResult => {
      setError(msg);
      return { success: false, error: msg };
    };

    try {
      const { data: thread, error: threadErr } = await supabase
        .from("threads")
        .select("id, wedding_id")
        .eq("id", threadId)
        .maybeSingle();

      if (threadErr || !thread) {
        return fail(threadErr?.message ?? "Thread not found.");
      }

      const { data: wedding, error: weddingErr } = await supabase
        .from("weddings")
        .select("photographer_id")
        .eq("id", thread.wedding_id)
        .maybeSingle();

      if (weddingErr || !wedding || wedding.photographer_id !== photographerId) {
        return fail(weddingErr?.message ?? "Not allowed for this wedding.");
      }

      const { error: insertErr } = await supabase.from("messages").insert({
        thread_id: threadId,
        direction: isInternal ? "internal" : "out",
        sender: "Studio",
        body: trimmed,
      });

      if (insertErr) {
        return fail(insertErr.message);
      }

      setError(null);
      return { success: true };
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { sendMessage, isLoading, error };
}
