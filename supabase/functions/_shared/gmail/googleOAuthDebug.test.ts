import { describe, expect, it } from "vitest";
import { maskGoogleOAuthClientId } from "./googleOAuthDebug.ts";

describe("maskGoogleOAuthClientId", () => {
  it("masks a typical Google OAuth client id", () => {
    const id = "108948309350-m02lagn4c5hbbu9ep195c2eotc0rquoc.apps.googleusercontent.com";
    const m = maskGoogleOAuthClientId(id);
    expect(m).not.toContain("m02l");
    expect(m).toContain("…");
    expect(m.length).toBeLessThan(id.length);
  });

  it("handles empty", () => {
    expect(maskGoogleOAuthClientId("")).toBe("(empty)");
    expect(maskGoogleOAuthClientId(null)).toBe("(empty)");
  });
});
