import { describe, expect, it } from "vitest";
import { signGoogleOAuthState, verifyGoogleOAuthState, type GoogleOAuthStatePayload } from "./googleOAuthState.ts";

describe("googleOAuthState", () => {
  it("round-trips signed state", async () => {
    const secret = "test-secret-key-min-32-chars-long!!";
    const payload: GoogleOAuthStatePayload = {
      v: 1,
      photographerId: "550e8400-e29b-41d4-a716-446655440000",
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce: "n1",
    };
    const state = await signGoogleOAuthState(payload, secret);
    const out = await verifyGoogleOAuthState(state, secret);
    expect(out).not.toBeNull();
    expect(out?.photographerId).toBe(payload.photographerId);
    expect(out?.nonce).toBe("n1");
  });

  it("rejects tampered state", async () => {
    const secret = "test-secret-key-min-32-chars-long!!";
    const payload: GoogleOAuthStatePayload = {
      v: 1,
      photographerId: "550e8400-e29b-41d4-a716-446655440000",
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce: "n2",
    };
    const state = await signGoogleOAuthState(payload, secret);
    const out = await verifyGoogleOAuthState(state + "x", secret);
    expect(out).toBeNull();
  });
});
