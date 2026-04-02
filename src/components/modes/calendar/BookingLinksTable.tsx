import { Clock, ExternalLink, ToggleLeft, ToggleRight } from "lucide-react";
import { BOOKING_LINKS } from "../../../data/bookingLinks";
import { useCalendarMode } from "./CalendarModeContext";

export function BookingLinksTable() {
  const { viewBookingLink, inspectorMode } = useCalendarMode();
  const selectedId = inspectorMode.kind === "view-booking" ? inspectorMode.link.id : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-[13px] text-foreground">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Booking Links</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Meeting templates clients can use to book time with you.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {BOOKING_LINKS.map((link) => {
            const isSelected = selectedId === link.id;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => viewBookingLink(link)}
                className={
                  "flex w-full items-start gap-3 rounded-md border p-4 text-left transition-colors " +
                  (isSelected
                    ? "border-border bg-accent text-foreground"
                    : "border-border hover:bg-accent/50")
                }
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/50">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground">{link.title}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{link.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" strokeWidth={1.75} />
                      {link.duration}m
                    </span>
                    {link.bufferBefore > 0 && (
                      <span>{link.bufferBefore}m buffer before</span>
                    )}
                    {link.bufferAfter > 0 && (
                      <span>{link.bufferAfter}m buffer after</span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      {link.active ? (
                        <ToggleRight className="h-3 w-3 text-emerald-500" strokeWidth={2} />
                      ) : (
                        <ToggleLeft className="h-3 w-3 text-zinc-400" strokeWidth={2} />
                      )}
                      {link.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
