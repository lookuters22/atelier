import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { UnfiledThread } from "../../../hooks/useUnfiledInbox";

export type InboxSelection =
  | { kind: "none" }
  | { kind: "thread"; thread: UnfiledThread }
  | { kind: "project"; projectId: string; projectName: string };

interface InboxModeState {
  selection: InboxSelection;
  /** One-shot: inbox URL hydrator sets this so project timeline selects the draft’s thread; consumed in InboxWorkspace then cleared. */
  pendingInboxPipelineThreadId: string | null;
  setPendingInboxPipelineThreadId: (id: string | null) => void;
  /** Set when a draft (or fetch) deep link could not be applied; cleared on dismiss or any explicit selection change. */
  inboxUrlNotice: string | null;
  setInboxUrlNotice: (msg: string | null) => void;
  selectThread: (t: UnfiledThread) => void;
  selectProject: (id: string, name: string) => void;
  clearSelection: () => void;
}

const Ctx = createContext<InboxModeState | null>(null);

export function InboxModeProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<InboxSelection>({ kind: "none" });
  const [pendingInboxPipelineThreadId, setPendingInboxPipelineThreadId] = useState<string | null>(null);
  const [inboxUrlNotice, setInboxUrlNotice] = useState<string | null>(null);

  const selectThread = useCallback((t: UnfiledThread) => {
    setInboxUrlNotice(null);
    setPendingInboxPipelineThreadId(null);
    setSelection({ kind: "thread", thread: t });
  }, []);

  /** Does not clear `pendingInboxPipelineThreadId` — URL hydrator sets pending after this for draft review deep links. */
  const selectProject = useCallback((id: string, name: string) => {
    setInboxUrlNotice(null);
    setSelection({ kind: "project", projectId: id, projectName: name });
  }, []);

  const clearSelection = useCallback(() => {
    setInboxUrlNotice(null);
    setPendingInboxPipelineThreadId(null);
    setSelection({ kind: "none" });
  }, []);

  return (
    <Ctx.Provider
      value={{
        selection,
        pendingInboxPipelineThreadId,
        setPendingInboxPipelineThreadId,
        inboxUrlNotice,
        setInboxUrlNotice,
        selectThread,
        selectProject,
        clearSelection,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useInboxMode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useInboxMode must be used within InboxModeProvider");
  return ctx;
}
