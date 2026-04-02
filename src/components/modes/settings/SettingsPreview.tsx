import { useInvoicePreviewSetup } from "./useInvoicePreviewSetup";

export function SettingsPreview() {
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-slate-100">
      <InvoiceLiveCanvas />
    </div>
  );
}

function InvoiceLiveCanvas() {
  const { setup, PdfViewer, PdfDocument } = useInvoicePreviewSetup();

  if (!PdfViewer || !PdfDocument) {
    return (
      <div className="flex flex-1 items-center justify-center text-[13px] text-muted-foreground">
        Loading preview…
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-[480px] overflow-hidden rounded-lg bg-white shadow-lg">
        <PdfViewer width="100%" height="100%" showToolbar={false} className="h-[700px]">
          <PdfDocument setup={setup} />
        </PdfViewer>
      </div>
    </div>
  );
}
