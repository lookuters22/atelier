import { describe, expect, it } from "vitest";
import { fetchAssistantStudioInvoiceSetupRead } from "./fetchAssistantStudioInvoiceSetupRead.ts";
import type { Database } from "../types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("fetchAssistantStudioInvoiceSetupRead", () => {
  it("returns hasRow false when no studio_invoice_setup row", async () => {
    const supabase = {
      from: (table: string) => {
        expect(table).toBe("studio_invoice_setup");
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      },
    } as SupabaseClient<Database>;

    const r = await fetchAssistantStudioInvoiceSetupRead(supabase, "p1");
    expect(r.hasRow).toBe(false);
    expect(r.invoicePrefix).toBe("");
  });
});
