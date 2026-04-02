import { useState } from "react";
import { Plus, Trash2, ChevronLeft } from "lucide-react";
import { useWorkspaceMode } from "./WorkspaceModeContext";
import { WEDDING_IDS, WEDDING_CATALOG } from "../../../data/weddingCatalog";

type LineItem = { description: string; quantity: number; unitPrice: number };

const EMPTY_LINE: LineItem = { description: "", quantity: 1, unitPrice: 0 };

export function InvoiceForm() {
  const { setFormMode } = useWorkspaceMode();

  const [weddingId, setWeddingId] = useState("");
  const [label, setLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<LineItem[]>([{ ...EMPTY_LINE }]);

  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  function updateLine(idx: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSave() {
    alert("Invoice saved (demo). In production this writes to the invoices table.");
    setFormMode(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-background text-[13px] text-foreground">
      <div className="flex shrink-0 items-center gap-1 px-2 py-2">
        <button
          type="button"
          onClick={() => setFormMode(null)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <h2 className="text-[13px] font-semibold text-foreground">New Invoice</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <label htmlFor="inv-project" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Linked Project
          </label>
          <select
            id="inv-project"
            value={weddingId}
            onChange={(e) => setWeddingId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Select a wedding…</option>
            {WEDDING_IDS.map((id) => (
              <option key={id} value={id}>{WEDDING_CATALOG[id].couple}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="inv-label" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Invoice Label
          </label>
          <input
            id="inv-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Deposit — 40%"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="inv-due" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Due Date
          </label>
          <input
            id="inv-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Line Items</span>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
              className="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="h-3 w-3" strokeWidth={2} /> Add
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-background p-3">
                <input
                  value={line.description}
                  onChange={(e) => updateLine(idx, { description: e.target.value })}
                  placeholder="Description"
                  className="mb-2 w-full border-b border-border/60 bg-transparent pb-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, { quantity: Math.max(1, +e.target.value) })}
                      className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[12px] tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">Unit price (€)</label>
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={line.unitPrice}
                      onChange={(e) => updateLine(idx, { unitPrice: Math.max(0, +e.target.value) })}
                      className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-[12px] tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="pt-3">
                    <span className="text-[12px] font-medium tabular-nums text-foreground">
                      €{(line.quantity * line.unitPrice).toLocaleString("en")}
                    </span>
                  </div>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="mt-3 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Total</span>
          <span className="text-[16px] font-semibold tabular-nums text-foreground">
            €{total.toLocaleString("en")}
          </span>
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!weddingId || !label || lines.every((l) => !l.description)}
          className="w-full rounded-md bg-[#2563eb] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#2563eb]/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Create Invoice
        </button>
      </div>
    </div>
  );
}
