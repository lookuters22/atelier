import { useEffect, useMemo, useRef, useState } from "react";
import type { WeddingPersonRow } from "../data/weddingPeopleDefaults";
import { getMessagesForThread, type WeddingThread } from "../data/weddingThreads";
import { buildReplyMeta, firstEmailFromPeople } from "../lib/weddingDetailUtils";
import type { ComposerKind, ReplyScope } from "../lib/weddingDetailTypes";
import type { SendMessageParams, SendMessageResult } from "./useSendMessage";

export function useWeddingComposer({
  activeThread,
  people,
  draftPendingByThread,
  draftDefault,
  selectedThreadId,
  photographerId,
  sendMessage,
  showToast,
}: {
  activeThread: WeddingThread | undefined;
  people: WeddingPersonRow[];
  draftPendingByThread: Record<string, boolean>;
  draftDefault: string;
  selectedThreadId: string;
  photographerId: string;
  sendMessage: (params: SendMessageParams) => Promise<SendMessageResult>;
  showToast: (message: string) => void;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<ComposerKind>("reply");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("Re: Timeline v3 â€” photography coverage");
  const [body, setBody] = useState(draftDefault);
  /** Inline footer reply (chat-style); full composer can pull from this */
  const [replyBody, setReplyBody] = useState("");
  const [replyScope, setReplyScope] = useState<ReplyScope>("reply");
  /** Studio-only note: maps to messages.direction = internal */
  const [isInternalNote, setIsInternalNote] = useState(false);
  const replyAreaRef = useRef<HTMLTextAreaElement>(null);
  const [internalBody, setInternalBody] = useState("");

  const replyMeta = useMemo(
    () => buildReplyMeta(activeThread, people),
    [activeThread, people],
  );

  useEffect(() => {
    setReplyBody("");
    setReplyScope("reply");
    setCc("");
    setIsInternalNote(false);
  }, [selectedThreadId]);

  function applyComposerDefaultsFromThread() {
    if (!activeThread) return;
    const messages = getMessagesForThread(activeThread.id);
    const lastMessage = messages[messages.length - 1];
    const lastMeta = lastMessage?.meta?.trim();
    const toFromMeta = lastMeta && lastMeta.includes("@") ? lastMeta : undefined;
    const fromPeople = firstEmailFromPeople(people);
    setTo(activeThread.composerTo ?? toFromMeta ?? fromPeople ?? "");
    const nextSubject =
      activeThread.composerSubjectDefault ??
      (lastMessage?.subject ? `Re: ${lastMessage.subject}` : subject);
    setSubject(nextSubject);
  }

  /** Sync To/Cc/Subject for modal + inline Reply vs Reply all (demo recipients). */
  function applyReplyScope(scope: ReplyScope) {
    setReplyScope(scope);
    applyComposerDefaultsFromThread();
    if (scope === "reply") {
      setCc("");
    } else {
      setCc(firstEmailFromPeople(people) ? "sofia@email.com, marco@email.com" : "");
    }
  }

  function openComposer(kind: ComposerKind) {
    setComposerKind(kind);
    if (kind === "reply") {
      applyComposerDefaultsFromThread();
      if (replyScope === "reply") {
        setCc("");
      } else {
        setCc(firstEmailFromPeople(people) ? "sofia@email.com, marco@email.com" : "");
      }
      const pending =
        activeThread &&
        activeThread.hasPendingDraft === true &&
        draftPendingByThread[activeThread.id] === true;
      setBody(
        replyBody.trim() ? replyBody : pending ? draftDefault : body.trim() ? body : "",
      );
    }
    setComposerOpen(true);
  }

  function closeComposer() {
    setComposerOpen(false);
  }

  async function submitInlineForApproval() {
    if (!replyBody.trim()) {
      showToast("Add a message in the box, or tap Generate response.");
      return;
    }
    if (!isInternalNote && !replyMeta.toAddr) {
      showToast("Add someone under People with an email.");
      return;
    }
    if (!selectedThreadId) {
      showToast("Select a thread first.");
      return;
    }

    const wasInternal = isInternalNote;
    const result = await sendMessage({
      threadId: selectedThreadId,
      photographerId,
      body: replyBody,
      isInternal: wasInternal,
    });

    if (result.success) {
      setReplyBody("");
      setIsInternalNote(false);
      showToast(wasInternal ? "Internal note saved." : "Message sent.");
    } else {
      showToast(result.error);
    }
  }

  function toggleInternalNote() {
    setIsInternalNote((v) => !v);
  }

  function editDraftInComposer() {
    applyReplyScope("reply");
    setReplyBody(draftDefault);
    window.requestAnimationFrame(() => replyAreaRef.current?.focus());
  }

  function sendComposer() {
    if (composerKind === "internal") {
      showToast("Internal note saved on this wedding (demo).");
      setInternalBody("");
    } else {
      showToast("Draft submitted for approval â€” check Approvals (demo).");
      setReplyBody("");
    }
    setComposerOpen(false);
  }

  function requestAiDraft() {
    setBody((current) => current + "\n\n[AI] Added a warmer sign-off and confirmed vendor meals per thread context.");
    showToast("AI draft inserted â€” review before sending.");
  }

  function generateInlineResponse() {
    const incoming = activeThread
      ? getMessagesForThread(activeThread.id).filter((msg) => msg.direction === "in")
      : [];
    const lastIncoming = incoming[incoming.length - 1];
    const rawTopic =
      lastIncoming?.subject?.replace(/^Re:\s*/i, "").trim() ||
      replyMeta.subjectLine.replace(/^Re:\s*/i, "").trim();
    const topicOk = rawTopic && rawTopic !== "â€¦" && !rawTopic.startsWith("Re:");
    const draft = topicOk
      ? `Thanks â€” Iâ€™ve reviewed â€œ${rawTopic}â€. Iâ€™ll confirm coverage and next steps shortly.`
      : "Thanks â€” Iâ€™ve reviewed your note. Iâ€™ll confirm coverage and next steps shortly.";
    setReplyBody((prev) => (prev.trim() ? `${prev.trim()}\n\n${draft}` : draft));
    showToast("Reply drafted â€” review and edit before sending.");
    window.requestAnimationFrame(() => replyAreaRef.current?.focus());
  }

  return {
    composerOpen,
    composerKind,
    replyMeta,
    to,
    setTo,
    cc,
    setCc,
    subject,
    setSubject,
    body,
    setBody,
    replyBody,
    setReplyBody,
    replyScope,
    isInternalNote,
    toggleInternalNote,
    replyAreaRef,
    internalBody,
    setInternalBody,
    applyReplyScope,
    openComposer,
    closeComposer,
    submitInlineForApproval,
    editDraftInComposer,
    sendComposer,
    requestAiDraft,
    generateInlineResponse,
  };
}
