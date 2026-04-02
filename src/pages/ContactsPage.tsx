import { Link } from "react-router-dom";
import { contactsByGroup, groupLabel, type StakeholderGroup } from "../data/contactsDirectory";

const GROUP_ORDER: StakeholderGroup[] = ["couple", "planning", "vendor"];

export function ContactsPage() {
  const grouped = contactsByGroup();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Contacts</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Everyone you have ever spoken with—deduped by email, linked back to weddings. Primary contacts and vendors are highlighted.
        </p>
      </div>

      <div className="space-y-8">
        {GROUP_ORDER.map((g) => (
          <section key={g}>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{groupLabel(g)}</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[1.15fr_0.85fr_1.35fr_1.05fr_0.9fr] gap-px bg-border text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
                  <div className="bg-surface px-4 py-3">Name</div>
                  <div className="bg-surface px-4 py-3">Role</div>
                  <div className="bg-surface px-4 py-3">Email</div>
                  <div className="bg-surface px-4 py-3">Badges</div>
                  <div className="bg-surface px-4 py-3">Weddings</div>
                </div>
                {grouped[g].map((p) => (
                  <div
                    key={p.email}
                    className="grid grid-cols-[1.15fr_0.85fr_1.35fr_1.05fr_0.9fr] gap-px border-t border-border bg-border text-[13px]"
                  >
                    <div className="bg-surface px-4 py-3 font-semibold text-ink">{p.name}</div>
                    <div className="bg-surface px-4 py-3 text-ink-muted">{p.role}</div>
                    <div className="bg-surface px-4 py-3 text-ink-muted">{p.email}</div>
                    <div className="flex flex-wrap items-center gap-1.5 bg-surface px-4 py-3">
                      {p.authority === "primary" ? (
                        <span className="rounded-full bg-link/15 px-2.5 py-0.5 text-[11px] font-semibold text-link">Primary contact</span>
                      ) : null}
                      {p.authority === "secondary" ? (
                        <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-semibold text-ink-muted">Secondary</span>
                      ) : null}
                      {p.logisticsRole ? (
                        <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-muted">
                          {p.logisticsRole}
                        </span>
                      ) : null}
                      {!p.authority && !p.logisticsRole ? (
                        <span className="text-[12px] text-ink-faint">—</span>
                      ) : null}
                    </div>
                    <div className="bg-surface px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {p.weddings.map((id) => (
                          <Link key={id} to={`/wedding/${id}`} className="font-semibold text-link hover:text-link-hover">
                            View
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
