import { createContext, useContext, useState, type ReactNode } from "react";
import type { UnfiledThread } from "../../../hooks/useUnfiledInbox";

export type InboxSelection =
  | { kind: "none" }
  | { kind: "thread"; thread: UnfiledThread }
  | { kind: "project"; projectId: string; projectName: string };

interface InboxModeState {
  selection: InboxSelection;
  selectThread: (t: UnfiledThread) => void;
  selectProject: (id: string, name: string) => void;
  clearSelection: () => void;
}

const Ctx = createContext<InboxModeState | null>(null);

export function InboxModeProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<InboxSelection>({ kind: "none" });

  function selectThread(t: UnfiledThread) {
    setSelection({ kind: "thread", thread: t });
  }

  function selectProject(id: string, name: string) {
    setSelection({ kind: "project", projectId: id, projectName: name });
  }

  function clearSelection() {
    setSelection({ kind: "none" });
  }

  return (
    <Ctx.Provider value={{ selection, selectThread, selectProject, clearSelection }}>
      {children}
    </Ctx.Provider>
  );
}

export function useInboxMode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useInboxMode must be used within InboxModeProvider");
  return ctx;
}
