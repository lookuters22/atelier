/**
 * Bounded read of `studio_invoice_setup` for operator Ana (tenant-scoped, read-only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types.ts";
import type { AssistantStudioInvoiceSetupRead } from "../types/assistantContext.types.ts";
import { fetchInvoiceSetupRemote } from "./invoiceSetupRemote.ts";
import { mapInvoiceTemplateToAssistantRead, MAX_INVOICE_FOOTER_CONTEXT_CHARS } from "./invoiceAssistantSummary.ts";

const NO_ROW_NOTE =
  "No `studio_invoice_setup` row for this tenant in this read — use **Settings → Invoice setup** in the app if the studio has not saved template data yet.";

export async function fetchAssistantStudioInvoiceSetupRead(
  supabase: SupabaseClient<Database>,
  photographerId: string,
): Promise<AssistantStudioInvoiceSetupRead> {
  const row = await fetchInvoiceSetupRemote(supabase, photographerId);
  if (!row) {
    return {
      hasRow: false,
      updatedAt: null,
      legalName: "",
      invoicePrefix: "",
      paymentTerms: "",
      accentColor: "",
      footerNote: "",
      footerNoteTruncated: false,
      logo: {
        hasLogo: false,
        mimeType: null,
        approxDataUrlChars: 0,
        note: "No row — logo unknown.",
      },
      note: NO_ROW_NOTE,
    };
  }
  return mapInvoiceTemplateToAssistantRead(row.template, row.updatedAt, MAX_INVOICE_FOOTER_CONTEXT_CHARS);
}
