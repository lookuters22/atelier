import { Link } from "react-router-dom";
import { ExternalLink, Mail, Users } from "lucide-react";
import { useDirectoryMode } from "./DirectoryModeContext";
import { WEDDING_CATALOG } from "../../../data/weddingCatalog";
import type { DirectoryContact } from "../../../data/contactsDirectory";

function coupleName(weddingId: string): string {
  return WEDDING_CATALOG[weddingId]?.couple ?? weddingId;
}

function IdleShell() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center border-l border-border bg-background px-8 text-center">
      <Users className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
      <p className="mt-3 max-w-[220px] text-[12px] leading-relaxed text-muted-foreground">
        Select a contact to view their profile, linked weddings, and communication history.
      </p>
    </div>
  );
}

function ContactDossier({ contact }: { contact: DirectoryContact }) {
  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-background">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{contact.name}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{contact.role}</p>
        </div>
        <div className="space-y-2">
          <a
            href={`mailto:${contact.email}`}
            className="flex items-center gap-2 text-[13px] text-foreground hover:underline"
          >
            <Mail className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            {contact.email}
          </a>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {contact.authority === "primary" && (
            <span className="rounded-full border border-[#2563eb]/20 bg-[#2563eb]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#2563eb]">
              Primary contact
            </span>
          )}
          {contact.authority === "secondary" && (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              Secondary contact
            </span>
          )}
          {contact.logisticsRole && (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
              {contact.logisticsRole}
            </span>
          )}
        </div>
        {contact.weddings.length > 0 && (
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Linked Weddings
            </h3>
            <div className="space-y-1.5">
              {contact.weddings.map((id) => (
                <Link
                  key={id}
                  to={`/pipeline/${id}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-[13px] transition-colors hover:bg-accent/50"
                >
                  <span className="font-medium text-foreground">{coupleName(id)}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DirectoryInspector() {
  const { selectedRow } = useDirectoryMode();

  if (!selectedRow) return <IdleShell />;
  return <ContactDossier contact={selectedRow.data} />;
}
