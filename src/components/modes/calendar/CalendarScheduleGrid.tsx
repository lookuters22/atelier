import { Plus } from "lucide-react";
import {
  formatMonthYear,
  toISODateLocal,
  useCalendarMode,
  EVENT_COLORS,
  type CalEvent,
  type CalendarView,
} from "./CalendarModeContext";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const VIEWS: { key: CalendarView; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
];

export function CalendarScheduleGrid() {
  const { calendarView, setCalendarView, viewDate, shiftMonth, openNewEvent } =
    useCalendarMode();

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-[13px] text-foreground">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => shiftMonth(-1)}
          >
            Prev
          </button>
          <p className="min-w-[140px] text-center text-[13px] font-semibold text-foreground">
            {formatMonthYear(viewDate)}
          </p>
          <button
            type="button"
            className="rounded-md px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => shiftMonth(1)}
          >
            Next
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setCalendarView(v.key)}
                className={
                  "rounded px-2.5 py-1 text-[12px] font-medium transition-colors " +
                  (calendarView === v.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {v.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => openNewEvent()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Add Event
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {calendarView === "month" && <MonthGrid />}
        {calendarView === "week" && <WeekView />}
        {calendarView === "day" && <DayView />}
      </div>
    </div>
  );
}

function MonthGrid() {
  const { cells, eventsByDate, todayISO, selectedDate, selectDate, openNewEvent, viewEvent } =
    useCalendarMode();

  return (
    <>
      <div className="grid grid-cols-7 gap-px text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1.5">{d}</div>
        ))}
      </div>
      <div className="mt-1 grid min-h-0 flex-1 grid-cols-7 gap-px auto-rows-fr">
        {cells.map(({ d, inMonth }, idx) => {
          const iso = toISODateLocal(d);
          const dayEvents = eventsByDate.get(iso) ?? [];
          const isToday = inMonth && iso === todayISO;
          const isSelected = inMonth && iso === selectedDate;
          const show = dayEvents.slice(0, 2);
          const more = dayEvents.length - show.length;

          return (
            <div
              key={`${iso}-${idx}`}
              role="gridcell"
              className={
                "flex min-h-[5.5rem] flex-col gap-0.5 rounded-lg border p-1.5 text-left transition cursor-pointer " +
                (inMonth
                  ? isSelected
                    ? "border-[#2563eb]/40 bg-[#2563eb]/8 ring-1 ring-[#2563eb]/20"
                    : isToday
                      ? "border-[#2563eb]/30 bg-[#2563eb]/5"
                      : "border-transparent bg-canvas/30 hover:border-border"
                  : "border-transparent bg-canvas/10 opacity-40")
              }
              onClick={() => inMonth && selectDate(iso)}
              onDoubleClick={() => inMonth && openNewEvent(iso)}
            >
              <span
                className={
                  "mb-0.5 text-[12px] font-semibold leading-none " +
                  (isToday
                    ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#2563eb] text-white"
                    : inMonth
                      ? "text-foreground"
                      : "text-muted-foreground")
                }
              >
                {d.getDate()}
              </span>
              {show.map((ev) => (
                <EventChip key={ev.id} event={ev} onClick={() => viewEvent(ev)} />
              ))}
              {more > 0 && (
                <span className="text-[10px] text-muted-foreground">+{more} more</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function EventChip({ event, onClick }: { event: CalEvent; onClick: () => void }) {
  const c = EVENT_COLORS[event.type];
  return (
    <button
      type="button"
      className={`truncate rounded-md border px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight transition-colors hover:opacity-80 ${c.bg} ${c.border} ${c.text}`}
      title={event.title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {event.startTime && (
        <span className="mr-1 opacity-70">{event.startTime}</span>
      )}
      {event.title}
    </button>
  );
}

function WeekView() {
  const { visibleEvents, todayISO, selectedDate, selectDate, openNewEvent, viewEvent } =
    useCalendarMode();

  const anchor = new Date(selectedDate + "T12:00:00");
  const weekStart = new Date(anchor);
  const dayOfWeek = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - dayOfWeek);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const hours = Array.from({ length: 14 }, (_, i) => i + 7);

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
        <div />
        {days.map((d) => {
          const iso = toISODateLocal(d);
          const isToday = iso === todayISO;
          const isSelected = iso === selectedDate;
          return (
            <div
              key={iso}
              className={
                "px-2 py-2 text-center text-[12px] font-semibold transition " +
                (isSelected
                  ? "bg-[#2563eb]/8 text-[#2563eb]"
                  : isToday
                    ? "text-[#2563eb]"
                    : "text-foreground")
              }
            >
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                {WEEKDAYS[(d.getDay() + 6) % 7]}
              </span>
              <span
                className={
                  isSelected
                    ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2563eb] text-white"
                    : isToday
                      ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2563eb]/15 text-[#2563eb]"
                      : ""
                }
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-[60px_repeat(7,1fr)]">
        {hours.map((h) => (
          <div key={h} className="contents">
            <div className="border-b border-border/50 px-2 py-3 text-right text-[11px] text-muted-foreground">
              {String(h).padStart(2, "0")}:00
            </div>
            {days.map((d) => {
              const iso = toISODateLocal(d);
              const eventsInHour = visibleEvents.filter((ev) => {
                if (ev.dateISO !== iso || !ev.startTime) return false;
                const evH = parseInt(ev.startTime.split(":")[0], 10);
                return evH === h;
              });
              return (
                <div
                  key={`${iso}-${h}`}
                  className={
                    "relative min-h-[3rem] border-b border-l border-border/30 transition cursor-pointer " +
                    (iso === selectedDate
                      ? "bg-[#2563eb]/5 hover:bg-[#2563eb]/8"
                      : "hover:bg-accent/20")
                  }
                  onClick={() => selectDate(iso)}
                  onDoubleClick={() => openNewEvent(iso, `${String(h).padStart(2, "0")}:00`)}
                >
                  {eventsInHour.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      className={`m-0.5 block w-[calc(100%-4px)] truncate rounded-md border px-1.5 py-1 text-left text-[11px] font-medium ${EVENT_COLORS[ev.type].bg} ${EVENT_COLORS[ev.type].border} ${EVENT_COLORS[ev.type].text}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        viewEvent(ev);
                      }}
                    >
                      {ev.startTime} {ev.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayView() {
  const { selectedDate, visibleEvents, selectDate, openNewEvent, viewEvent } = useCalendarMode();
  const anchor = new Date(selectedDate + "T12:00:00");
  const iso = selectedDate;
  const dayEvents = visibleEvents.filter((ev) => ev.dateISO === iso);
  const hours = Array.from({ length: 16 }, (_, i) => i + 6);

  const dayLabel = anchor.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col">
      <p className="mb-3 text-[14px] font-semibold text-foreground">{dayLabel}</p>

      <div className="grid grid-cols-[60px_1fr]">
        {hours.map((h) => {
          const eventsInHour = dayEvents.filter((ev) => {
            if (!ev.startTime) return false;
            return parseInt(ev.startTime.split(":")[0], 10) === h;
          });
          return (
            <div key={h} className="contents">
              <div className="border-b border-border/50 px-2 py-4 text-right text-[11px] text-muted-foreground">
                {String(h).padStart(2, "0")}:00
              </div>
              <div
                className="relative min-h-[3.5rem] border-b border-l border-border/30 p-1 transition hover:bg-accent/20 cursor-pointer"
                onClick={() => selectDate(iso)}
                onDoubleClick={() => openNewEvent(iso, `${String(h).padStart(2, "0")}:00`)}
              >
                {eventsInHour.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    className={`mb-1 block w-full rounded-md border px-3 py-2 text-left text-[12px] font-medium ${EVENT_COLORS[ev.type].bg} ${EVENT_COLORS[ev.type].border} ${EVENT_COLORS[ev.type].text}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      viewEvent(ev);
                    }}
                  >
                    <span className="mr-2 opacity-70">
                      {ev.startTime}{ev.endTime ? ` – ${ev.endTime}` : ""}
                    </span>
                    {ev.title}
                    {ev.location && (
                      <span className="ml-2 opacity-60">· {ev.location}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
