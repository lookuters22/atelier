import { useEffect, useState } from "react";
import { useInvoiceSetup } from "./InvoiceSetupContext";
import type { InvoiceSetupState } from "../../../lib/invoiceSetupTypes";

type LazyParts = {
  PdfViewer: React.ComponentType<{
    width: string;
    height: string;
    showToolbar: boolean;
    className?: string;
    children: React.ReactNode;
  }>;
  PdfDocument: React.ComponentType<{ setup: InvoiceSetupState }>;
};

export function useInvoicePreviewSetup() {
  const { setup } = useInvoiceSetup();
  const [parts, setParts] = useState<LazyParts | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import("@react-pdf/renderer"),
      import("../../../pages/settings/InvoicePdfDocument"),
    ]).then(([renderer, doc]) => {
      if (cancelled) return;
      setParts({
        PdfViewer: renderer.PDFViewer as unknown as LazyParts["PdfViewer"],
        PdfDocument: doc.InvoicePdfDocument,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    setup,
    PdfViewer: parts?.PdfViewer ?? null,
    PdfDocument: parts?.PdfDocument ?? null,
  };
}
