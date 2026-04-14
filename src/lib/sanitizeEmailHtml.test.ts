import { describe, expect, it } from "vitest";
import { wrapEmailFragmentAsDocument } from "./sanitizeEmailHtml";

describe("sanitizeEmailHtml", () => {
  it("wraps fragments as a document shell", () => {
    expect(wrapEmailFragmentAsDocument("<p>x</p>")).toContain("<body>");
    expect(wrapEmailFragmentAsDocument("<p>x</p>")).toContain("<p>x</p>");
    expect(wrapEmailFragmentAsDocument("<!DOCTYPE html><html><head></head><body>x</body></html>")).toContain(
      "<!DOCTYPE html>",
    );
  });
});
