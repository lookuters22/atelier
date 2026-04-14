import { describe, expect, it } from "vitest";
import { hasRemoteHttpImageUrls, scanRemainingRemoteAssetRefs } from "./emailRemoteAssetProbe";

describe("scanRemainingRemoteAssetRefs", () => {
  it("reports self_contained for data: img only", () => {
    const s = scanRemainingRemoteAssetRefs('<img alt="x" src="data:image/png;base64,abc">');
    expect(s.self_contained).toBe(true);
    expect(s.categories.length).toBe(0);
  });

  it("flags remote img src (https)", () => {
    const s = scanRemainingRemoteAssetRefs('<img src="https://cdn.example.com/a.png">');
    expect(s.self_contained).toBe(false);
    expect(s.categories).toContain("img_src_remote");
  });

  it("flags protocol-relative img src (//)", () => {
    const s = scanRemainingRemoteAssetRefs('<img src="//cdn.example.com/a.png">');
    expect(s.self_contained).toBe(false);
    expect(s.img_src_remote).toBe(1);
    expect(s.categories).toContain("img_src_remote");
  });

  it("distinguishes img srcset vs picture source srcset", () => {
    const imgOnly = scanRemainingRemoteAssetRefs(
      '<img src="data:image/png;base64,xx" srcset="https://cdn.example.com/a.png 1x">',
    );
    expect(imgOnly.has_img_srcset_remote).toBe(true);
    expect(imgOnly.has_picture_source_srcset_remote).toBe(false);
    expect(imgOnly.categories).toContain("img_srcset_remote");

    const pic = scanRemainingRemoteAssetRefs(
      '<picture><source srcset="https://cdn.example.com/a.webp" type="image/webp"><img src="https://x.com/f.jpg"></picture>',
    );
    expect(pic.has_picture_source_srcset_remote).toBe(true);
    expect(pic.categories).toContain("picture_source_srcset_remote");
  });

  it("flags CSS url(https) in inline style", () => {
    const s = scanRemainingRemoteAssetRefs(
      '<div style="background-image:url(https://x.com/bg.png)">x</div>',
    );
    expect(s.self_contained).toBe(false);
    expect(s.categories).toContain("css_url_remote");
  });

  it("flags CSS url(//...) protocol-relative", () => {
    const s = scanRemainingRemoteAssetRefs(
      '<div style="background-image:url(//cdn.example.com/bg.png)">x</div>',
    );
    expect(s.self_contained).toBe(false);
    expect(s.css_url_remote_count).toBeGreaterThan(0);
    expect(s.categories).toContain("css_url_remote");
  });

  it("flags @import with remote URL", () => {
    const s = scanRemainingRemoteAssetRefs(
      '<style>@import "https://fonts.googleapis.com/css2?family=X";</style>',
    );
    expect(s.self_contained).toBe(false);
    expect(s.css_import_remote_count).toBeGreaterThan(0);
    expect(s.categories).toContain("css_import_remote");
  });

  it("flags external link stylesheet href", () => {
    const s = scanRemainingRemoteAssetRefs(
      '<link rel="stylesheet" href="https://cdn.example.com/s.css">',
    );
    expect(s.self_contained).toBe(false);
    expect(s.link_href_remote_count).toBe(1);
    expect(s.categories).toContain("link_href_remote");
  });

  it("hints font URLs in CSS", () => {
    const s = scanRemainingRemoteAssetRefs(
      '<style>@font-face { font-family: X; src: url(https://fonts.gstatic.com/a.woff2) format("woff2"); }</style>',
    );
    expect(s.css_font_url_https_hint).toBeGreaterThan(0);
    expect(s.categories).toContain("css_font_url_https_hint");
  });

  it("hasRemoteHttpImageUrls matches non-self-contained", () => {
    expect(hasRemoteHttpImageUrls('<img src="https://a.com/i.png">')).toBe(true);
    expect(hasRemoteHttpImageUrls('<img src="data:image/png;base64,xx">')).toBe(false);
  });
});
