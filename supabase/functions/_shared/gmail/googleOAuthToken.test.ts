import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCESS_TOKEN_REFRESH_SKEW_MS,
  mergeGoogleReconnectRefreshToken,
  shouldRefreshAccessToken,
} from "./googleOAuthToken.ts";

describe("shouldRefreshAccessToken", () => {
  it("returns true when expires_at is null", () => {
    expect(shouldRefreshAccessToken(null, 60_000)).toBe(true);
  });

  it("returns true when within skew window of expiry", () => {
    const soon = new Date(Date.now() + 2 * 60_000).toISOString();
    expect(shouldRefreshAccessToken(soon, DEFAULT_ACCESS_TOKEN_REFRESH_SKEW_MS)).toBe(true);
  });

  it("returns false when expiry is far ahead", () => {
    const later = new Date(Date.now() + 60 * 60_000).toISOString();
    expect(shouldRefreshAccessToken(later, DEFAULT_ACCESS_TOKEN_REFRESH_SKEW_MS)).toBe(false);
  });
});

describe("mergeGoogleReconnectRefreshToken", () => {
  it("keeps existing refresh token when Google omits one on reconnect", () => {
    expect(mergeGoogleReconnectRefreshToken(undefined, "stored-refresh")).toBe("stored-refresh");
    expect(mergeGoogleReconnectRefreshToken(null, "stored-refresh")).toBe("stored-refresh");
    expect(mergeGoogleReconnectRefreshToken("", "stored-refresh")).toBe("stored-refresh");
    expect(mergeGoogleReconnectRefreshToken("   ", "stored-refresh")).toBe("stored-refresh");
  });

  it("uses new refresh token when Google returns a non-empty value", () => {
    expect(mergeGoogleReconnectRefreshToken("new-rt", "old-rt")).toBe("new-rt");
    expect(mergeGoogleReconnectRefreshToken(" new-rt ", null)).toBe("new-rt");
  });

  it("returns null when there is no incoming and no stored token", () => {
    expect(mergeGoogleReconnectRefreshToken(undefined, null)).toBe(null);
    expect(mergeGoogleReconnectRefreshToken("", null)).toBe(null);
  });
});
