import { Link } from "react-router-dom";
import { SettingsPage } from "../SettingsPage";

export function ManagerSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-link/10 px-4 py-3 text-[13px] text-ink-muted">
        <span className="font-semibold text-ink">Studio manager</span>
        {" · "}
        <Link to="/" className="font-semibold text-link hover:text-link-hover">
          Photographer view
        </Link>
      </div>
      <SettingsPage showManagerPreviewLink={false} />
    </div>
  );
}
