import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { addCustomWedding } from "../data/customWeddings";
import type { WeddingEntry } from "../data/weddingCatalog";

const WEDDING_STAGES = [
  "Inquiry",
  "Proposal sent",
  "Contract out",
  "Booked",
  "In production",
  "Final balance",
  "Delivered",
  "Archived",
] as const;

const TIMEZONE_OPTIONS = [
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "Europe/Rome", label: "Europe/Rome" },
  { value: "Europe/Athens", label: "Europe/Athens" },
  { value: "America/New_York", label: "America/New York" },
  { value: "America/Los_Angeles", label: "America/Los Angeles" },
  { value: "Asia/Dubai", label: "Asia/Dubai" },
  { value: "Asia/Singapore", label: "Asia/Singapore" },
  { value: "Australia/Sydney", label: "Australia/Sydney" },
] as const;

/** `isoDate` is YYYY-MM-DD from `<input type="date" />` */
function formatWhenLine(isoDate: string, tzValue: string): string {
  if (!isoDate.trim()) return "Date TBD";
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "Date TBD";
  const line = d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${line} · ${tzValue}`;
}

export function AddWeddingPage() {
  const navigate = useNavigate();
  const [couple, setCouple] = useState("");
  const [weddingDate, setWeddingDate] = useState("");
  const [timezone, setTimezone] = useState("Europe/London");
  const [where, setWhere] = useState("");
  const [stage, setStage] = useState<string>(WEDDING_STAGES[0]);
  const [packageName, setPackageName] = useState("");
  const [value, setValue] = useState("");
  const [balance, setBalance] = useState("");
  const [story, setStory] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const c = couple.trim();
    if (!c) return;

    const when = formatWhenLine(weddingDate, timezone);

    const entry: WeddingEntry = {
      couple: c,
      when,
      where: where.trim() || "Venue TBD",
      stage: stage || WEDDING_STAGES[0],
      package: packageName.trim() || "Package TBD",
      value: value.trim() || "—",
      balance: balance.trim() || "—",
      story:
        story.trim() ||
        "New project — add context in Story so far, people, and travel as you go.",
    };

    const id = addCustomWedding(entry);
    navigate(`/wedding/${id}`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link
          to="/weddings"
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:text-link-hover"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Weddings
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink">Add wedding</h1>
        <p className="mt-2 text-[14px] text-ink-muted">
          Create a new project. You can refine everything later on the wedding page.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-surface p-5">
        <label className="block text-[12px] font-semibold text-ink-muted">
          Couple / project name <span className="text-link">*</span>
          <input
            required
            value={couple}
            onChange={(e) => setCouple(e.target.value)}
            placeholder="e.g. Alex & Jordan"
            className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:border-[#0169cc] focus:outline-none focus:ring-1 focus:ring-link/25"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[12px] font-semibold text-ink-muted">
            Wedding date
            <input
              type="date"
              value={weddingDate}
              onChange={(e) => setWeddingDate(e.target.value)}
              className="mt-1 w-full min-h-[42px] cursor-pointer rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink focus:border-[#0169cc] focus:outline-none focus:ring-1 focus:ring-link/25 [color-scheme:light]"
            />
            <span className="mt-1 block text-[11px] font-normal text-ink-faint">Opens your browser calendar</span>
          </label>
          <label className="block text-[12px] font-semibold text-ink-muted">
            Timezone
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="mt-1 w-full min-h-[42px] cursor-pointer appearance-none rounded-xl border border-border bg-canvas bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat px-3 py-2 pr-9 text-[13px] text-ink focus:border-[#0169cc] focus:outline-none focus:ring-1 focus:ring-link/25"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              }}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-[12px] font-semibold text-ink-muted">
          Location
          <input
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            placeholder="e.g. Château · Provence"
            className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint"
          />
        </label>
        <label className="block text-[12px] font-semibold text-ink-muted">
          Stage
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="mt-1 w-full min-h-[42px] cursor-pointer appearance-none rounded-xl border border-border bg-canvas bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat px-3 py-2 pr-9 text-[13px] text-ink focus:border-[#0169cc] focus:outline-none focus:ring-1 focus:ring-link/25"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            }}
          >
            {WEDDING_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[12px] font-semibold text-ink-muted">
          Package
          <input
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[12px] font-semibold text-ink-muted">
            Contract value
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="—"
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
            />
          </label>
          <label className="block text-[12px] font-semibold text-ink-muted">
            Balance / status
            <input
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="—"
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink"
            />
          </label>
        </div>
        <label className="block text-[12px] font-semibold text-ink-muted">
          Story (optional)
          <textarea
            value={story}
            onChange={(e) => setStory(e.target.value)}
            rows={3}
            placeholder="Short context for your team…"
            className="mt-1 w-full resize-y rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-faint"
          />
        </label>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Link
            to="/weddings"
            className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink-muted hover:text-ink"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md border border-border bg-surface px-5 py-2 text-[13px] font-semibold text-ink transition hover:border-white/[0.12]"
          >
            Create & open
          </button>
        </div>
      </form>
    </div>
  );
}
