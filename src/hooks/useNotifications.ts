import { useCallback, useEffect, useState } from "react";
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
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => onDataChanged(refetch), [refetch]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const q1 = supabase
      .from("tasks")
      .select("id, title, due_date, weddings(couple_names)")
      .eq("status", "open")
      .order("due_date", { ascending: true })
      .limit(5);

    const q2 = supabase
      .from("drafts")
      .select("id, body, threads(title, weddings(couple_names))")
      .eq("status", "pending_approval")
      .limit(5);

    const q3 = supabase
      .from("threads")
      .select("id, title, last_activity_at")
      .is("wedding_id", null)
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
        const thread = row.threads as Record<string, unknown> | null;
        const wedding = thread?.weddings as Record<string, unknown> | null;
        const coupleName = (wedding?.couple_names as string) ?? "Unknown";
        const threadTitle = (thread?.title as string) ?? "";
        notifications.push({
          id: `draft-${row.id}`,
          kind: "draft",
          title: "Draft awaiting approval",
          body: `${coupleName} \u2014 ${threadTitle}`.slice(0, 80),
          time: "Pending",
          href: `${routePrefix}/approvals`,
          sortKey: Date.now(),
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
  }, [routePrefix, fetchKey]);

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
