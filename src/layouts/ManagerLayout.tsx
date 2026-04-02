import { useCallback, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Camera,
  CheckSquare,
  ChevronDown,
  Columns3,
  GalleryHorizontal,
  Inbox,
  LayoutGrid,
  ListTodo,
  Users,
} from "lucide-react";
import { SidebarProvider, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { AppSidebar, type NavItem } from "../components/app-sidebar";
import { ManagerProvider, useManagerContext } from "../context/ManagerContext";
import { PHOTOGRAPHERS } from "../data/managerPhotographers";
import { useTodayMetrics } from "../hooks/useTodayMetrics";
import { useNotifications } from "../hooks/useNotifications";
import { NavLink } from "react-router-dom";


const nav: NavItem[] = [
  { to: "/manager/today", label: "Today", icon: LayoutGrid, end: false },
  {
    to: "/manager/weddings",
    label: "Weddings",
    icon: GalleryHorizontal,
    items: [
      { to: "/manager/weddings", label: "Active Weddings" },
      { to: "/manager/weddings/deliverables", label: "Deliverables / Albums" },
      { to: "/manager/weddings/archived", label: "Archived" },
    ],
  },
  { to: "/manager/inbox", label: "Inbox", icon: Inbox },
  { to: "/manager/approvals", label: "Approvals", icon: CheckSquare },
  { to: "/manager/pipeline", label: "Pipeline", icon: Columns3 },
  { to: "/manager/calendar", label: "Calendar", icon: CalendarDays },
  {
    to: "/manager/contacts",
    label: "Contacts",
    icon: Users,
    items: [
      { to: "/manager/contacts", label: "Clients" },
      { to: "/manager/contacts/vendors", label: "Vendors" },
    ],
  },
  { to: "/manager/tasks", label: "Tasks", icon: ListTodo },
];

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 360;
const SIDEBAR_DEFAULT = 256;

function SidebarResizeHandle() {
  const { open, toggleSidebar } = useSidebar();
  const didDrag = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      didDrag.current = false;

      if (!open) {
        toggleSidebar();
        return;
      }

      const wrapper = (e.target as HTMLElement).closest("[data-slot='sidebar-wrapper']") as HTMLElement | null;
      if (!wrapper) return;

      const startX = e.clientX;
      const startWidth = parseInt(getComputedStyle(wrapper).getPropertyValue("--sidebar-width")) || SIDEBAR_DEFAULT;

      wrapper.classList.add("sidebar-resizing");

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        if (Math.abs(delta) > 3) didDrag.current = true;
        const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + delta));
        wrapper.style.setProperty("--sidebar-width", `${newWidth}px`);
      };

      const onUp = () => {
        wrapper.classList.remove("sidebar-resizing");
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (!didDrag.current) toggleSidebar();
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [open, toggleSidebar],
  );

  return (
    <div
      onPointerDown={onPointerDown}
      className={`relative z-20 flex shrink-0 cursor-col-resize items-center justify-center self-stretch transition-all ${open ? "w-[18px]" : "w-[4px]"}`}
    >
      <div className={`h-[calc(100%-24px)] rounded-full transition-all ${open ? "w-[7px] bg-white/[0.08] hover:bg-white/[0.16]" : "w-0 opacity-0"}`} />
    </div>
  );
}

function ManagerContent() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-8 py-8">
      <Outlet />
    </main>
  );
}

function ManagerChrome() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { selectedId, setSelectedId } = useManagerContext();
  const { unfiledCount, pendingDraftsCount } = useTodayMetrics();
  const badgeMap: Record<string, number> = {
    "/manager/inbox": unfiledCount,
    "/manager/approvals": pendingDraftsCount,
  };
  const { items: notifs, unreadCount, markAllRead, markRead, isUnread } = useNotifications("/manager");
  const [helpOpen, setHelpOpen] = useState(false);

  const openNotification = (href: string, id: string) => {
    markRead(id);
    navigate(href);
  };

  const selectedLabel =
    selectedId === "all"
      ? "All photographers"
      : PHOTOGRAPHERS.find((p) => p.id === selectedId)?.displayName ?? "Photographer";

  const extraNavItems = [
    { to: "/manager/photographers", label: "Photographers", icon: Camera },
  ];

  const photographerSwitcher = (
    <div className="px-3 pb-1 group-data-[collapsible=icon]:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center justify-between rounded-md border border-sidebar-border bg-input px-3 py-2 text-sm text-foreground transition hover:border-sidebar-border/80">
            <span className="truncate">{selectedLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="sidebar-dropdown w-56">
          <DropdownMenuItem
            className={selectedId === "all" ? "font-semibold" : ""}
            onClick={() => setSelectedId("all")}
          >
            All photographers
          </DropdownMenuItem>
          {PHOTOGRAPHERS.map((p) => (
            <DropdownMenuItem
              key={p.id}
              className={selectedId === p.id ? "font-semibold" : ""}
              onClick={() => setSelectedId(p.id)}
            >
              <span className={"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-1 " + p.ringClass}>
                {p.initials}
              </span>
              <span className="truncate">{p.displayName}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const footerExtra = (
    <div className="px-4 py-1 group-data-[collapsible=icon]:hidden">
      <NavLink
        to="/"
        className="block rounded-md px-3 py-2 text-[12px] text-sidebar-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        Photographer view
      </NavLink>
    </div>
  );

  return (
    <SidebarProvider className="font-dashboard">
      <div className="dash-mux-bg" aria-hidden="true" />
      <AppSidebar
        nav={nav}
        badgeMap={badgeMap}
        subtitle="Studio manager"
        userName="Studio manager"
        userEmail="manager@atelier.studio"
        userInitials="SM"
        extraNavItems={extraNavItems}
        extraNavLabel="Team"
        footerExtra={footerExtra}
        settingsPath="/manager/settings"
        onHelpClick={() => setHelpOpen(true)}
        onSearch={() => navigate("/manager/inbox")}
        notificationProps={{
          items: notifs,
          unreadCount,
          markAllRead,
          isUnread,
          onOpen: openNotification,
          inboxHref: "/manager/inbox",
        }}
        headerExtra={photographerSwitcher}
      />

      <SidebarResizeHandle />

      <SidebarInset>
        <ManagerContent />
      </SidebarInset>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md rounded-[18px]">
          <DialogHeader>
            <DialogTitle>Help</DialogTitle>
            <DialogDescription>
              Use the <strong className="text-ink">photographer switcher</strong> to filter work by
              lead, or choose <strong className="text-ink">All photographers</strong> for the full
              studio queue.
            </DialogDescription>
          </DialogHeader>
          <ul className="mt-2 list-inside list-disc space-y-2 text-[13px] text-ink-muted">
            <li>Today highlights attention items per photographer.</li>
            <li>Photographers opens the team and jumps into filtered work.</li>
            <li>Use Photographer view to return to the single-shooter shell.</li>
          </ul>
          <Button className="mt-4 w-full rounded-full" onClick={() => setHelpOpen(false)}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

export function ManagerLayout() {
  return (
    <ManagerProvider>
      <ManagerChrome />
    </ManagerProvider>
  );
}
