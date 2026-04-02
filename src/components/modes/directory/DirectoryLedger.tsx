import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useDirectoryMode, matchesCategory, categoryLabel } from "./DirectoryModeContext";
import type { DirectoryContact } from "../../../data/contactsDirectory";

function matchesContactSearch(c: DirectoryContact, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    c.name.toLowerCase().includes(s) ||
    c.role.toLowerCase().includes(s) ||
    c.email.toLowerCase().includes(s) ||
    (c.logisticsRole?.toLowerCase().includes(s) ?? false)
  );
}

export function DirectoryLedger() {
  const { contacts, searchQuery, activeCategory, selectedRow, setSelectedRow } =
    useDirectoryMode();

  const filtered = useMemo(
    () =>
      contacts.filter(
        (c) => matchesCategory(c, activeCategory) && matchesContactSearch(c, searchQuery),
      ),
    [contacts, activeCategory, searchQuery],
  );

  const selectedEmail = selectedRow?.kind === "contact" ? selectedRow.data.email : null;
  const title = categoryLabel(activeCategory);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-row items-center justify-between border-b border-border bg-background px-6 py-5 min-h-[88px]">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center" />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 z-10 border-b border-border bg-background text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Badges</th>
              <th className="px-4 py-2.5">Weddings</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No contacts match your search.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const isSelected = selectedEmail === c.email;
                return (
                  <tr
                    key={c.email}
                    onClick={() => setSelectedRow({ kind: "contact", data: c })}
                    className={cn(
                      "cursor-pointer border-b border-border/60 transition-colors last:border-0",
                      isSelected ? "bg-accent" : "hover:bg-accent/40",
                    )}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">{c.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.role}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.email}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {c.authority === "primary" && (
                          <span className="rounded-full border border-[#2563eb]/20 bg-[#2563eb]/10 px-2 py-0.5 text-[11px] font-medium text-[#2563eb]">
                            Primary
                          </span>
                        )}
                        {c.authority === "secondary" && (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            Secondary
                          </span>
                        )}
                        {c.logisticsRole && (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {c.logisticsRole}
                          </span>
                        )}
                        {!c.authority && !c.logisticsRole && (
                          <span className="text-[12px] text-muted-foreground">&mdash;</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                      {c.weddings.length}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
