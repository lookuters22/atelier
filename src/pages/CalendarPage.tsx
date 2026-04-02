import { Link } from "react-router-dom";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { getPhotographerIdForWedding } from "../data/managerPhotographers";

const STORAGE_KEY = "atelier-calendar-events";

export type CalEvent = {
  id: string;
  dateISO: string;
  title: string;
  sub: string;
  weddingId?: string;
};

const SEED_EVENTS: CalEvent[] = [
  {
    id: "seed-1",
    dateISO: "2026-03-28",
    title: "Consultation · Priya & Daniel",
    sub: "Claridge's · video call",
    weddingId: "london",
  },
  {
    id: "seed-2",
    dateISO: "2026-06-11",
    title: "Travel · Sofia & Marco",
    sub: "Milan · Tuscany",
    weddingId: "lake-como",
  },
  {
    id: "seed-3",
    dateISO: "2026-06-14",
    title: "Wedding day · Sofia & Marco",
    sub: "Villa Cetinale · full coverage",
    weddingId: "lake-como",
  },
  {
    id: "seed-4",
    dateISO: "2026-07-03",
    title: "Rehearsal · Amelia & James",
    sub: "Grace Hotel",
    weddingId: "santorini",
  },
];

function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthYear(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(d);
}

function buildCalendarCells(year: number, month: number): { d: Date; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const dim = new Date(year, month + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;
  const cells: { d: Date; inMonth: boolean }[] = [];
  const prevLast = new Date(year, month, 0).getDate();
  for (let i = 0; i < startPad; i++) {
    const day = prevLast - startPad + i + 1;
    cells.push({ d: new Date(year, month - 1, day), inMonth: false });
  }
  for (let day = 1; day <= dim; day++) {
    cells.push({ d: new Date(year, month, day), inMonth: true });
  }
  let trail = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ d: new Date(year, month + 1, trail), inMonth: false });
    trail++;
  }
  while (cells.length < 42) {
    cells.push({ d: new Date(year, month + 1, trail), inMonth: false });
    trail++;
  }
  return cells;
}

const WEDDING_OPTIONS = [
  { value: "", label: "None" },
  { value: "lake-como", label: "Sofia & Marco" },
  { value: "london", label: "Priya & Daniel" },
  { value: "santorini", label: "Amelia & James" },
];

type ModalState =
  | { open: false }
  | {
      open: true;
      mode: "add" | "edit";
      eventId?: string;
      dateISO: string;
      title: string;
      sub: string;
      weddingId: string;
    };

export type CalendarPageProps = {
  weddingLinkBase?: string;
  filterPhotographerId?: "all" | string;
};

function eventVisibleForPhotographer(e: CalEvent, filter: string): boolean {
  if (filter === "all") return true;
  if (!e.weddingId) return false;
  return getPhotographerIdForWedding(e.weddingId) === filter;
}

export function CalendarPage(props: CalendarPageProps = {}) {
  const { weddingLinkBase = "/wedding", filterPhotographerId = "all" } = props;
  const [viewDate, setViewDate] = useState(() => new Date(2026, 2, 1));
  const [events, setEvents] = useState<CalEvent[]>(SEED_EVENTS);
  const [modal, setModal] = useState<ModalState>({ open: false });
  const monthInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CalEvent[];
        if (Array.isArray(parsed) && parsed.length > 0) setEvents(parsed);
      }
    } catch {
      /* keep seed */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch {
      /* ignore */
    }
  }, [events]);

  const visibleEvents = useMemo(
    () => events.filter((e) => eventVisibleForPhotographer(e, filterPhotographerId)),
    [events, filterPhotographerId],
  );

  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  const cells = useMemo(() => buildCalendarCells(y, m), [y, m]);
  const monthPrefix = monthKey(viewDate);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of visibleEvents) {
      const list = map.get(e.dateISO) ?? [];
      list.push(e);
      map.set(e.dateISO, list);
    }
    return map;
  }, [visibleEvents]);

  const agendaEvents = useMemo(() => {
    return visibleEvents
      .filter((e) => e.dateISO.startsWith(monthPrefix))
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.title.localeCompare(b.title));
  }, [visibleEvents, monthPrefix]);

  const openAdd = useCallback((dateISO: string) => {
    setModal({
      open: true,
      mode: "add",
      dateISO,
      title: "",
      sub: "",
      weddingId: "",
    });
  }, []);

  const openEdit = useCallback((ev: CalEvent) => {
    setModal({
      open: true,
      mode: "edit",
      eventId: ev.id,
      dateISO: ev.dateISO,
      title: ev.title,
      sub: ev.sub,
      weddingId: ev.weddingId ?? "",
    });
  }, []);

  const closeModal = useCallback(() => setModal({ open: false }), []);

  const saveModal = useCallback(() => {
    if (!modal.open) return;
    const { title, sub, dateISO, weddingId } = modal;
    const t = title.trim();
    if (!t) return;
    if (modal.mode === "add") {
      const id = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setEvents((prev) => [
        ...prev,
        {
          id,
          dateISO,
          title: t,
          sub: sub.trim(),
          weddingId: weddingId || undefined,
        },
      ]);
    } else if (modal.mode === "edit" && modal.eventId) {
      const id = modal.eventId;
      setEvents((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                dateISO,
                title: t,
                sub: sub.trim(),
                weddingId: weddingId || undefined,
              }
            : e,
        ),
      );
    }
    closeModal();
  }, [modal, closeModal]);

  const deleteEvent = useCallback(() => {
    if (!modal.open || modal.mode !== "edit" || !modal.eventId) return;
    const id = modal.eventId;
    setEvents((prev) => prev.filter((e) => e.id !== id));
    closeModal();
  }, [modal, closeModal]);

  const shiftMonth = (delta: number) => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  };

  const onMonthInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) return;
    const [yy, mm] = v.split("-").map(Number);
    if (yy && mm) setViewDate(new Date(yy, mm - 1, 1));
  };

  const todayISO = toISODateLocal(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Calendar</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
            Shoots, travel, and consults in one place—synced from Google Calendar when you connect it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={monthInputRef}
            type="month"
            className="sr-only"
            value={`${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}`}
            onChange={onMonthInputChange}
            aria-hidden
          />
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-1 py-1 text-[12px] font-semibold text-ink-muted">
            <button
              type="button"
              className="rounded-full p-2 text-ink-muted transition hover:bg-canvas hover:text-ink"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className="flex min-w-[9rem] items-center justify-center gap-2 px-2 py-1.5 text-[13px] font-semibold text-ink"
              onClick={() => monthInputRef.current?.showPicker?.() ?? monthInputRef.current?.click()}
            >
              <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              {formatMonthYear(viewDate)}
            </button>
            <button
              type="button"
              className="rounded-full p-2 text-ink-muted transition hover:bg-canvas hover:text-ink"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-7 gap-2">
            {cells.map(({ d, inMonth }, idx) => {
              const iso = toISODateLocal(d);
              const dayEvents = eventsByDate.get(iso) ?? [];
              const hasEvents = dayEvents.length > 0;
              const isToday = inMonth && iso === todayISO;
              const show = dayEvents.slice(0, 2);
              const more = dayEvents.length - show.length;

              return (
                <div
                  key={`${iso}-${idx}`}
                  role="gridcell"
                  className={
                    "flex min-h-[5.5rem] flex-col gap-1 rounded-xl border p-2 text-left transition " +
                    (inMonth
                      ? hasEvents || isToday
                        ? "border-link/40 bg-link/10"
                        : "border-transparent bg-canvas/30 hover:border-border"
                      : "border-transparent bg-canvas/15 opacity-50")
                  }
                  onDoubleClick={(e) => {
                    if (!inMonth) return;
                    e.preventDefault();
                    openAdd(iso);
                  }}
                >
                  <span
                    className={
                      "text-[13px] font-semibold " + (inMonth ? "text-ink" : "text-ink-faint")
                    }
                  >
                    {d.getDate()}
                  </span>
                  <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                    {show.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        className="truncate rounded-md border border-border/80 bg-surface px-1.5 py-0.5 text-left text-[10px] font-semibold leading-tight text-ink transition hover:border-link/40"
                        title={ev.title}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          openEdit(ev);
                        }}
                      >
                        {ev.title}
                      </button>
                    ))}
                    {more > 0 ? (
                      <span className="text-[10px] text-ink-muted">+{more} more</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-ink-faint">Double-click a day to add an event.</p>
        </div>

        <div className="space-y-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Agenda</p>
          <div className="space-y-3">
            {agendaEvents.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-canvas/40 px-4 py-8 text-center text-[13px] text-ink-muted">
                No events this month. Switch month or add one from the grid.
              </p>
            ) : (
              agendaEvents.map((e) => {
                const parts = e.dateISO.split("-");
                const dd = parts[2];
                const monthShort = new Date(e.dateISO + "T12:00:00").toLocaleString("en-GB", {
                  month: "short",
                });
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4 transition hover:border-white/[0.12]"
                    onDoubleClick={() => openEdit(e)}
                  >
                    <div className="flex h-14 w-14 flex-col items-center justify-center rounded-lg bg-canvas text-center">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                        {monthShort}
                      </span>
                      <span className="text-base font-semibold text-ink">{dd}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-ink">{e.title}</p>
                      <p className="mt-1 text-[13px] text-ink-muted">{e.sub}</p>
                      {e.weddingId ? (
                        <Link
                          to={`${weddingLinkBase}/${e.weddingId}`}
                          className="mt-2 inline-flex text-[12px] font-semibold text-link hover:text-link-hover"
                          onClick={(ev) => ev.stopPropagation()}
                          onMouseDown={(ev) => ev.stopPropagation()}
                        >
                          Open wedding
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {modal.open ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={modal.mode === "add" ? "Add event" : "Edit event"}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-ink">
                {modal.mode === "add" ? "New event" : "Edit event"}
              </h2>
              <button
                type="button"
                className="rounded-full p-2 text-ink-faint hover:bg-canvas hover:text-ink"
                aria-label="Close"
                onClick={closeModal}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-[12px] font-semibold text-ink-muted">
                Date
                <input
                  type="date"
                  value={modal.dateISO}
                  onChange={(e) => setModal((s) => (s.open ? { ...s, dateISO: e.target.value } : s))}
                  className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
                />
              </label>
              <label className="block text-[12px] font-semibold text-ink-muted">
                Title
                <input
                  value={modal.title}
                  onChange={(e) => setModal((s) => (s.open ? { ...s, title: e.target.value } : s))}
                  className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
                  placeholder="e.g. Consultation · Priya & Daniel"
                />
              </label>
              <label className="block text-[12px] font-semibold text-ink-muted">
                Details
                <input
                  value={modal.sub}
                  onChange={(e) => setModal((s) => (s.open ? { ...s, sub: e.target.value } : s))}
                  className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
                  placeholder="Location or notes"
                />
              </label>
              <label className="block text-[12px] font-semibold text-ink-muted">
                Link to wedding
                <select
                  value={modal.weddingId}
                  onChange={(e) => setModal((s) => (s.open ? { ...s, weddingId: e.target.value } : s))}
                  className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
                >
                  {WEDDING_OPTIONS.map((o) => (
                    <option key={o.value || "none"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              {modal.mode === "edit" ? (
                <button
                  type="button"
                  className="rounded-full px-4 py-2 text-[13px] font-semibold text-[#e01e5a] hover:bg-[#e01e5a]/10"
                  onClick={deleteEvent}
                >
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink-muted hover:text-ink"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border bg-surface px-5 py-2 text-[13px] font-semibold text-ink transition hover:border-white/[0.12] disabled:opacity-40"
                  disabled={!modal.title.trim()}
                  onClick={saveModal}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
