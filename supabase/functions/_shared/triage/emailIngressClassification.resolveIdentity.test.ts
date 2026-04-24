import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  escapeIlikeExactPattern,
  resolveDeterministicIdentity,
} from "./emailIngressClassification.ts";

type Resolve = { data: unknown; error: { message: string } | null };

function clientsLookupChain(result: Resolve) {
  return {
    select: () => ({
      ilike: () => ({
        eq: () => ({
          limit: () => Promise.resolve(result),
        }),
      }),
    }),
  };
}

function mockSupabaseClientsOnly(result: Resolve): SupabaseClient {
  return {
    from(table: string) {
      if (table !== "clients") {
        throw new Error(`unexpected table: ${table}`);
      }
      return clientsLookupChain(result);
    },
  } as unknown as SupabaseClient;
}

function mockSupabaseCapturingIlike(result: Resolve): SupabaseClient & { getLastIlikePattern: () => string | null } {
  let lastIlikePattern: string | null = null;
  const api = {
    from(table: string) {
      if (table !== "clients") {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select: () => ({
          ilike: (_col: string, pattern: string) => {
            lastIlikePattern = pattern;
            return {
              eq: () => ({
                limit: () => Promise.resolve(result),
              }),
            };
          },
        }),
      };
    },
    getLastIlikePattern: () => lastIlikePattern,
  };
  return api as unknown as SupabaseClient & { getLastIlikePattern: () => string | null };
}

describe("resolveDeterministicIdentity (tenant-safe)", () => {
  it("does not resolve wedding when payloadPhotographerId is null (cannot tenant-scope)", async () => {
    let clientsQueried = false;
    const supabase = {
      from(table: string) {
        if (table === "clients") clientsQueried = true;
        return clientsLookupChain({ data: [], error: null });
      },
    } as unknown as SupabaseClient;

    const out = await resolveDeterministicIdentity(supabase, {
      sender: "lead@brand.com",
      payloadPhotographerId: null,
    });

    expect(clientsQueried).toBe(false);
    expect(out.weddingId).toBeNull();
    expect(out.photographerId).toBeNull();
    expect(out.projectStage).toBeNull();
  });

  it("scopes client match to payload tenant — other tenant row must not appear as a match", async () => {
    const supabase = mockSupabaseClientsOnly({
      data: [],
      error: null,
    });

    const out = await resolveDeterministicIdentity(supabase, {
      sender: "shared@example.com",
      payloadPhotographerId: "photographer-tenant-a",
    });

    expect(out.weddingId).toBeNull();
    expect(out.photographerId).toBe("photographer-tenant-a");
    expect(out.projectStage).toBeNull();
  });

  it("resolves when sender matches a client row for a wedding owned by the payload tenant", async () => {
    const supabase = mockSupabaseClientsOnly({
      data: [
        {
          wedding_id: "w-tenant-a-1",
          weddings: { photographer_id: "photographer-tenant-a", stage: "inquiry" },
        },
      ],
      error: null,
    });

    const out = await resolveDeterministicIdentity(supabase, {
      sender: "Shared@Example.com",
      payloadPhotographerId: "photographer-tenant-a",
    });

    expect(out.weddingId).toBe("w-tenant-a-1");
    expect(out.photographerId).toBe("photographer-tenant-a");
    expect(out.projectStage).toBe("inquiry");
  });

  it("fails closed on query error (no wedding id)", async () => {
    const supabase = mockSupabaseClientsOnly({
      data: null,
      error: { message: "rpc failed" },
    });

    const out = await resolveDeterministicIdentity(supabase, {
      sender: "x@y.com",
      payloadPhotographerId: "photographer-1",
    });

    expect(out.weddingId).toBeNull();
    expect(out.photographerId).toBe("photographer-1");
  });

  it("does not pick a wedding when the same email maps to multiple projects in-tenant", async () => {
    const supabase = mockSupabaseClientsOnly({
      data: [
        {
          wedding_id: "w-1",
          weddings: { photographer_id: "p1", stage: "inquiry" },
        },
        {
          wedding_id: "w-2",
          weddings: { photographer_id: "p1", stage: "booked" },
        },
      ],
      error: null,
    });

    const out = await resolveDeterministicIdentity(supabase, {
      sender: "dup@example.com",
      payloadPhotographerId: "p1",
    });

    expect(out.weddingId).toBeNull();
    expect(out.photographerId).toBe("p1");
  });

  it("uses ilike pattern with escaped underscore (no single-char wildcard)", async () => {
    const mock = mockSupabaseCapturingIlike({
      data: [
        {
          wedding_id: "w-underscore",
          weddings: { photographer_id: "p1", stage: "inquiry" },
        },
      ],
      error: null,
    });

    await resolveDeterministicIdentity(mock, {
      sender: "a_b@example.com",
      payloadPhotographerId: "p1",
    });

    expect(mock.getLastIlikePattern()).toBe("a\\_b@example.com");
  });

  it("uses ilike pattern with escaped percent (no sequence wildcard)", async () => {
    const mock = mockSupabaseCapturingIlike({
      data: [
        {
          wedding_id: "w-pct",
          weddings: { photographer_id: "p1", stage: "inquiry" },
        },
      ],
      error: null,
    });

    await resolveDeterministicIdentity(mock, {
      sender: "foo%bar@example.com",
      payloadPhotographerId: "p1",
    });

    expect(mock.getLastIlikePattern()).toBe("foo\\%bar@example.com");
  });

  it("P17: Gmail widen path resolves when parallel ilike misses dot-local client row", async () => {
    const supabase = {
      from(table: string) {
        if (table === "weddings") {
          return {
            select: () => ({
              eq: () => ({
                limit: () => Promise.resolve({ data: [{ id: "w-gmail-alias" }], error: null }),
              }),
            }),
          };
        }
        if (table === "clients") {
          return {
            select: () => ({
              ilike: () => ({
                eq: () => ({
                  limit: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
              in: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [
                      {
                        email: "jane.doe@gmail.com",
                        wedding_id: "w-gmail-alias",
                        weddings: { photographer_id: "photographer-tenant-a", stage: "inquiry" },
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const out = await resolveDeterministicIdentity(supabase, {
      sender: "janedoe+planner@gmail.com",
      payloadPhotographerId: "photographer-tenant-a",
    });

    expect(out.weddingId).toBe("w-gmail-alias");
    expect(out.photographerId).toBe("photographer-tenant-a");
    expect(out.projectStage).toBe("inquiry");
  });

  it("mixed-case sender still resolves; ilike pattern is normalized without extra escapes", async () => {
    const mock = mockSupabaseCapturingIlike({
      data: [
        {
          wedding_id: "w-mix",
          weddings: { photographer_id: "p1", stage: "booked" },
        },
      ],
      error: null,
    });

    const out = await resolveDeterministicIdentity(mock, {
      sender: "Mixed.Case+tag@Example.COM",
      payloadPhotographerId: "p1",
    });

    expect(mock.getLastIlikePattern()).toBe("mixed.case+tag@example.com");
    expect(out.weddingId).toBe("w-mix");
    expect(out.projectStage).toBe("booked");
  });

  it("email ingress v1: RFC5322-style From still uses bare address for ilike client lookup", async () => {
    const mock = mockSupabaseCapturingIlike({
      data: [
        {
          wedding_id: "w-dn",
          weddings: { photographer_id: "p1", stage: "inquiry" },
        },
      ],
      error: null,
    });

    await resolveDeterministicIdentity(mock, {
      sender: 'Jane Client <shared@example.com>',
      payloadPhotographerId: "p1",
    });

    expect(mock.getLastIlikePattern()).toBe("shared@example.com");
  });

  it("email ingress v1: no-reply From uses Reply-To for tenant-scoped client resolution", async () => {
    const supabase = mockSupabaseClientsOnly({
      data: [
        {
          wedding_id: "w-replyto",
          weddings: { photographer_id: "p1", stage: "prep" },
        },
      ],
      error: null,
    });

    const out = await resolveDeterministicIdentity(supabase, {
      sender: "Venue Bot <noreply@venue.example>",
      replyToForIdentity: "Couple <couple@example.com>",
      payloadPhotographerId: "p1",
    });

    expect(out.weddingId).toBe("w-replyto");
    expect(out.projectStage).toBe("prep");
  });
});

describe("escapeIlikeExactPattern", () => {
  it("escapes backslash before percent and underscore", () => {
    expect(escapeIlikeExactPattern(`a\\b_c%d`)).toBe(`a\\\\b\\_c\\%d`);
  });
});
