import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CheckSquare,
  Columns3,
  GalleryHorizontal,
  Inbox,
  LayoutGrid,
  ListTodo,
  Users,
  Wallet,
} from "lucide-react";
import { SidebarProvider, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AppSidebar, type NavItem } from "../components/app-sidebar";
import { SupportAssistantWidget } from "../components/SupportAssistantWidget";
import { supabase } from "../lib/supabase";
import { fireDataChanged } from "../lib/events";
import { useTodayMetrics } from "../hooks/useTodayMetrics";
import { useNotifications } from "../hooks/useNotifications";

const nav: NavItem[] = [
  { to: "/", label: "Today", icon: LayoutGrid, end: true },
  {
    to: "/weddings",
    label: "Weddings",
    icon: GalleryHorizontal,
    items: [
      { to: "/weddings", label: "Active Weddings" },
      { to: "/weddings/deliverables", label: "Deliverables / Albums" },
      { to: "/weddings/archived", label: "Archived" },
    ],
  },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/approvals", label: "Approvals", icon: CheckSquare },
  { to: "/pipeline", label: "Pipeline", icon: Columns3 },
  { to: "/financials", label: "Financials", icon: Wallet },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  {
    to: "/contacts",
    label: "Contacts",
    icon: Users,
    items: [
      { to: "/contacts", label: "Clients" },
      { to: "/contacts/vendors", label: "Vendors" },
    ],
  },
  { to: "/tasks", label: "Tasks", icon: ListTodo },
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

function DashboardContent() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-8 py-8">
      <Outlet />
    </main>
  );
}

export function DashboardLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { unfiledCount, pendingDraftsCount } = useTodayMetrics();
  const badgeMap: Record<string, number> = {
    "/inbox": unfiledCount,
    "/approvals": pendingDraftsCount,
  };
  const { items: notifs, unreadCount, markAllRead, markRead, isUnread } = useNotifications();
  const isOfferBuilderEditorMode = pathname.startsWith("/settings/offer-builder/edit");
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel("global-db-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "drafts" }, () => fireDataChanged("drafts"))
      .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, () => fireDataChanged("inbox"))
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => fireDataChanged("inbox"))
      .on("postgres_changes", { event: "*", schema: "public", table: "weddings" }, () => fireDataChanged("weddings"))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => fireDataChanged("tasks"))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const openNotification = (href: string, id: string) => {
    markRead(id);
    navigate(href);
  };

  if (isOfferBuilderEditorMode) {
    return (
      <div className="flex h-[100dvh] max-h-[100dvh] overflow-hidden bg-canvas">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0">
            <Outlet />
          </main>
        </div>
        <SupportAssistantWidget />
      </div>
    );
  }

  return (
    <SidebarProvider className="font-dashboard">
      <div className="dash-mux-bg" aria-hidden="true" />
      <AppSidebar
        nav={nav}
        badgeMap={badgeMap}
        onHelpClick={() => setHelpOpen(true)}
        onSearch={() => navigate("/inbox")}
        notificationProps={{
          items: notifs,
          unreadCount,
          markAllRead,
          isUnread,
          onOpen: openNotification,
          inboxHref: "/inbox",
        }}
      />

      <SidebarResizeHandle />

      <SidebarInset>
        <DashboardContent />
      </SidebarInset>

      <SupportAssistantWidget />

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md rounded-[18px]">
          <DialogHeader>
            <DialogTitle>Help</DialogTitle>
            <DialogDescription>
              Use <strong className="text-ink">Today</strong> for priorities,{" "}
              <strong className="text-ink">Inbox</strong> to triage threads, and{" "}
              <strong className="text-ink">Approvals</strong> before anything is sent to clients.
            </DialogDescription>
          </DialogHeader>
          <ul className="mt-2 list-inside list-disc space-y-2 text-[13px] text-ink-muted">
            <li>Notifications surface drafts and unfiled mail.</li>
            <li>Search + Enter jumps to Inbox (demo).</li>
            <li>WhatsApp mirrors the same queue when connected.</li>
          </ul>
          <Button className="mt-4 w-full rounded-full" onClick={() => setHelpOpen(false)}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
