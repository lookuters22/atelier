/**
 * Compact, read-only descriptors for invoice setup in operator Ana context/tools.
 * Never embed raw `logoDataUrl` in prompts.
 */
import type { AssistantInvoiceLogoSummary, AssistantStudioInvoiceSetupRead } from "../types/assistantContext.types.ts";
import type { InvoiceSetupState } from "./invoiceSetupTypes.ts";

export const MAX_INVOICE_FOOTER_CONTEXT_CHARS = 500;
export const MAX_INVOICE_FOOTER_TOOL_CHARS = 2000;

const CONTEXT_NOTE =
  "Factual string fields are from `studio_invoice_setup.template` (parsed JSON). **Logo:** describe only **presence** and stored **data URL** length / MIME — **not** image dimensions or file bytes. This is **not** a PDF render of an invoice.";

function clipFooter(footer: string, max: number): { text: string; truncated: boolean } {
  const t = String(footer ?? "");
  if (t.length <= max) return { text: t, truncated: false };
  return { text: `${t.slice(0, max - 1)}…`, truncated: true };
}

/**
 * Data URLs only — no raw bytes; `approxDataUrlChars` is the full stored string length (prompt-safe summary).
 */
export function summarizeInvoiceLogoForAssistant(logoDataUrl: string | null | undefined): AssistantInvoiceLogoSummary {
  if (logoDataUrl == null || logoDataUrl === "") {
    return {
      hasLogo: false,
      mimeType: null,
      approxDataUrlChars: 0,
      note: "No logo on the invoice template (logo is not set).",
    };
  }
  const s = String(logoDataUrl);
  const m = /^data:([^;]+);base64,(.*)$/s.exec(s);
  if (!m) {
    return {
      hasLogo: true,
      mimeType: null,
      approxDataUrlChars: s.length,
      note: "A logo value is stored but is not a standard `data:…;base64,` URL — only character length is given.",
    };
  }
  return {
    hasLogo: true,
    mimeType: m[1] ?? null,
    approxDataUrlChars: s.length,
    note: "Logo stored as a data URL. **Not** the image decoded — only MIME prefix and full stored string length (can be large).",
  };
}

/**
 * Map DB template + row metadata to assistant read shape. Does not expose `logoDataUrl` itself.
 */
export function mapInvoiceTemplateToAssistantRead(
  template: InvoiceSetupState,
  updatedAt: string,
  footerMaxChars: number,
): AssistantStudioInvoiceSetupRead {
  const foot = clipFooter(template.footerNote, footerMaxChars);
  return {
    hasRow: true,
    updatedAt,
    legalName: template.legalName,
    invoicePrefix: template.invoicePrefix,
    paymentTerms: template.paymentTerms,
    accentColor: template.accentColor,
    footerNote: foot.text,
    footerNoteTruncated: foot.truncated,
    logo: summarizeInvoiceLogoForAssistant(template.logoDataUrl),
    note: CONTEXT_NOTE,
  };
}
