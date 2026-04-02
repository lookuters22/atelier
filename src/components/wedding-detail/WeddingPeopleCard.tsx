import { PenLine, Plus, Trash2, Users } from "lucide-react";
import type { WeddingPersonRow } from "../../data/weddingPeopleDefaults";

export function WeddingPeopleCard({
  people,
  editingPeople,
  startEditPeople,
  cancelEditPeople,
  saveEditPeople,
  addPersonRow,
  removePersonRow,
  updatePerson,
}: {
  people: WeddingPersonRow[];
  editingPeople: boolean;
  startEditPeople: () => void;
  cancelEditPeople: () => void;
  saveEditPeople: () => void;
  addPersonRow: () => void;
  removePersonRow: (id: string) => void;
  updatePerson: (id: string, patch: Partial<WeddingPersonRow>) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-ink-faint" strokeWidth={1.5} />
          <p className="text-[13px] font-semibold text-ink">People</p>
        </div>
        {!editingPeople ? (
          <button
            type="button"
            onClick={startEditPeople}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-link hover:bg-link/10"
          >
            <PenLine className="h-3 w-3" strokeWidth={2} />
            Edit
          </button>
        ) : (
          <div className="flex flex-wrap justify-end gap-1">
            <button
              type="button"
              onClick={cancelEditPeople}
              className="rounded-full px-2 py-1 text-[11px] font-semibold text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEditPeople}
              className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-canvas"
            >
              Save
            </button>
          </div>
        )}
      </div>
      {!editingPeople ? (
        <ul className="mt-3 space-y-3 text-[13px] text-ink-muted">
          {people.map((p) => (
            <li key={p.id}>
              <p className="font-semibold text-ink">{p.name || "â€”"}</p>
              <p>{p.subtitle || "â€”"}</p>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-3 space-y-3">
          {people.map((p) => (
            <li key={p.id} className="rounded-lg border border-border bg-canvas p-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    value={p.name}
                    onChange={(e) => updatePerson(p.id, { name: e.target.value })}
                    placeholder="Name"
                    className="w-full rounded-md border border-border bg-surface px-2 py-1 text-[13px] font-semibold text-ink"
                  />
                  <input
                    value={p.subtitle}
                    onChange={(e) => updatePerson(p.id, { subtitle: e.target.value })}
                    placeholder="Role Â· email"
                    className="w-full rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-ink-muted"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removePersonRow(p.id)}
                  className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-white/[0.05] hover:text-ink"
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={addPersonRow}
              className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-[12px] font-semibold text-link hover:border-link/50"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add person
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
