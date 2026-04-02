import { Hotel, Plane, Car, Ban } from "lucide-react";
import { Link } from "react-router-dom";
import { WEDDING_TRAVEL, type WeddingTravelPlan } from "../../../data/weddingTravel";
import { WEDDING_OPTIONS, useCalendarMode, EVENT_COLORS } from "./CalendarModeContext";

type TravelBlock = {
  weddingId: string;
  coupleName: string;
  plan: WeddingTravelPlan;
};

function getTravelBlocks(): TravelBlock[] {
  const blocks: TravelBlock[] = [];
  for (const opt of WEDDING_OPTIONS) {
    if (!opt.value) continue;
    const plan = WEDDING_TRAVEL[opt.value as keyof typeof WEDDING_TRAVEL];
    if (plan) blocks.push({ weddingId: opt.value, coupleName: opt.label, plan });
  }
  return blocks;
}

const segmentIcon = {
  flight: Plane,
  hotel: Hotel,
  ground: Car,
};

export function TravelBlockedView() {
  const { visibleEvents, weddingLinkBase } = useCalendarMode();

  const travelBlocks = getTravelBlocks();
  const blockedEvents = visibleEvents.filter((e) => e.type === "block" || e.type === "travel");

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-[13px] text-foreground">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-[14px] font-semibold text-foreground">Travel & Blocked Time</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Travel itineraries from wedding projects and manually blocked time slots.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-6">
        {travelBlocks.map((block) => (
          <div key={block.weddingId} className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-foreground">{block.coupleName}</h3>
              <Link
                to={`${weddingLinkBase}/${block.weddingId}`}
                className="text-[11px] font-semibold text-[#2563eb] hover:underline"
              >
                Open wedding
              </Link>
            </div>

            {block.plan.itineraryDays && block.plan.itineraryDays.length > 0 ? (
              <div className="mt-3 space-y-2">
                {block.plan.itineraryDays.map((day) => (
                  <div key={day.id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-foreground">{day.dateLabel}</span>
                      {day.notes && (
                        <span className="text-[11px] text-muted-foreground">· {day.notes}</span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      {day.segments.map((seg) => {
                        const Icon = segmentIcon[seg.kind];
                        return (
                          <div key={seg.id} className="flex items-center gap-2 text-[12px]">
                            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                            <span className="font-medium text-foreground">{seg.label}</span>
                            <span className="text-muted-foreground">· {seg.detail}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                {block.plan.flights.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-[12px]">
                    <Plane className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                    <span className="font-medium">{f.route}</span>
                    <span className="text-muted-foreground">· {f.depart}</span>
                  </div>
                ))}
                {block.plan.hotels.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 text-[12px]">
                    <Hotel className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                    <span className="font-medium">{h.name}</span>
                    <span className="text-muted-foreground">· {h.checkIn} – {h.checkOut}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {blockedEvents.length > 0 && (
          <div>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Blocked time on calendar
            </h3>
            <div className="space-y-1.5">
              {blockedEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${EVENT_COLORS[ev.type].dot}`} />
                  <span className="text-[12px] font-medium text-foreground">{ev.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {ev.dateISO}
                    {ev.startTime ? ` · ${ev.startTime}` : ""}
                    {ev.endTime ? `–${ev.endTime}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {travelBlocks.length === 0 && blockedEvents.length === 0 && (
          <div className="flex h-40 items-center justify-center text-[13px] text-muted-foreground">
            No travel plans or blocked time yet.
          </div>
        )}
      </div>
    </div>
  );
}
