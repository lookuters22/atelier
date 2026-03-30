import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { supabase } from "../lib/supabase";

/** Portrait for Jelena (replace with your own asset in `/public` if you prefer) */
const JELENA_AVATAR_SRC =
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=128&h=128&fit=crop&auto=format&q=80";

type ChatRole = "user" | "assistant";

type ChatLine = {
  id: string;
  role: ChatRole;
  text: string;
};

const DEMO_REPLIES = [
  "Thanks — I’m here. What’s the main thing you need help with?",
  "Got it. Which wedding is this about, or is it a general product question?",
  "On it. If you can share a bit more detail, I can be more specific.",
];

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Persistent launcher + panel: photographers can ask quick questions from the web app (demo: no backend).
 */
export function SupportAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [jelenaTyping, setJelenaTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, jelenaTyping, open]);

  async function submitQuestion() {
    const text = question.trim();
    if (!text || isSubmitting) return;

    const userLine: ChatLine = { id: nextId(), role: "user", text };
    setMessages((m) => [...m, userLine]);
    setQuestion("");
    setIsSubmitting(true);
    setJelenaTyping(true);

    try {
      const { error } = await supabase.functions.invoke("webhook-web", {
        body: { message: text },
      });

      if (error) throw error;

      setMessages((m) => [
        ...m,
        { id: nextId(), role: "assistant", text: "Got it — I've routed your question to the right team. You'll see an update in your inbox shortly." },
      ]);
      setJelenaTyping(false);
      setIsSubmitting(false);
      setTimeout(() => setOpen(false), 1500);
    } catch (err) {
      setJelenaTyping(false);
      setIsSubmitting(false);
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Failed to send message: ${msg}`);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[80] flex max-w-[calc(100vw-3rem)] flex-col items-end gap-3">
      {open ? (
        <div
          id="support-assistant-panel"
          className="pointer-events-auto flex max-h-[min(70vh,28rem)] w-[min(100vw-2rem,20rem)] flex-col rounded-2xl border border-border bg-surface p-4 ring-1 ring-black/[0.06]"
          role="dialog"
          aria-label="Jelena support chat"
        >
          <div className="flex shrink-0 items-start gap-3">
            <img
              src={JELENA_AVATAR_SRC}
              alt="Jelena"
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-border/70"
              loading="lazy"
              decoding="async"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Support</p>
              <p className="mt-0.5 text-[15px] font-semibold text-ink">Jelena</p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-full p-1.5 text-ink-faint transition hover:bg-canvas hover:text-ink"
              aria-label="Close support"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div
            ref={listRef}
            className="mt-3 min-h-[6rem] flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[92%] rounded-2xl rounded-br-md bg-ink px-3 py-2 text-[13px] leading-snug text-canvas">
                    {m.text}
                  </p>
                </div>
              ) : (
                <div key={m.id} className="flex gap-2">
                  <img
                    src={JELENA_AVATAR_SRC}
                    alt=""
                    width={28}
                    height={28}
                    className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border/60"
                  />
                  <p className="max-w-[calc(100%-2.25rem)] rounded-2xl rounded-bl-md border border-border bg-canvas px-3 py-2 text-[13px] leading-snug text-ink">
                    {m.text}
                  </p>
                </div>
              ),
            )}
            {jelenaTyping ? (
              <div className="flex gap-2">
                <img
                  src={JELENA_AVATAR_SRC}
                  alt=""
                  width={28}
                  height={28}
                  className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border/60"
                />
                <div className="rounded-2xl rounded-bl-md border border-border bg-canvas px-3 py-2 text-[12px] italic text-ink-faint">
                  Jelena is typing…
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-3 shrink-0 border-t border-border/80 pt-3">
            <label htmlFor="support-question" className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Quick question (web)
            </label>
            <textarea
              id="support-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitQuestion();
                }
              }}
              rows={2}
              placeholder="e.g. How do approvals work?"
              disabled={isSubmitting}
              className="mt-1.5 w-full resize-none rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/25 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={submitQuestion}
              disabled={isSubmitting || !question.trim()}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-2 text-[13px] font-semibold text-canvas transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={2} />
              {isSubmitting ? "Sending\u2026" : "Send"}
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink ring-1 ring-black/[0.06] transition hover:border-accent/30 hover:text-accent"
        aria-expanded={open}
        aria-controls="support-assistant-panel"
      >
        {open ? (
          <>
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            Close
          </>
        ) : (
          <>
            <MessageCircle className="h-4 w-4 text-[#25D366]" strokeWidth={2} aria-hidden />
            Jelena
          </>
        )}
      </button>
    </div>
  );
}
