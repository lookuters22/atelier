import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCalendarMode, WEDDING_OPTIONS, type EventType, type CalEvent } from "./CalendarModeContext";

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "shoot", label: "Shoot" },
  { value: "consult", label: "Consultation" },
  { value: "travel", label: "Travel" },
  { value: "block", label: "Block" },
];

const eventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  dateISO: z.string().min(1, "Date is required"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  type: z.enum(["shoot", "consult", "travel", "block"]),
  sub: z.string().optional(),
  location: z.string().optional(),
  meetUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  weddingId: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventSchema>;

type Props =
  | { mode: "new"; prefillDate: string; prefillTime?: string }
  | { mode: "edit"; event: CalEvent };

export function EventForm(props: Props) {
  const { saveEvent, updateEvent, deleteEvent, closeInspector } = useCalendarMode();

  const defaults: EventFormValues =
    props.mode === "edit"
      ? {
          title: props.event.title,
          dateISO: props.event.dateISO,
          startTime: props.event.startTime ?? "",
          endTime: props.event.endTime ?? "",
          type: props.event.type,
          sub: props.event.sub ?? "",
          location: props.event.location ?? "",
          meetUrl: props.event.meetUrl ?? "",
          weddingId: props.event.weddingId ?? "",
        }
      : {
          title: "",
          dateISO: props.prefillDate,
          startTime: props.prefillTime ?? "",
          endTime: "",
          type: "consult" as EventType,
          sub: "",
          location: "",
          meetUrl: "",
          weddingId: "",
        };

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: defaults,
    mode: "onChange",
  });

  useEffect(() => {
    reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.mode === "edit" ? props.event.id : props.prefillDate]);

  const onSubmit = (data: EventFormValues) => {
    const payload = {
      title: data.title,
      dateISO: data.dateISO,
      sub: data.sub ?? "",
      type: data.type as EventType,
      startTime: data.startTime || undefined,
      endTime: data.endTime || undefined,
      location: data.location || undefined,
      meetUrl: data.meetUrl || undefined,
      weddingId: data.weddingId || undefined,
    };

    if (props.mode === "edit") {
      updateEvent(props.event.id, payload);
    } else {
      saveEvent(payload);
    }
  };

  const inputCls =
    "mt-1 w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-[13px] text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring/30";
  const labelCls = "block text-[12px] font-semibold text-muted-foreground";
  const errorCls = "mt-0.5 text-[11px] text-destructive";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <h2 className="text-[14px] font-semibold text-foreground">
          {props.mode === "edit" ? "Edit Event" : "New Event"}
        </h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className={labelCls}>
              Title
              <input {...register("title")} className={inputCls} placeholder="e.g. Timeline Review" />
            </label>
            {errors.title && <p className={errorCls}>{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className={labelCls}>
              Date
              <input type="date" {...register("dateISO")} className={inputCls} />
            </label>
            <label className={labelCls}>
              Type
              <select {...register("type")} className={inputCls}>
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className={labelCls}>
              Start time
              <input type="time" {...register("startTime")} className={inputCls} />
            </label>
            <label className={labelCls}>
              End time
              <input type="time" {...register("endTime")} className={inputCls} />
            </label>
          </div>

          <label className={labelCls}>
            Details / notes
            <input {...register("sub")} className={inputCls} placeholder="Location, notes..." />
          </label>

          <label className={labelCls}>
            Location
            <input {...register("location")} className={inputCls} placeholder="Venue or address" />
          </label>

          <div>
            <label className={labelCls}>
              Meet URL
              <input {...register("meetUrl")} className={inputCls} placeholder="https://meet.google.com/..." />
            </label>
            {errors.meetUrl && <p className={errorCls}>{errors.meetUrl.message}</p>}
          </div>

          <label className={labelCls}>
            Link to wedding
            <select {...register("weddingId")} className={inputCls}>
              {WEDDING_OPTIONS.map((o) => (
                <option key={o.value || "none"} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="flex items-center justify-between">
          {props.mode === "edit" ? (
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-[13px] font-semibold text-destructive hover:bg-destructive/10"
              onClick={() => deleteEvent(props.event.id)}
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
              onClick={closeInspector}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="rounded-lg bg-[#2563eb] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#2563eb]/90 disabled:opacity-40"
            >
              {props.mode === "edit" ? "Update" : "Save Event"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
