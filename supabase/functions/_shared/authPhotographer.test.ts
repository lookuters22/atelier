/* Edge functions use `Deno.env`; Vitest runs in Node — mirror `process.env` for env reads. */
if (typeof (globalThis as unknown as { Deno?: unknown }).Deno === "undefined") {
  (globalThis as unknown as { Deno: { env: { get: (k: string) => string | undefined } } }).Deno = {
    env: { get: (key: string) => process.env[key] },
  };
}

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { createClientMock, getUserMock, mockClient } = vi.hoisted(() => {
  const getUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  const client = { auth: { getUser } };
  return {
    getUserMock: getUser,
    createClientMock: vi.fn().mockReturnValue(client),
    mockClient: client,
  };
});

vi.mock("npm:@supabase/supabase-js@2", () => ({
  createClient: createClientMock,
}));

function saveEnv() {
  return {
    url: process.env.SUPABASE_URL,
    anon: process.env.SUPABASE_ANON_KEY,
  };
}

function restoreEnv(saved: { url: string | undefined; anon: string | undefined }) {
  if (saved.url === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = saved.url;
  if (saved.anon === undefined) delete process.env.SUPABASE_ANON_KEY;
  else process.env.SUPABASE_ANON_KEY = saved.anon;
}

describe("authPhotographer", () => {
  const envOk = { url: "https://x.supabase.co", anon: "test-anon-key" };

  beforeEach(() => {
    process.env.SUPABASE_URL = envOk.url;
    process.env.SUPABASE_ANON_KEY = envOk.anon;
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    createClientMock.mockClear();
    getUserMock.mockClear();
    vi.resetModules();
  });

  it("creates the anon client only once across multiple helper calls", async () => {
    const { requirePhotographerIdFromJwt, getPhotographerIdFromJwtIfPresent } = await import(
      "./authPhotographer.ts"
    );

    await requirePhotographerIdFromJwt(
      new Request("https://a", { headers: { Authorization: "Bearer first.jwt" } }),
    );
    await getPhotographerIdFromJwtIfPresent(
      new Request("https://a", { headers: { Authorization: "Bearer second.jwt" } }),
    );

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith(
      envOk.url,
      envOk.anon,
      expect.objectContaining({
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
  });

  it("requirePhotographerIdFromJwt passes the bearer token to auth.getUser and returns the user id", async () => {
    const { requirePhotographerIdFromJwt } = await import("./authPhotographer.ts");
    getUserMock.mockImplementationOnce((jwt: string) => {
      expect(jwt).toBe("my-access-token");
      return Promise.resolve({ data: { user: { id: "photo-9" } }, error: null });
    });

    const id = await requirePhotographerIdFromJwt(
      new Request("https://a", { headers: { Authorization: "Bearer my-access-token" } }),
    );

    expect(id).toBe("photo-9");
    expect(getUserMock).toHaveBeenCalledWith("my-access-token");
  });

  it("getPhotographerIdFromJwtIfPresent returns null without Authorization and does not call getUser", async () => {
    const { getPhotographerIdFromJwtIfPresent } = await import("./authPhotographer.ts");
    getUserMock.mockClear();

    const id = await getPhotographerIdFromJwtIfPresent(new Request("https://a"));

    expect(id).toBeNull();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("requirePhotographerIdFromJwt throws the existing env error when SUPABASE_URL is missing", async () => {
    const saved = saveEnv();
    try {
      delete process.env.SUPABASE_URL;
      vi.resetModules();
      const { requirePhotographerIdFromJwt } = await import("./authPhotographer.ts");
      await expect(
        requirePhotographerIdFromJwt(
          new Request("https://a", { headers: { Authorization: "Bearer t" } }),
        ),
      ).rejects.toThrow("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    } finally {
      restoreEnv(saved);
    }
  });

  it("requirePhotographerIdFromJwt throws Unauthorized when getUser returns no user", async () => {
    const { requirePhotographerIdFromJwt } = await import("./authPhotographer.ts");
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });

    await expect(
      requirePhotographerIdFromJwt(
        new Request("https://a", { headers: { Authorization: "Bearer bad" } }),
      ),
    ).rejects.toThrow("Unauthorized");
  });
});
