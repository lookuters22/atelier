import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadJson, saveJson } from "../../../lib/settingsStorage";
import {
  INVOICE_STORAGE_KEY,
  defaultInvoiceSetup,
  type InvoiceSetupState,
} from "../../../lib/invoiceSetupTypes";

interface InvoiceSetupCtx {
  setup: InvoiceSetupState;
  setSetup: React.Dispatch<React.SetStateAction<InvoiceSetupState>>;
}

const Ctx = createContext<InvoiceSetupCtx | null>(null);

export function InvoiceSetupProvider({ children }: { children: ReactNode }) {
  const [setup, setSetup] = useState<InvoiceSetupState>(() =>
    loadJson(INVOICE_STORAGE_KEY, defaultInvoiceSetup()),
  );

  useEffect(() => {
    saveJson(INVOICE_STORAGE_KEY, setup);
  }, [setup]);

  return <Ctx.Provider value={{ setup, setSetup }}>{children}</Ctx.Provider>;
}

export function useInvoiceSetup() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useInvoiceSetup must be used within InvoiceSetupProvider");
  return ctx;
}
