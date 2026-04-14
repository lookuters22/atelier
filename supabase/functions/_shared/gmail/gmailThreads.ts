/** Gmail REST helpers — fast lane uses labelIds on users.threads.list (no search `q:`). */

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailLabelItem = {
  id: string;
  name: string;
  type: "system" | "user";
};

/** Parse `users.labels.list` JSON (testable without network). */
export function normalizeGmailLabelsResponse(json: unknown): GmailLabelItem[] {
  if (!json || typeof json !== "object") return [];
  const raw = json as { labels?: unknown };
  if (!Array.isArray(raw.labels)) return [];
  const out: GmailLabelItem[] = [];
  for (const x of raw.labels) {
    if (!x || typeof x !== "object") continue;
    const o = x as { id?: unknown; name?: unknown; type?: unknown };
    if (typeof o.id !== "string" || typeof o.name !== "string") continue;
    const t = o.type === "user" ? "user" : "system";
    out.push({ id: o.id, name: o.name, type: t });
  }
  return out;
}

/** Gmail `users.labels.list` — for Settings label picker (server-side only in production). */
export async function listGmailLabels(accessToken: string): Promise<GmailLabelItem[]> {
  const res = await fetch(`${GMAIL_BASE}/labels`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gmail labels.list failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as unknown;
  return normalizeGmailLabelsResponse(json);
}

export type GmailThreadListItem = { id: string; snippet?: string; historyId?: string };

export type GmailThreadsListPage = {
  threads: GmailThreadListItem[];
  nextPageToken?: string;
};

export async function listGmailThreadsForLabel(
  accessToken: string,
  labelId: string,
  maxResults: number,
  pageToken?: string,
): Promise<GmailThreadsListPage> {
  const u = new URL(`${GMAIL_BASE}/threads`);
  u.searchParams.set("labelIds", labelId);
  u.searchParams.set("maxResults", String(maxResults));
  if (pageToken) u.searchParams.set("pageToken", pageToken);

  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gmail threads.list failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { threads?: GmailThreadListItem[]; nextPageToken?: string };
  return {
    threads: json.threads ?? [],
    nextPageToken: json.nextPageToken,
  };
}

function headerValue(headers: { name?: string; value?: string }[] | undefined, name: string): string | null {
  if (!headers) return null;
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

export type GmailFullThreadMessage = {
  id: string;
  internalDate?: string;
  snippet?: string;
  payload?: {
    mimeType?: string;
    body?: { data?: string; size?: number };
    parts?: unknown[];
  };
};

/**
 * Full thread payload (`format=full`) for materialization — includes MIME bodies for each message.
 */
export async function getGmailThreadFull(
  accessToken: string,
  threadId: string,
): Promise<{ messages: GmailFullThreadMessage[] }> {
  const u = `${GMAIL_BASE}/threads/${encodeURIComponent(threadId)}?format=full`;
  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gmail threads.get full failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { messages?: GmailFullThreadMessage[] };
  return { messages: json.messages ?? [] };
}

/** Lightweight message ref from `threads.get?format=metadata` (ids + ordering only). */
export type GmailMessageRef = {
  id: string;
  internalDate?: string;
};

/** Same ordering as `pickLatestGmailThreadMessage` — testable without full payloads. */
export function pickLatestGmailMessageRef(refs: GmailMessageRef[]): GmailMessageRef | null {
  if (refs.length === 0) return null;
  if (refs.length === 1) return refs[0] ?? null;
  return [...refs].sort((a, b) => {
    const da = Number(a.internalDate ?? 0);
    const db = Number(b.internalDate ?? 0);
    return db - da;
  })[0] ?? null;
}

/** Latest message by Gmail internalDate (ms string); falls back to last array element. */
export function pickLatestGmailThreadMessage(messages: GmailFullThreadMessage[]): GmailFullThreadMessage | null {
  if (messages.length === 0) return null;
  if (messages.length === 1) return messages[0] ?? null;
  return [...messages].sort((a, b) => {
    const da = Number(a.internalDate ?? 0);
    const db = Number(b.internalDate ?? 0);
    return db - da;
  })[0] ?? null;
}

/** Parse `threads.get?format=metadata` JSON into message refs (id + internalDate). */
export function parseGmailThreadMessageRefsFromMetadataJson(json: unknown): GmailMessageRef[] {
  if (!json || typeof json !== "object") return [];
  const raw = json as { messages?: unknown };
  if (!Array.isArray(raw.messages)) return [];
  const out: GmailMessageRef[] = [];
  for (const m of raw.messages) {
    if (!m || typeof m !== "object") continue;
    const o = m as { id?: unknown; internalDate?: unknown };
    if (typeof o.id !== "string" || o.id.length === 0) continue;
    const internalDate = typeof o.internalDate === "string" ? o.internalDate : undefined;
    out.push({ id: o.id, internalDate });
  }
  return out;
}

async function fetchGmailThreadMetadataJson(accessToken: string, threadId: string): Promise<unknown> {
  const u = `${GMAIL_BASE}/threads/${encodeURIComponent(threadId)}?format=metadata`;
  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gmail threads.get metadata failed: ${res.status} ${t.slice(0, 200)}`);
  }
  return (await res.json()) as unknown;
}

/**
 * Single message `users.messages.get?format=full` — same Message shape as entries in `threads.get?format=full`.
 */
export async function getGmailMessageFull(
  accessToken: string,
  messageId: string,
): Promise<GmailFullThreadMessage> {
  const u = `${GMAIL_BASE}/messages/${encodeURIComponent(messageId)}?format=full`;
  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gmail messages.get full failed: ${res.status} ${t.slice(0, 200)}`);
  }
  return (await res.json()) as GmailFullThreadMessage;
}

export type GmailThreadFetchMode =
  | "thread_full_single_message"
  | "metadata_plus_latest_message_full"
  | "thread_full_fallback_metadata_empty"
  | "thread_full_fallback_metadata_error"
  | "thread_full_fallback_latest_message_error";

/**
 * Cold-path thread fetch for materialization: only the **latest** message needs full MIME.
 *
 * - **Single-message thread:** one `threads.get?format=full` (same as historical baseline — 1 HTTP).
 * - **Multi-message thread:** `threads.get?format=metadata` + `messages.get?format=full` for latest only
 *   (avoids downloading full MIME trees for older messages).
 */
export async function getGmailThreadMessagesForMaterialization(
  accessToken: string,
  threadId: string,
): Promise<{ messages: GmailFullThreadMessage[]; thread_fetch_mode: GmailThreadFetchMode }> {
  let metaJson: unknown;
  try {
    metaJson = await fetchGmailThreadMetadataJson(accessToken, threadId);
  } catch {
    const full = await getGmailThreadFull(accessToken, threadId);
    return { messages: full.messages, thread_fetch_mode: "thread_full_fallback_metadata_error" };
  }

  const refs = parseGmailThreadMessageRefsFromMetadataJson(metaJson);
  if (refs.length === 0) {
    const full = await getGmailThreadFull(accessToken, threadId);
    return { messages: full.messages, thread_fetch_mode: "thread_full_fallback_metadata_empty" };
  }

  if (refs.length === 1) {
    const full = await getGmailThreadFull(accessToken, threadId);
    return { messages: full.messages, thread_fetch_mode: "thread_full_single_message" };
  }

  const latestRef = pickLatestGmailMessageRef(refs);
  if (!latestRef) {
    const full = await getGmailThreadFull(accessToken, threadId);
    return { messages: full.messages, thread_fetch_mode: "thread_full_fallback_metadata_empty" };
  }

  try {
    const msg = await getGmailMessageFull(accessToken, latestRef.id);
    return { messages: [msg], thread_fetch_mode: "metadata_plus_latest_message_full" };
  } catch {
    const full = await getGmailThreadFull(accessToken, threadId);
    return { messages: full.messages, thread_fetch_mode: "thread_full_fallback_latest_message_error" };
  }
}

export async function getGmailThreadMetadata(
  accessToken: string,
  threadId: string,
): Promise<{ messageCount: number; snippet: string | null; subject: string | null }> {
  const u = `${GMAIL_BASE}/threads/${encodeURIComponent(threadId)}?format=metadata`;
  const res = await fetch(u, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gmail threads.get failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    messages?: { payload?: { headers?: { name?: string; value?: string }[] } }[];
    snippet?: string;
  };
  const messages = json.messages ?? [];
  const messageCount = messages.length;
  let subject: string | null = null;
  const first = messages[0];
  const headers = first?.payload?.headers;
  subject = headerValue(headers, "Subject");
  return {
    messageCount,
    snippet: json.snippet ?? null,
    subject,
  };
}
