import { describe, expect, it } from "vitest";
import {
  buildGmailDurableRenderArtifact,
  GMAIL_DURABLE_RENDER_STRATEGY_INLINE_DATA_URI_V1,
  type RemoteAssetScan,
} from "./gmailImportDurableRender.ts";
import type { InlineEmailAssetsStats } from "./inlineEmailAssets.ts";

const baseInlineStats = (): InlineEmailAssetsStats => ({
  img: {
    attempted: 0,
    inlined: 0,
    failed: 0,
    skipped_non_http: 0,
    skipped_cap: 0,
    srcset_candidates: 0,
  },
  media: {
    attempted: 0,
    inlined: 0,
    failed: 0,
    skipped_non_http: 0,
    skipped_cap: 0,
  },
  css_url: {
    discovered_unique: 0,
    attempted: 0,
    inlined: 0,
    failed: 0,
    skipped_non_http: 0,
    skipped_cap: 0,
  },
  link_stylesheet: { discovered: 0, merged_as_style: 0, failed: 0 },
  combined: {
    max_urls_budget_per_round: 90,
    rounds_executed: 2,
    urls_attempted_total: 5,
    approx_total_inlined_bytes: 1000,
  },
});

const emptyScan = (): RemoteAssetScan => ({
  self_contained: true,
  categories: [],
  img_src_remote: 0,
  video_src_remote: 0,
  audio_src_remote: 0,
  iframe_src_remote: 0,
  embed_src_remote: 0,
  has_img_srcset_remote: false,
  has_picture_source_srcset_remote: false,
  has_srcset_remote: false,
  css_url_remote_count: 0,
  css_import_remote_count: 0,
  link_href_remote_count: 0,
  css_font_url_https_hint: 0,
});

describe("buildGmailDurableRenderArtifact", () => {
  it("marks self-contained when post-scan has no remote asset refs", () => {
    const scan = emptyScan();
    const art = buildGmailDurableRenderArtifact(baseInlineStats(), scan, scan);
    expect(art.strategy).toBe(GMAIL_DURABLE_RENDER_STRATEGY_INLINE_DATA_URI_V1);
    expect(art.self_contained).toBe(true);
    expect(art.g3_migration_hint).toBe("prefer_storage_blob_artifact_v1");
    expect(art.scan_pre_sanitize.self_contained).toBe(true);
    expect(art.scan_post_sanitize?.self_contained).toBe(true);
  });

  it("records non-self-contained when video still references https", () => {
    const scan: RemoteAssetScan = {
      ...emptyScan(),
      self_contained: false,
      categories: ["video_src_remote"],
      video_src_remote: 1,
    };
    const art = buildGmailDurableRenderArtifact(baseInlineStats(), scan, scan);
    expect(art.self_contained).toBe(false);
    expect(art.scan_pre_sanitize.video_src_remote).toBe(1);
  });
});
