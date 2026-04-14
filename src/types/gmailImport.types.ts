/**
 * Gmail fast-lane import — contracts for Inngest + edges (staged `import_candidates` only).
 *
 * **Product:** Staged Gmail threads are not a second inbox. After a future review/approve flow,
 * accepted items should materialize into the **existing Inbox / canonical `threads` model** — not a parallel tab.
 *
 * **Next steps (not this slice):** Settings label picker → `gmail-enqueue-label-sync` → review/approve UI →
 * RPC or worker to merge into canonical threads/weddings → surface in Inbox.
 *
 * Keep `schemaVersion` in sync with `GMAIL_LABEL_SYNC_V1_SCHEMA_VERSION` in `supabase/functions/_shared/inngest.ts`.
 */
export const GMAIL_LABEL_SYNC_V1_SCHEMA_VERSION_FRONTEND = 1 as const;

export type GmailLabelSyncV1Payload = {
  schemaVersion: typeof GMAIL_LABEL_SYNC_V1_SCHEMA_VERSION_FRONTEND;
  photographerId: string;
  connectedAccountId: string;
  labelId: string;
  labelName: string;
};

export type ConnectedAccountSyncStatus = "connected" | "syncing" | "error" | "disconnected";

export type ImportCandidateStatus = "pending" | "approved" | "dismissed" | "merged";

/** Gmail label row — same shape as `GmailLabelItem` / cached `labels_json` in `connected_account_gmail_label_cache`. */
export type GmailLabelOption = {
  id: string;
  name: string;
  type: "system" | "user";
};

export type GmailImportTriggerStatus = "idle" | "enqueuing" | "success" | "error";
