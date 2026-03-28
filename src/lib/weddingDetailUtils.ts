import { WEDDING_IDS, type WeddingEntry, type WeddingId } from "../data/weddingCatalog";
import { WEDDING_PEOPLE_DEFAULTS, type WeddingPersonRow } from "../data/weddingPeopleDefaults";
import {
  getMessagesForThread,
  type WeddingThread,
  type WeddingThreadMessage,
} from "../data/weddingThreads";
import type { WeddingDetailPersisted } from "./weddingDetailStorage";
import { TAB_IDS, type ReplyMeta, type TabId } from "./weddingDetailTypes";

export function parseWeddingTabParam(v: string | null): TabId | null {
  if (!v) return null;
  return (TAB_IDS as readonly string[]).includes(v) ? (v as TabId) : null;
}

export function isBuiltInWeddingId(id: string): id is WeddingId {
  return (WEDDING_IDS as readonly string[]).includes(id);
}

/** First email found in People rows (e.g. "Planner Â· name@site.com"). */
export function firstEmailFromPeople(rows: WeddingPersonRow[]): string | null {
  for (const person of rows) {
    const match = person.subtitle.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    if (match) return match[0];
  }
  return null;
}

export function buildWeddingDetailDefaults(
  weddingId: string,
  entry: WeddingEntry,
): WeddingDetailPersisted {
  const people = isBuiltInWeddingId(weddingId)
    ? WEDDING_PEOPLE_DEFAULTS[weddingId]
    : [{ id: `${weddingId}-p1`, name: "", subtitle: "" }];

  return {
    wedding: {
      couple: entry.couple,
      when: entry.when,
      where: entry.where,
      stage: entry.stage,
      package: entry.package,
      value: entry.value,
      balance: entry.balance,
    },
    people,
    photographerNotes: "",
  };
}

export function buildDraftPendingByThread(threads: WeddingThread[]): Record<string, boolean> {
  const pendingByThread: Record<string, boolean> = {};
  for (const thread of threads) {
    if (thread.hasPendingDraft) pendingByThread[thread.id] = true;
  }
  return pendingByThread;
}

export function defaultExpandedForWeddingMessage(msg: WeddingThreadMessage): boolean {
  return msg.daySegment === "today";
}

export function buildReplyMeta(
  activeThread: WeddingThread | undefined,
  people: WeddingPersonRow[],
): ReplyMeta {
  const fromPeople = firstEmailFromPeople(people);
  if (!activeThread) {
    return { toAddr: fromPeople, subjectLine: "Re: â€¦" };
  }

  const messages = getMessagesForThread(activeThread.id);
  const lastMessage = messages[messages.length - 1];
  const lastMeta = lastMessage?.meta?.trim();
  const toFromMeta = lastMeta && lastMeta.includes("@") ? lastMeta : undefined;
  const toAddr = activeThread.composerTo ?? toFromMeta ?? fromPeople ?? null;
  const subjectLine =
    activeThread.composerSubjectDefault ??
    (lastMessage?.subject ? `Re: ${lastMessage.subject}` : "Re: â€¦");

  return { toAddr, subjectLine };
}
