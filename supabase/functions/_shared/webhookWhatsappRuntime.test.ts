/* Edge functions use `Deno.env`; Vitest runs in Node — mirror `process.env` for env reads. */
if (typeof (globalThis as unknown as { Deno?: unknown }).Deno === "undefined") {
  (globalThis as unknown as { Deno: { env: { get: (k: string) => string | undefined } } }).Deno = {
    env: { get: (key: string) => process.env[key] },
  };
}

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  isFormUrlEncodedContentType,
  isWebhookWhatsappLocalDevRuntime,
  maskIdentifierForLog,
  maskPhoneForLog,
  resolveTwilioVerifySkipMode,
} from "./webhookWhatsappRuntime.ts";

function saveRelevantEnv() {
  return {
    skip: process.env.TWILIO_WEBHOOK_VERIFY_SKIP,
    url: process.env.SUPABASE_URL,
    loose: process.env.WEBHOOK_WEB_ALLOW_LOOSE_ANONYMOUS,
  };
}

function restoreRelevantEnv(s: {
  skip: string | undefined;
  url: string | undefined;
  loose: string | undefined;
}) {
  if (s.skip === undefined) delete process.env.TWILIO_WEBHOOK_VERIFY_SKIP;
  else process.env.TWILIO_WEBHOOK_VERIFY_SKIP = s.skip;
  if (s.url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = s.url;
  if (s.loose === undefined) delete process.env.WEBHOOK_WEB_ALLOW_LOOSE_ANONYMOUS;
  else process.env.WEBHOOK_WEB_ALLOW_LOOSE_ANONYMOUS = s.loose;
}

describe("resolveTwilioVerifySkipMode", () => {
  const saved = { current: saveRelevantEnv() };

  beforeEach(() => {
    saved.current = saveRelevantEnv();
    delete process.env.TWILIO_WEBHOOK_VERIFY_SKIP;
    process.env.SUPABASE_URL = "https://abc123.supabase.co";
    delete process.env.WEBHOOK_WEB_ALLOW_LOOSE_ANONYMOUS;
  });

  afterEach(() => {
    restoreRelevantEnv(saved.current);
  });

  it("returns verify when skip is off", () => {
    process.env.SUPABASE_URL = "https://abc123.supabase.co";
    process.env.TWILIO_WEBHOOK_VERIFY_SKIP = undefined;
    expect(resolveTwilioVerifySkipMode()).toEqual({ mode: "verify" });
  });

  it("returns skip_allowed when skip is on and runtime is local (localhost URL)", () => {
    process.env.TWILIO_WEBHOOK_VERIFY_SKIP = "true";
    process.env.SUPABASE_URL = "http://127.0.0.1:54321";
    expect(resolveTwilioVerifySkipMode()).toEqual({ mode: "skip_allowed" });
  });

  it("returns skip_allowed when skip is 1 and SUPABASE URL is empty (local heuristics)", () => {
    process.env.TWILIO_WEBHOOK_VERIFY_SKIP = "1";
    delete process.env.SUPABASE_URL;
    expect(isWebhookWhatsappLocalDevRuntime()).toBe(true);
    expect(resolveTwilioVerifySkipMode()).toEqual({ mode: "skip_allowed" });
  });

  it("returns skip_forbidden when skip is on and runtime looks deployed", () => {
    process.env.TWILIO_WEBHOOK_VERIFY_SKIP = "true";
    process.env.SUPABASE_URL = "https://abc123.supabase.co";
    expect(resolveTwilioVerifySkipMode()).toEqual({ mode: "skip_forbidden" });
  });
});

describe("isFormUrlEncodedContentType", () => {
  it("accepts application/x-www-form-urlencoded", () => {
    expect(
      isFormUrlEncodedContentType("application/x-www-form-urlencoded; charset=utf-8"),
    ).toBe(true);
  });
  it("treats JSON as not form", () => {
    expect(isFormUrlEncodedContentType("application/json")).toBe(false);
  });
});

describe("maskPhoneForLog", () => {
  it("does not return the full raw number for E.164", () => {
    const full = "+15551234567";
    const m = maskPhoneForLog(full);
    expect(m).not.toContain("5551234567");
    expect(m).toContain("4567");
  });
});

describe("maskIdentifierForLog", () => {
  it("does not return a full photographer UUID", () => {
    const id = "a0eebc99-9c0b-4ef8-bb6b-6bb9ec380b11";
    const m = maskIdentifierForLog(id);
    expect(m).not.toBe(id);
    expect(m.length).toBeLessThan(id.length);
  });
});
