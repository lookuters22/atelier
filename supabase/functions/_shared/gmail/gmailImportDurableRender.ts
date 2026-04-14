/**
 * G6: Durable render strategy for imported Gmail HTML — explicit contract on top of inline `data:` assets.
 * Current strategy: prefetch remote http(s) assets during prepare and inline as `data:` URIs (see `inlineEmailAssets.ts`).
 * G3 will move large blobs out of `messages.metadata` / `materialization_artifact` into storage-backed refs (`g3_migration_hint`).
 */
import type { InlineEmailAssetsStats } from "./inlineEmailAssets.ts";
import { scanRemainingRemoteAssetRefs } from "./gmailEmailRemoteAssetScan.ts";

/** Full remote-asset scan shape (from `gmailEmailRemoteAssetScan.ts`). */
export type RemoteAssetScan = ReturnType<typeof scanRemainingRemoteAssetRefs>;

export const GMAIL_DURABLE_RENDER_STRATEGY_INLINE_DATA_URI_V1 = "inline_data_uri_v1" as const;

type ScanSnapshot = Pick<
  RemoteAssetScan,
  | "self_contained"
  | "categories"
  | "img_src_remote"
  | "video_src_remote"
  | "audio_src_remote"
  | "iframe_src_remote"
  | "embed_src_remote"
>;

export type GmailDurableRenderArtifactV1 = {
  version: 1;
  /** How remote assets are made refresh-stable for this message. */
  strategy: typeof GMAIL_DURABLE_RENDER_STRATEGY_INLINE_DATA_URI_V1;
  /** True when stored HTML (post-sanitize) has no remaining remote http(s) asset references we scan for. */
  self_contained: boolean;
  /** High-signal categories still pointing at remote URLs after the full pipeline (post-sanitize). */
  remaining_remote_categories: string[];
  /** Bounded summary of the inline pass (bytes + rounds; details stay in `asset_inline`). */
  inline_summary: {
    rounds_executed: number;
    urls_attempted_total: number;
    approx_total_inlined_bytes: number;
  };
  /** Remote refs after inline, before sanitize (diagnostics / blind-spot tracking). */
  scan_pre_sanitize: ScanSnapshot;
  /** Remote refs in stored HTML (what the client renders). */
  scan_post_sanitize: ScanSnapshot | null;
  /** Fixed string so later workers can branch without inferring from nested stats. */
  g3_migration_hint: "prefer_storage_blob_artifact_v1";
  prepared_at: string;
};

function scanSnapshot(s: RemoteAssetScan): ScanSnapshot {
  return {
    self_contained: s.self_contained,
    categories: s.categories,
    img_src_remote: s.img_src_remote,
    video_src_remote: s.video_src_remote,
    audio_src_remote: s.audio_src_remote,
    iframe_src_remote: s.iframe_src_remote,
    embed_src_remote: s.embed_src_remote,
  };
}

export function buildGmailDurableRenderArtifact(
  inlineStats: InlineEmailAssetsStats,
  scanPre: RemoteAssetScan,
  scanPost: RemoteAssetScan | null,
): GmailDurableRenderArtifactV1 {
  const post = scanPost ?? scanPre;
  return {
    version: 1,
    strategy: GMAIL_DURABLE_RENDER_STRATEGY_INLINE_DATA_URI_V1,
    self_contained: post.self_contained,
    remaining_remote_categories: post.categories,
    inline_summary: {
      rounds_executed: inlineStats.combined.rounds_executed,
      urls_attempted_total: inlineStats.combined.urls_attempted_total,
      approx_total_inlined_bytes: inlineStats.combined.approx_total_inlined_bytes,
    },
    scan_pre_sanitize: scanSnapshot(scanPre),
    scan_post_sanitize: scanPost ? scanSnapshot(scanPost) : null,
    g3_migration_hint: "prefer_storage_blob_artifact_v1",
    prepared_at: new Date().toISOString(),
  };
}
