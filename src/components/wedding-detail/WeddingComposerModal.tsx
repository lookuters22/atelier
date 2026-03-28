import type { Dispatch, SetStateAction } from "react";
import { X } from "lucide-react";
import { InternalNoteForm } from "./InternalNoteForm";
import { ReplyComposerForm } from "./ReplyComposerForm";
import type { ComposerKind } from "./types";

export function WeddingComposerModal({
  composerKind,
  weddingCouple,
  closeComposer,
  to,
  setTo,
  cc,
  setCc,
  subject,
  setSubject,
  body,
  setBody,
  requestAiDraft,
  sendComposer,
  showToast,
  internalBody,
  setInternalBody,
}: {
  composerKind: ComposerKind;
  weddingCouple: string;
  closeComposer: () => void;
  to: string;
  setTo: Dispatch<SetStateAction<string>>;
  cc: string;
  setCc: Dispatch<SetStateAction<string>>;
  subject: string;
  setSubject: Dispatch<SetStateAction<string>>;
  body: string;
  setBody: Dispatch<SetStateAction<string>>;
  requestAiDraft: () => void;
  sendComposer: () => void;
  showToast: (msg: string) => void;
  internalBody: string;
  setInternalBody: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-ink/35 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label="Composer">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-6 ring-1 ring-black/[0.08]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">{composerKind === "internal" ? "Internal note" : "Email composer"}</p>
            <p className="mt-1 text-[15px] font-semibold text-ink">{weddingCouple}</p>
          </div>
          <button type="button" className="rounded-full p-2 text-ink-faint hover:bg-canvas hover:text-ink" aria-label="Close composer" onClick={closeComposer}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {composerKind === "reply" ? (
          <ReplyComposerForm
            to={to}
            setTo={setTo}
            cc={cc}
            setCc={setCc}
            subject={subject}
            setSubject={setSubject}
            body={body}
            setBody={setBody}
            requestAiDraft={requestAiDraft}
            closeComposer={closeComposer}
            sendComposer={sendComposer}
            showToast={showToast}
          />
        ) : (
          <InternalNoteForm
            internalBody={internalBody}
            setInternalBody={setInternalBody}
            closeComposer={closeComposer}
            sendComposer={sendComposer}
          />
        )}
      </div>
    </div>
  );
}
