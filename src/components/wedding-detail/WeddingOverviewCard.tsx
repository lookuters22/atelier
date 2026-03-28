import type { Dispatch, SetStateAction } from "react";
import { Calendar, MapPin, PenLine } from "lucide-react";
import type { WeddingFieldsEditable } from "../../lib/weddingDetailStorage";

export function WeddingOverviewCard({
  weddingFields,
  editingWedding,
  setWeddingFields,
  startEditWedding,
  cancelEditWedding,
  saveEditWedding,
}: {
  weddingFields: WeddingFieldsEditable;
  editingWedding: boolean;
  setWeddingFields: Dispatch<SetStateAction<WeddingFieldsEditable>>;
  startEditWedding: () => void;
  cancelEditWedding: () => void;
  saveEditWedding: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Wedding</p>
        {!editingWedding ? (
          <button
            type="button"
            onClick={startEditWedding}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10"
          >
            <PenLine className="h-3 w-3" strokeWidth={2} />
            Edit
          </button>
        ) : (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={cancelEditWedding}
              className="rounded-full px-2 py-1 text-[11px] font-semibold text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEditWedding}
              className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-canvas"
            >
              Save
            </button>
          </div>
        )}
      </div>
      {!editingWedding ? (
        <>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-ink">{weddingFields.couple}</h1>
          <span className="mt-2 inline-block rounded-full bg-canvas px-3 py-1 text-[11px] font-semibold text-ink-muted">
            {weddingFields.stage}
          </span>
          <div className="mt-4 space-y-3 text-[13px] text-ink-muted">
            <p className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.5} />
              {weddingFields.when}
            </p>
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" strokeWidth={1.5} />
              {weddingFields.where}
            </p>
          </div>
          <div className="mt-5 rounded-xl bg-canvas p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Commercial</p>
            <p className="mt-2 text-[14px] font-semibold text-ink">{weddingFields.package}</p>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[11px] text-ink-faint">Contract value</p>
                <p className="text-[16px] font-semibold text-ink">{weddingFields.value}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-ink-faint">Status</p>
                <p className="text-[13px] font-semibold text-ink">{weddingFields.balance}</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="block text-[11px] font-semibold text-ink-muted">
            Couple / title
            <input
              value={weddingFields.couple}
              onChange={(e) => setWeddingFields((f) => ({ ...f, couple: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-canvas px-2 py-1.5 text-[14px] font-semibold text-ink"
            />
          </label>
          <label className="block text-[11px] font-semibold text-ink-muted">
            Stage
            <input
              value={weddingFields.stage}
              onChange={(e) => setWeddingFields((f) => ({ ...f, stage: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-canvas px-2 py-1.5 text-[13px] text-ink"
            />
          </label>
          <label className="block text-[11px] font-semibold text-ink-muted">
            When
            <input
              value={weddingFields.when}
              onChange={(e) => setWeddingFields((f) => ({ ...f, when: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-canvas px-2 py-1.5 text-[13px] text-ink"
            />
          </label>
          <label className="block text-[11px] font-semibold text-ink-muted">
            Where
            <input
              value={weddingFields.where}
              onChange={(e) => setWeddingFields((f) => ({ ...f, where: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-canvas px-2 py-1.5 text-[13px] text-ink"
            />
          </label>
          <div className="rounded-xl bg-canvas p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Commercial</p>
            <label className="mt-2 block text-[11px] font-semibold text-ink-muted">
              Package
              <input
                value={weddingFields.package}
                onChange={(e) => setWeddingFields((f) => ({ ...f, package: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] text-ink"
              />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block text-[11px] font-semibold text-ink-muted">
                Value
                <input
                  value={weddingFields.value}
                  onChange={(e) => setWeddingFields((f) => ({ ...f, value: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] text-ink"
                />
              </label>
              <label className="block text-[11px] font-semibold text-ink-muted">
                Balance / status
                <input
                  value={weddingFields.balance}
                  onChange={(e) => setWeddingFields((f) => ({ ...f, balance: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[13px] text-ink"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
