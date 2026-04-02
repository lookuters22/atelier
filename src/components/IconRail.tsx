import { useNavigate, useLocation } from "react-router-dom";
import { Briefcase, CalendarDays, Columns3, MessageSquare, Settings, Sun, Users } from "lucide-react";

const topModes = [
  { to: "/today", icon: Sun, label: "Today", match: (p: string) => p.startsWith("/today") },
  { to: "/inbox", icon: MessageSquare, label: "Inbox", match: (p: string) => p.startsWith("/inbox") },
  { to: "/pipeline", icon: Columns3, label: "Pipeline", match: (p: string) => p.startsWith("/pipeline") },
  { to: "/calendar", icon: CalendarDays, label: "Calendar", match: (p: string) => p.startsWith("/calendar") },
  { to: "/workspace", icon: Briefcase, label: "Workspace", match: (p: string) => p.startsWith("/workspace") },
  { to: "/directory", icon: Users, label: "Directory", match: (p: string) => p.startsWith("/directory") },
];

const settingsMode = { to: "/settings", icon: Settings, label: "Settings", match: (p: string) => p.startsWith("/settings") };

export function IconRail() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="relative z-20 flex h-full w-[52px] shrink-0 flex-col items-center border-r border-border bg-sidebar py-3">
      <button
        type="button"
        onClick={() => navigate("/today")}
        className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563eb] text-white text-sm font-semibold"
      >
        A
      </button>

      <div className="flex flex-1 flex-col items-center gap-1">
        {topModes.map((m) => {
          const active = m.match(pathname);
          return (
            <button
              key={m.to}
              type="button"
              onClick={() => navigate(m.to)}
              className={
                "flex h-10 w-10 items-center justify-center rounded-lg transition-colors " +
                (active
                  ? "bg-[#2563eb]/10 text-[#2563eb]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground")
              }
              title={m.label}
            >
              <m.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => navigate(settingsMode.to)}
          className={
            "flex h-10 w-10 items-center justify-center rounded-lg transition-colors " +
            (settingsMode.match(pathname)
              ? "bg-[#2563eb]/10 text-[#2563eb]"
              : "text-muted-foreground hover:bg-accent hover:text-foreground")
          }
          title="Settings"
        >
          <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#2563eb] text-[10px] font-semibold text-white">
          ED
        </div>
      </div>
    </nav>
  );
}
