import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { onDataChanged } from "../lib/events";

export type NotificationItem = {
  id: string;
  kind: "task" | "draft" | "unfiled";
  title: string;
  body: string;
  time: string;
  href: string;
  sortKey: number;
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

export function useNotifications(routePrefix = "") {
  const { photographerId } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(
    () =>
      onDataChanged(refetch, {
        scopes: ["tasks", "drafts", "inbox", "all"],
      }),
    [refetch],
  );

  useEffect(() => {
    if (!photographerId) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    /** A1: same open-task projection as `useTasks` (flat wedding labels). */
    const q1 = supabase
      .from("v_open_tasks_with_wedding")
      .select("id, title, due_date")
      .eq("photographer_id", photographerId)
      .order("due_date", { ascending: true })
      .limit(5);

    /** A1: flat pending-draft projection (same source as Approvals / Today metrics). */
    const q2 = supabase
      .from("v_pending_approval_drafts")
      .select("id, couple_names, thread_title, created_at")
      .eq("photographer_id", photographerId)
      .order("created_at", { ascending: false })
      .limit(5);

    /** A1: unfiled threads via inbox projection (consistent with Inbox / Today unfiled count). */
    const q3 = supabase
      .from("v_threads_inbox_latest_message")
      .select("id, title, last_activity_at")
      .eq("photographer_id", photographerId)
      .is("wedding_id", null)
      .neq("kind", "other")
      .order("last_activity_at", { ascending: false })
      .limit(5);

    Promise.all([q1, q2, q3]).then(([r1, r2, r3]) => {
      if (cancelled) return;

      const notifications: NotificationItem[] = [];

      for (const row of (r1.data ?? []) as Record<string, unknown>[]) {
        const dueDate = new Date(row.due_date as string);
        notifications.push({
          id: `task-${row.id}`,
          kind: "task",
          title: "Task due",
          body: (row.title as string).slice(0, 80),
          time: timeAgo(dueDate),
          href: `${routePrefix}/tasks`,
          sortKey: dueDate.getTime(),
        });
      }

      for (const row of (r2.data ?? []) as Record<string, unknown>[]) {
        const coupleName =
          typeof row.couple_names === "string" ? row.couple_names : "Unknown";
        const threadTitle = typeof row.thread_title === "string" ? row.thread_title : "";
        const created =
          typeof row.created_at === "string" ? new Date(row.created_at as string) : new Date();
        notifications.push({
          id: `draft-${row.id}`,
          kind: "draft",
          title: "Draft awaiting approval",
          body: `${coupleName} \u2014 ${threadTitle}`.slice(0, 80),
          time: "Pending",
          href: `${routePrefix}/approvals`,
          sortKey: created.getTime(),
        });
      }

      for (const row of (r3.data ?? []) as Record<string, unknown>[]) {
        const activityDate = new Date(row.last_activity_at as string);
        notifications.push({
          id: `unfiled-${row.id}`,
          kind: "unfiled",
          title: "Unfiled thread",
          body: ((row.title as string) ?? "New message").slice(0, 80),
          time: timeAgo(activityDate),
          href: `${routePrefix}/inbox?filter=unfiled`,
          sortKey: activityDate.getTime(),
        });
      }

      notifications.sort((a, b) => b.sortKey - a.sortKey);
      setItems(notifications);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [routePrefix, photographerId, fetchKey]);

  const unreadCount = items.filter((n) => !readIds.has(n.id)).length;

  function markAllRead() {
    setReadIds(new Set(items.map((n) => n.id)));
  }

  function markRead(id: string) {
    setReadIds((prev) => new Set(prev).add(id));
  }

  function isUnread(id: string) {
    return !readIds.has(id);
  }

  return { items, unreadCount, isLoading, markAllRead, markRead, isUnread };
}
