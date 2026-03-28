export type TabId = "timeline" | "thread" | "tasks" | "files" | "financials" | "travel";

export const TAB_IDS: TabId[] = ["timeline", "thread", "tasks", "files", "financials", "travel"];

export type ReplyScope = "reply" | "replyAll";

export type ComposerKind = "reply" | "internal";

export type ReplyMeta = {
  toAddr: string | null;
  subjectLine: string;
};
