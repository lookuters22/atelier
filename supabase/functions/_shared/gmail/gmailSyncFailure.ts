/**
 * Bounded error text for connected_accounts.sync_error_summary (Gmail fast-lane worker).
 */
export function summarizeGmailSyncFailure(err: unknown, maxLen = 500): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length <= maxLen ? msg : msg.slice(0, maxLen);
}
