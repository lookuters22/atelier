import { createContext, useContext, useState, type ReactNode } from "react";

export type TodaySelection =
  | { type: "overview" }
  | { type: "draft"; id: string }
  | { type: "unfiled"; id: string }
  | { type: "task"; id: string }
  | { type: "wedding"; id: string };

interface TodayModeState {
  selection: TodaySelection;
  select: (s: TodaySelection) => void;
}

const Ctx = createContext<TodayModeState | null>(null);

export function TodayModeProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<TodaySelection>({ type: "overview" });
  return (
    <Ctx.Provider value={{ selection, select: setSelection }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTodayMode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTodayMode must be used within TodayModeProvider");
  return ctx;
}
