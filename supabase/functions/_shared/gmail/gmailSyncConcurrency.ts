/**
 * G1: Bounded concurrency for Gmail sync workers (avoids sequential N round-trips while staying rate-limit safe).
 */

/** Max concurrent `threads.get` metadata calls per label sync (bounded; not unbounded parallelism). */
export const GMAIL_THREAD_METADATA_CONCURRENCY = 6;

/**
 * When `users.threads.list` returns a non-empty snippet, staging can skip `threads.get` for that thread:
 * subject stays null and message_count is a lower bound (≥1); G2+ prepare still loads full thread for approval.
 */
export function shouldSkipThreadMetadataFetch(tr: { snippet?: string }): boolean {
  return typeof tr.snippet === "string" && tr.snippet.trim().length > 0;
}

/**
 * Run async work over `items` with at most `concurrency` in-flight tasks (pool / work-queue).
 */
export async function runPoolWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await worker(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}
