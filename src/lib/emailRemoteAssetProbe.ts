/**
 * Heuristic probe for whether stored email HTML still references third-party http(s) assets.
 * Kept in sync with `supabase/functions/_shared/gmail/gmailEmailRemoteAssetScan.ts` (G6).
 */
export type RemoteAssetScan = {
  self_contained: boolean;
  /** http(s) or protocol-relative `//` remote img src */
  img_src_remote: number;
  video_src_remote: number;
  audio_src_remote: number;
  iframe_src_remote: number;
  embed_src_remote: number;
  has_img_srcset_remote: boolean;
  has_picture_source_srcset_remote: boolean;
  has_srcset_remote: boolean;
  css_url_remote_count: number;
  css_import_remote_count: number;
  link_href_remote_count: number;
  css_font_url_https_hint: number;
  categories: string[];
};

export function scanRemainingRemoteAssetRefs(html: string): RemoteAssetScan {
  const imgSrcHttp = (html.match(/<img[^>]*src=["']https?:\/\//gi) ?? []).length;
  const imgSrcProto = (html.match(/<img[^>]*src=["']\/\//gi) ?? []).length;
  const imgSrcRemote = imgSrcHttp + imgSrcProto;

  const videoSrcHttp = (html.match(/<video[^>]*src=["']https?:\/\//gi) ?? []).length;
  const videoSrcProto = (html.match(/<video[^>]*src=["']\/\//gi) ?? []).length;
  const videoSrcRemote = videoSrcHttp + videoSrcProto;

  const audioSrcHttp = (html.match(/<audio[^>]*src=["']https?:\/\//gi) ?? []).length;
  const audioSrcProto = (html.match(/<audio[^>]*src=["']\/\//gi) ?? []).length;
  const audioSrcRemote = audioSrcHttp + audioSrcProto;

  const iframeSrcHttp = (html.match(/<iframe[^>]*src=["']https?:\/\//gi) ?? []).length;
  const iframeSrcProto = (html.match(/<iframe[^>]*src=["']\/\//gi) ?? []).length;
  const iframeSrcRemote = iframeSrcHttp + iframeSrcProto;

  const embedSrcHttp = (html.match(/<embed[^>]*src=["']https?:\/\//gi) ?? []).length;
  const embedSrcProto = (html.match(/<embed[^>]*src=["']\/\//gi) ?? []).length;
  const embedSrcRemote = embedSrcHttp + embedSrcProto;

  const hasImgSrcsetHttp = /<img[^>]*srcset=["'][^"']*https?:\/\//i.test(html);
  const hasImgSrcsetProto = /<img[^>]*srcset=["'][^"']*\/\//i.test(html);
  const hasImgSrcsetRemote = hasImgSrcsetHttp || hasImgSrcsetProto;

  const hasPicHttp = /<source[^>]*srcset=["'][^"']*https?:\/\//i.test(html);
  const hasPicProto = /<source[^>]*srcset=["'][^"']*\/\//i.test(html);
  const hasPictureSourceSrcsetRemote = hasPicHttp || hasPicProto;

  const hasSrcsetRemote = hasImgSrcsetRemote || hasPictureSourceSrcsetRemote;

  const cssUrlHttp = html.match(/url\s*\(\s*['"]?https?:\/\//gi) ?? [];
  const cssUrlProto = html.match(/url\s*\(\s*['"]?\/\//gi) ?? [];
  const css_url_remote_count = cssUrlHttp.length + cssUrlProto.length;

  const cssImportHttp = html.match(/@import\s+(?:url\s*\(\s*)?['"]?https?:\/\//gi) ?? [];
  const cssImportProto = html.match(/@import\s+(?:url\s*\(\s*)?['"]?\/\//gi) ?? [];
  const css_import_remote_count = cssImportHttp.length + cssImportProto.length;

  const linkHttp = html.match(/<link[^>]+href=["']https?:\/\//gi) ?? [];
  const linkProto = html.match(/<link[^>]+href=["']\/\//gi) ?? [];
  const link_href_remote_count = linkHttp.length + linkProto.length;

  const fontUrlMatches =
    html.match(
      /url\s*\(\s*['"]?(?:https?:\/\/|\/\/)[^'")]*\.(?:woff2?|ttf|otf|eot)(?:\?[^'")]*)?['"]?\s*\)/gi,
    ) ?? [];
  const css_font_url_https_hint = fontUrlMatches.length;

  const categories: string[] = [];
  if (imgSrcRemote > 0) categories.push("img_src_remote");
  if (hasImgSrcsetRemote) categories.push("img_srcset_remote");
  if (hasPictureSourceSrcsetRemote) categories.push("picture_source_srcset_remote");
  if (videoSrcRemote > 0) categories.push("video_src_remote");
  if (audioSrcRemote > 0) categories.push("audio_src_remote");
  if (iframeSrcRemote > 0) categories.push("iframe_src_remote");
  if (embedSrcRemote > 0) categories.push("embed_src_remote");
  if (css_url_remote_count > 0) categories.push("css_url_remote");
  if (css_import_remote_count > 0) categories.push("css_import_remote");
  if (link_href_remote_count > 0) categories.push("link_href_remote");
  if (css_font_url_https_hint > 0) categories.push("css_font_url_https_hint");

  const self_contained =
    imgSrcRemote === 0 &&
    !hasImgSrcsetRemote &&
    !hasPictureSourceSrcsetRemote &&
    videoSrcRemote === 0 &&
    audioSrcRemote === 0 &&
    iframeSrcRemote === 0 &&
    embedSrcRemote === 0 &&
    css_url_remote_count === 0 &&
    css_import_remote_count === 0 &&
    link_href_remote_count === 0;

  return {
    self_contained,
    img_src_remote: imgSrcRemote,
    video_src_remote: videoSrcRemote,
    audio_src_remote: audioSrcRemote,
    iframe_src_remote: iframeSrcRemote,
    embed_src_remote: embedSrcRemote,
    has_img_srcset_remote: hasImgSrcsetRemote,
    has_picture_source_srcset_remote: hasPictureSourceSrcsetRemote,
    has_srcset_remote: hasSrcsetRemote,
    css_url_remote_count,
    css_import_remote_count,
    link_href_remote_count,
    css_font_url_https_hint,
    categories,
  };
}

/** @deprecated Prefer scanRemainingRemoteAssetRefs */
export function hasRemoteHttpImageUrls(html: string): boolean {
  const s = scanRemainingRemoteAssetRefs(html);
  return !s.self_contained;
}
