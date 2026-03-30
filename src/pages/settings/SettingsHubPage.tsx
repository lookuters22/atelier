import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, LayoutTemplate, MessageCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";

export type SettingsHubPageProps = {
  /** When false, hides the cross-link to the manager shell (used from `/manager/settings`). */
  showManagerPreviewLink?: boolean;
};

const COUNTRY_CODES = [
  { code: "+355", flag: "\u{1F1E6}\u{1F1F1}", label: "Albania" },
  { code: "+376", flag: "\u{1F1E6}\u{1F1E9}", label: "Andorra" },
  { code: "+54", flag: "\u{1F1E6}\u{1F1F7}", label: "Argentina" },
  { code: "+43", flag: "\u{1F1E6}\u{1F1F9}", label: "Austria" },
  { code: "+61", flag: "\u{1F1E6}\u{1F1FA}", label: "Australia" },
  { code: "+32", flag: "\u{1F1E7}\u{1F1EA}", label: "Belgium" },
  { code: "+387", flag: "\u{1F1E7}\u{1F1E6}", label: "Bosnia" },
  { code: "+55", flag: "\u{1F1E7}\u{1F1F7}", label: "Brazil" },
  { code: "+359", flag: "\u{1F1E7}\u{1F1EC}", label: "Bulgaria" },
  { code: "+1", flag: "\u{1F1E8}\u{1F1E6}", label: "Canada" },
  { code: "+56", flag: "\u{1F1E8}\u{1F1F1}", label: "Chile" },
  { code: "+86", flag: "\u{1F1E8}\u{1F1F3}", label: "China" },
  { code: "+57", flag: "\u{1F1E8}\u{1F1F4}", label: "Colombia" },
  { code: "+385", flag: "\u{1F1ED}\u{1F1F7}", label: "Croatia" },
  { code: "+357", flag: "\u{1F1E8}\u{1F1FE}", label: "Cyprus" },
  { code: "+420", flag: "\u{1F1E8}\u{1F1FF}", label: "Czechia" },
  { code: "+45", flag: "\u{1F1E9}\u{1F1F0}", label: "Denmark" },
  { code: "+20", flag: "\u{1F1EA}\u{1F1EC}", label: "Egypt" },
  { code: "+372", flag: "\u{1F1EA}\u{1F1EA}", label: "Estonia" },
  { code: "+358", flag: "\u{1F1EB}\u{1F1EE}", label: "Finland" },
  { code: "+33", flag: "\u{1F1EB}\u{1F1F7}", label: "France" },
  { code: "+49", flag: "\u{1F1E9}\u{1F1EA}", label: "Germany" },
  { code: "+30", flag: "\u{1F1EC}\u{1F1F7}", label: "Greece" },
  { code: "+852", flag: "\u{1F1ED}\u{1F1F0}", label: "Hong Kong" },
  { code: "+36", flag: "\u{1F1ED}\u{1F1FA}", label: "Hungary" },
  { code: "+354", flag: "\u{1F1EE}\u{1F1F8}", label: "Iceland" },
  { code: "+91", flag: "\u{1F1EE}\u{1F1F3}", label: "India" },
  { code: "+62", flag: "\u{1F1EE}\u{1F1E9}", label: "Indonesia" },
  { code: "+353", flag: "\u{1F1EE}\u{1F1EA}", label: "Ireland" },
  { code: "+972", flag: "\u{1F1EE}\u{1F1F1}", label: "Israel" },
  { code: "+39", flag: "\u{1F1EE}\u{1F1F9}", label: "Italy" },
  { code: "+81", flag: "\u{1F1EF}\u{1F1F5}", label: "Japan" },
  { code: "+82", flag: "\u{1F1F0}\u{1F1F7}", label: "South Korea" },
  { code: "+383", flag: "\u{1F1FD}\u{1F1F0}", label: "Kosovo" },
  { code: "+371", flag: "\u{1F1F1}\u{1F1FB}", label: "Latvia" },
  { code: "+370", flag: "\u{1F1F1}\u{1F1F9}", label: "Lithuania" },
  { code: "+352", flag: "\u{1F1F1}\u{1F1FA}", label: "Luxembourg" },
  { code: "+60", flag: "\u{1F1F2}\u{1F1FE}", label: "Malaysia" },
  { code: "+356", flag: "\u{1F1F2}\u{1F1F9}", label: "Malta" },
  { code: "+52", flag: "\u{1F1F2}\u{1F1FD}", label: "Mexico" },
  { code: "+377", flag: "\u{1F1F2}\u{1F1E8}", label: "Monaco" },
  { code: "+382", flag: "\u{1F1F2}\u{1F1EA}", label: "Montenegro" },
  { code: "+212", flag: "\u{1F1F2}\u{1F1E6}", label: "Morocco" },
  { code: "+31", flag: "\u{1F1F3}\u{1F1F1}", label: "Netherlands" },
  { code: "+64", flag: "\u{1F1F3}\u{1F1FF}", label: "New Zealand" },
  { code: "+234", flag: "\u{1F1F3}\u{1F1EC}", label: "Nigeria" },
  { code: "+389", flag: "\u{1F1F2}\u{1F1F0}", label: "N. Macedonia" },
  { code: "+47", flag: "\u{1F1F3}\u{1F1F4}", label: "Norway" },
  { code: "+63", flag: "\u{1F1F5}\u{1F1ED}", label: "Philippines" },
  { code: "+48", flag: "\u{1F1F5}\u{1F1F1}", label: "Poland" },
  { code: "+351", flag: "\u{1F1F5}\u{1F1F9}", label: "Portugal" },
  { code: "+40", flag: "\u{1F1F7}\u{1F1F4}", label: "Romania" },
  { code: "+966", flag: "\u{1F1F8}\u{1F1E6}", label: "Saudi Arabia" },
  { code: "+381", flag: "\u{1F1F7}\u{1F1F8}", label: "Serbia" },
  { code: "+65", flag: "\u{1F1F8}\u{1F1EC}", label: "Singapore" },
  { code: "+421", flag: "\u{1F1F8}\u{1F1F0}", label: "Slovakia" },
  { code: "+386", flag: "\u{1F1F8}\u{1F1EE}", label: "Slovenia" },
  { code: "+27", flag: "\u{1F1FF}\u{1F1E6}", label: "South Africa" },
  { code: "+34", flag: "\u{1F1EA}\u{1F1F8}", label: "Spain" },
  { code: "+46", flag: "\u{1F1F8}\u{1F1EA}", label: "Sweden" },
  { code: "+41", flag: "\u{1F1E8}\u{1F1ED}", label: "Switzerland" },
  { code: "+66", flag: "\u{1F1F9}\u{1F1ED}", label: "Thailand" },
  { code: "+90", flag: "\u{1F1F9}\u{1F1F7}", label: "Turkey" },
  { code: "+380", flag: "\u{1F1FA}\u{1F1E6}", label: "Ukraine" },
  { code: "+971", flag: "\u{1F1E6}\u{1F1EA}", label: "UAE" },
  { code: "+44", flag: "\u{1F1EC}\u{1F1E7}", label: "United Kingdom" },
  { code: "+1", flag: "\u{1F1FA}\u{1F1F8}", label: "United States" },
  { code: "+598", flag: "\u{1F1FA}\u{1F1FE}", label: "Uruguay" },
  { code: "+84", flag: "\u{1F1FB}\u{1F1F3}", label: "Vietnam" },
];

export function SettingsHubPage({ showManagerPreviewLink = true }: SettingsHubPageProps) {
  const { photographerId } = useAuth();
  const [countryCode, setCountryCode] = useState("+381");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [waSaving, setWaSaving] = useState(false);
  const [waSaved, setWaSaved] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);

  useEffect(() => {
    if (!photographerId) return;
    supabase
      .from("photographers")
      .select("settings")
      .eq("id", photographerId)
      .single()
      .then(({ data }) => {
        const settings = (data?.settings ?? {}) as Record<string, unknown>;
        const saved = (settings.whatsapp_number as string) ?? "";
        if (saved) {
          const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
          const match = sorted.find((c) => saved.startsWith(c.code));
          if (match) {
            setCountryCode(match.code);
            setPhoneNumber(saved.slice(match.code.length));
          } else {
            setPhoneNumber(saved);
          }
        }
      });
  }, [photographerId]);

  async function saveWhatsAppNumber() {
    if (!photographerId) return;
    setWaSaving(true);
    setWaError(null);
    setWaSaved(false);

    const fullNumber = phoneNumber.trim() ? `${countryCode}${phoneNumber.trim().replace(/^0+/, "")}` : "";

    try {
      const { data: current } = await supabase
        .from("photographers")
        .select("settings")
        .eq("id", photographerId)
        .single();

      const existing = (current?.settings ?? {}) as Record<string, unknown>;

      const { error } = await supabase
        .from("photographers")
        .update({ settings: { ...existing, whatsapp_number: fullNumber || null } })
        .eq("id", photographerId);

      if (error) throw error;
      setWaSaved(true);
      setTimeout(() => setWaSaved(false), 3000);
    } catch (err: unknown) {
      setWaError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setWaSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Studio profile, integrations, notifications, and tools for pricing, invoices, and HTML offers.
        </p>
        {showManagerPreviewLink ? (
          <p className="mt-3 text-[13px] text-ink-muted">
            <Link to="/manager/today" className="font-semibold text-accent hover:text-accent-hover">
              Studio manager preview
            </Link>
            {" — "}multi-photographer overview and team filtering (demo).
          </p>
        ) : null}
      </div>

      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">General</p>
        <p className="mt-1 text-[13px] text-ink-muted">Studio identity and connectivity.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-[13px] text-ink-muted">
            <span className="font-semibold text-ink">Display name</span>
            <input
              defaultValue="Atelier · Elena Duarte"
              className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <label className="space-y-2 text-[13px] text-ink-muted">
            <span className="font-semibold text-ink">Default currency</span>
            <input
              defaultValue="EUR"
              className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-ink focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </label>
        </div>

        <div className="mt-8 border-t border-border/70 pt-6">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Integrations</p>
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-canvas px-4 py-3">
              <div>
                <p className="text-[14px] font-semibold text-ink">Google Workspace</p>
                <p className="text-[13px] text-ink-muted">Gmail + Calendar — last sync 2 minutes ago</p>
              </div>
              <span className="rounded-full bg-lime/20 px-3 py-1 text-[12px] font-semibold text-ink">Connected</span>
            </div>
            <div className="rounded-xl border border-border bg-canvas px-4 py-4">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-[#25D366]" strokeWidth={1.75} />
                <p className="text-[14px] font-semibold text-ink">AI Assistant WhatsApp Connection</p>
              </div>
              <p className="mt-1 text-[13px] text-ink-muted">
                Link your phone number so the AI assistant can receive WhatsApp messages and route them through the pipeline.
              </p>
              <div className="mt-3 flex items-end gap-2">
                <label className="shrink-0 space-y-1 text-[12px] text-ink-muted">
                  <span className="font-semibold text-ink">Country</span>
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="block w-[200px] rounded-lg border border-border bg-canvas px-2 py-2 text-[13px] text-ink focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={`${c.code}-${c.label}`} value={c.code}>
                        {c.flag} {c.label} ({c.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0 flex-1 space-y-1 text-[12px] text-ink-muted">
                  <span className="font-semibold text-ink">Phone number</span>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="612345678"
                    className="block w-full rounded-lg border border-border bg-canvas px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </label>
                <button
                  type="button"
                  disabled={waSaving}
                  onClick={saveWhatsAppNumber}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {waSaved ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : null}
                  {waSaving ? "Saving\u2026" : waSaved ? "Saved" : "Save"}
                </button>
              </div>
              {waError ? (
                <p className="mt-2 text-[12px] font-medium text-red-600">{waError}</p>
              ) : null}
              {waSaved && !waError ? (
                <p className="mt-2 text-[12px] font-medium text-emerald-600">
                  WhatsApp number linked — {countryCode}{phoneNumber}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-border/70 pt-6">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Notifications</p>
          <div className="mt-4 space-y-3 text-[13px] text-ink-muted">
            <label className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-4 py-3">
              <span className="font-semibold text-ink">Drafts awaiting approval</span>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-4 py-3">
              <span className="font-semibold text-ink">Unfiled messages digest</span>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-accent" />
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">AI & tone</p>
        <p className="mt-2 text-[13px] text-ink-muted">
          Upload a short style guide—Atelier retrieves it before drafting. Negative constraints (no discounts, no
          delivery promises) are enforced in the orchestration layer.
        </p>
        <div className="mt-4">
          <button
            type="button"
            className="w-full rounded-xl border border-dashed border-border bg-canvas px-4 py-6 text-left text-[13px] font-semibold text-ink-muted hover:border-accent/40 md:max-w-md"
          >
            Upload tone examples
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Studio tools</p>
        <p className="mt-2 text-[13px] text-ink-muted">Configure pricing, invoice appearance, and pricing offers as HTML.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/settings/pricing-calculator"
            className="group flex flex-col rounded-xl border border-border bg-canvas px-4 py-4 transition hover:border-accent/40 hover:bg-surface"
          >
            <span className="text-[14px] font-semibold text-ink group-hover:text-accent">Pricing calculator</span>
            <span className="mt-1 text-[12px] text-ink-muted">Packages, add-ons, sample totals</span>
            <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
              Open <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
          </Link>
          <Link
            to="/settings/invoices"
            className="group flex flex-col rounded-xl border border-border bg-canvas px-4 py-4 transition hover:border-accent/40 hover:bg-surface"
          >
            <span className="text-[14px] font-semibold text-ink group-hover:text-accent">Invoice PDF setup</span>
            <span className="mt-1 text-[12px] text-ink-muted">Branding, terms, live preview</span>
            <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
              Open <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
          </Link>
          <Link
            to="/settings/offer-builder"
            className="group flex flex-col rounded-xl border border-border bg-canvas px-4 py-4 transition hover:border-accent/40 hover:bg-surface sm:col-span-2 lg:col-span-1"
          >
            <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-ink group-hover:text-accent">
              <LayoutTemplate className="h-4 w-4" strokeWidth={1.75} />
              Pricing offer builder
            </span>
            <span className="mt-1 text-[12px] text-ink-muted">HTML editor, preview, download</span>
            <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
              Open <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
