import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  listFinancialsOverview,
  listAllTransactions,
  getStudioFinancialStats,
  type FinancialsOverviewRow,
  type FinancialTransaction,
} from "../../../data/weddingFinancials";

export type WorkspaceIndex =
  | "fin-overview"
  | "invoices"
  | "contracts"
  | "proposals"
  | "transactions"
  | "pricing-calculator"
  | "offer-builder"
  | "invoice-pdf"
  | "playbook-rule-candidates"
  | "studio-profile-review";

export type SelectedRow =
  | { kind: "financial"; data: FinancialsOverviewRow }
  | null;

export type WorkspaceFormMode =
  | { kind: "new-invoice" }
  | null;

interface WorkspaceModeState {
  activeIndex: WorkspaceIndex;
  setActiveIndex: (idx: WorkspaceIndex) => void;
  selectedRow: SelectedRow;
  setSelectedRow: (row: SelectedRow) => void;
  /** A7: transactions table selection (separate from financial row selection). */
  selectedTransactionId: string | null;
  setSelectedTransactionId: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  financialRows: FinancialsOverviewRow[];
  transactions: FinancialTransaction[];
  financialStats: ReturnType<typeof getStudioFinancialStats>;
  counts: Record<string, number>;
  formMode: WorkspaceFormMode;
  setFormMode: (mode: WorkspaceFormMode) => void;
  openNewInvoice: () => void;
}

const Ctx = createContext<WorkspaceModeState | null>(null);

export function useWorkspaceMode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspaceMode must be used within WorkspaceModeProvider");
  return ctx;
}

export function WorkspaceModeProvider({ children }: { children: ReactNode }) {
  const [activeIndex, setActiveIndexRaw] = useState<WorkspaceIndex>("fin-overview");
  const [selectedRow, setSelectedRow] = useState<SelectedRow>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [formMode, setFormMode] = useState<WorkspaceFormMode>(null);

  const allFinancials = useMemo(() => listFinancialsOverview(), []);
  const transactions = useMemo(() => listAllTransactions(), []);
  const financialStats = useMemo(() => getStudioFinancialStats(), []);

  const counts = useMemo(
    () => ({
      "fin-overview": 0,
      invoices: allFinancials.filter((r) => r.kind === "invoice").length,
      contracts: allFinancials.filter((r) => r.kind === "contract").length,
      proposals: allFinancials.filter((r) => r.kind === "proposal").length,
      transactions: transactions.length,
      "pricing-calculator": 0,
      "offer-builder": 0,
      "invoice-pdf": 0,
      "playbook-rule-candidates": 0,
      "studio-profile-review": 0,
    }),
    [allFinancials, transactions],
  );

  const setActiveIndex = useCallback((idx: WorkspaceIndex) => {
    setActiveIndexRaw(idx);
    setSelectedRow(null);
    setSelectedTransactionId(null);
    setSearchQuery("");
    setFormMode(null);
  }, []);

  const openNewInvoice = useCallback(() => {
    setFormMode({ kind: "new-invoice" });
    setSelectedRow(null);
    setSelectedTransactionId(null);
  }, []);

  return (
    <Ctx.Provider
      value={{
        activeIndex,
        setActiveIndex,
        selectedRow,
        setSelectedRow,
        selectedTransactionId,
        setSelectedTransactionId,
        searchQuery,
        setSearchQuery,
        financialRows: allFinancials,
        transactions,
        financialStats,
        counts,
        formMode,
        setFormMode,
        openNewInvoice,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
