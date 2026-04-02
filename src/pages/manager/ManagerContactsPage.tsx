import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useManagerContext } from "../../context/ManagerContext";
import { MANAGER_CONTACTS } from "../../data/managerPhotographers";

export function ManagerContactsPage() {
  const { selectedId } = useManagerContext();

  const people = useMemo(() => {
    if (selectedId === "all") return MANAGER_CONTACTS;
    return MANAGER_CONTACTS.filter((p) => p.photographerId === selectedId);
  }, [selectedId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Contacts</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Everyone you have ever spoken with—demo rows tagged to photographers for manager filtering.
        </p>
      </div>

      {people.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-canvas/40 px-6 py-12 text-center text-[14px] text-ink-muted">
          No contacts for this photographer in the demo.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="grid grid-cols-[1.2fr_0.8fr_1.4fr_0.9fr] gap-px bg-border text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
            <div className="bg-surface px-4 py-3">Name</div>
            <div className="bg-surface px-4 py-3">Role</div>
            <div className="bg-surface px-4 py-3">Email</div>
            <div className="bg-surface px-4 py-3">Weddings</div>
          </div>
          {people.map((p) => (
            <div
              key={p.email}
              className="grid grid-cols-[1.2fr_0.8fr_1.4fr_0.9fr] gap-px border-t border-border bg-border text-[13px]"
            >
              <div className="bg-surface px-4 py-3 font-semibold text-ink">{p.name}</div>
              <div className="bg-surface px-4 py-3 text-ink-muted">{p.role}</div>
              <div className="bg-surface px-4 py-3 text-ink-muted">{p.email}</div>
              <div className="bg-surface px-4 py-3">
                {p.weddings.map((id) => (
                  <Link key={id} to={`/manager/wedding/${id}`} className="font-semibold text-link hover:text-link-hover">
                    View
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
