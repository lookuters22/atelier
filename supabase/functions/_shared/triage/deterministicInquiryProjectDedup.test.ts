import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildWeddingEmailGraph,
  computeDeterministicInquiryDedup,
  extractLocationTokens,
  extractNameTokens,
  parseNumericDatesFromText,
  runDeterministicInquiryProjectDedup,
  scoreDateProximity,
  type DedupWeddingSnapshot,
} from "./deterministicInquiryProjectDedup.ts";
import { deriveEmailIngressRouting, type MatchmakerStepResult } from "./emailIngressClassification.ts";

function emailMap(entries: [string, string[]][]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const [wid, emails] of entries) {
    m.set(wid, new Set(emails));
  }
  return m;
}

function displayMap(entries: [string, string[]][]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const [wid, names] of entries) {
    m.set(wid, names);
  }
  return m;
}

const baseW = (id: string, overrides: Partial<DedupWeddingSnapshot> = {}): DedupWeddingSnapshot => ({
  id,
  couple_names: "",
  wedding_date: null,
  location: "",
  project_type: "wedding",
  event_start_date: null,
  event_end_date: null,
  ...overrides,
});

beforeAll(() => {
  (globalThis as unknown as { Deno?: { env: { get: (k: string) => string | undefined } } }).Deno = {
    env: {
      get: (k: string) => {
        if (k === "TRIAGE_BOUNDED_UNRESOLVED_EMAIL_MATCH_APPROVAL_ESCALATION_V1") return "1";
        return undefined;
      },
    },
  };
});

describe("computeDeterministicInquiryDedup", () => {
  it("auto-links when sender email uniquely matches project contact graph", () => {
    const w1 = baseW("w1", { couple_names: "Any" });
    const out = computeDeterministicInquiryDedup({
      normalizedSender: "planner@agency.com",
      subject: "Re: quote",
      body: "Following up",
      weddings: [w1],
      weddingIdToEmails: emailMap([["w1", ["planner@agency.com"]]]),
      weddingIdToDisplayNames: new Map(),
    });
    expect(out.kind).toBe("auto");
    if (out.kind === "auto") {
      expect(out.weddingId).toBe("w1");
      expect(out.score).toBeGreaterThanOrEqual(90);
      expect(out.signals).toContain("sender_email_on_project");
    }
  });

  it("P17: Gmail alias sender auto-links when graph holds dot-local variant on project", () => {
    const w1 = baseW("w1", { couple_names: "Jane & Partner" });
    const out = computeDeterministicInquiryDedup({
      normalizedSender: "janedoe+planner@gmail.com",
      subject: "Re: timeline",
      body: "Following up",
      weddings: [w1],
      weddingIdToEmails: emailMap([["w1", ["jane.doe@gmail.com"]]]),
      weddingIdToDisplayNames: new Map(),
    });
    expect(out.kind).toBe("auto");
    if (out.kind === "auto") {
      expect(out.weddingId).toBe("w1");
      expect(out.signals).toContain("sender_email_on_project");
    }
  });

  it("near-match escalation when sender email matches multiple projects", () => {
    const w1 = baseW("w1");
    const w2 = baseW("w2");
    const out = computeDeterministicInquiryDedup({
      normalizedSender: "shared@client.com",
      subject: "Hello",
      body: "Hi",
      weddings: [w1, w2],
      weddingIdToEmails: emailMap([
        ["w1", ["shared@client.com"]],
        ["w2", ["shared@client.com"]],
      ]),
      weddingIdToDisplayNames: new Map(),
    });
    expect(out.kind).toBe("near_match");
    if (out.kind === "near_match") {
      expect(out.score).toBeGreaterThanOrEqual(75);
      expect(out.score).toBeLessThan(90);
      expect(out.signals).toContain("sender_email_multi_project");
    }
  });

  it("commercial-style project: strong name + location + date → auto", () => {
    const w1 = baseW("proj-commercial", {
      couple_names: "Nike Summer Retail Film",
      location: "Portland OR Studio Lot",
      project_type: "commercial",
      wedding_date: "2026-08-20",
    });
    const subject = "Nike shoot schedule";
    const body =
      "Confirming 2026-08-20 at Portland OR Studio Lot for the Nike Summer Retail Film — call sheet attached.";
    const out = computeDeterministicInquiryDedup({
      normalizedSender: "",
      subject,
      body,
      weddings: [w1],
      weddingIdToEmails: new Map(),
      weddingIdToDisplayNames: new Map(),
    });
    expect(out.kind).toBe("auto");
    if (out.kind === "auto") {
      expect(out.signals.some((s) => s.startsWith("project_type_"))).toBe(true);
    }
  });

  it("returns no_match when signals are weak", () => {
    const w1 = baseW("w1", {
      couple_names: "Zara & Quinn",
      location: "Remote",
      wedding_date: "2027-01-01",
    });
    const out = computeDeterministicInquiryDedup({
      normalizedSender: "stranger@x.com",
      subject: "Hello",
      body: "Just saying hi — no details.",
      weddings: [w1],
      weddingIdToEmails: new Map(),
      weddingIdToDisplayNames: new Map(),
    });
    expect(out.kind).toBe("no_match");
  });

  it("near-match for partial text alignment (no email)", () => {
    const w1 = baseW("vid-1", {
      couple_names: "Hudson Valley Documentary Series",
      location: "Kingston NY Riverfront",
      project_type: "video",
      wedding_date: null,
    });
    const out = computeDeterministicInquiryDedup({
      normalizedSender: "",
      subject: "Hudson Valley Documentary Series — Kingston",
      body:
        "We're finalizing the riverfront b-roll schedule in Kingston NY for the Hudson Valley Documentary Series piece.",
      weddings: [w1],
      weddingIdToEmails: new Map(),
      weddingIdToDisplayNames: new Map(),
    });
    expect(out.kind).toBe("near_match");
    if (out.kind === "near_match") {
      expect(out.score).toBeGreaterThanOrEqual(75);
      expect(out.score).toBeLessThan(90);
    }
  });
});

describe("pure helpers", () => {
  it("extractNameTokens splits couple and display names", () => {
    const toks = extractNameTokens("Maria Luisa & José", ["Planner Pat"]);
    expect(toks).toContain("maria");
    expect(toks).toContain("luisa");
    expect(toks).toContain("josé");
    expect(toks).toContain("planner");
    expect(toks).toContain("pat");
  });

  it("parseNumericDatesFromText finds ISO and slash dates", () => {
    const d = parseNumericDatesFromText("prep for 2026-06-15 and 6/20/2026");
    expect(d.length).toBeGreaterThanOrEqual(2);
  });

  it("scoreDateProximity within 7 days", () => {
    const hay = parseNumericDatesFromText("event 2026-03-10");
    const { score, matched } = scoreDateProximity(hay, "2026-03-12", null, null);
    expect(matched).toBe(true);
    expect(score).toBeGreaterThan(0);
  });

  it("extractLocationTokens ignores short noise", () => {
    const t = extractLocationTokens("NY, Austin, St");
    expect(t).toContain("austin");
    expect(t.some((x) => x === "st")).toBe(false);
  });
});

describe("deriveEmailIngressRouting + deterministic near-match", () => {
  it("allows nearMatchForApproval on intake when bounded LLM subset is ineligible", () => {
    const matchResult: MatchmakerStepResult = {
      weddingId: null,
      match: {
        suggested_wedding_id: "w-cand",
        confidence_score: 80,
        reasoning: "deterministic_inquiry_dedup: partial",
      },
      matchmaker_invoked: true,
      matchmaker_skip_reason: "deterministic_inquiry_dedup_near_match",
    };

    const out = deriveEmailIngressRouting({
      identity: { weddingId: null, photographerId: "p1", projectStage: null },
      llmIntent: "intake",
      stageGateIntent: "intake",
      matchResult,
      payloadPhotographerId: "p1",
      boundedUnresolvedSubsetEligible: false,
      derivePolicy: "legacy",
    });

    expect(out.nearMatchForApproval).toBe(true);
    expect(out.finalWeddingId).toBeNull();
    expect(out.matchCandidateId).toBe("w-cand");
  });
});

type GraphResolve = { data: unknown; error: { message: string } | null };

function mockSupabaseForGraph(tables: Record<string, GraphResolve>): SupabaseClient {
  return {
    from(table: string) {
      const res = tables[table] ?? { data: [], error: null };
      if (table === "clients") {
        return {
          select: () => ({
            in: () => ({
              not: () => Promise.resolve(res),
            }),
          }),
        };
      }
      if (table === "wedding_people" || table === "people") {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve(res),
            }),
          }),
        };
      }
      if (table === "contact_points") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => Promise.resolve(res),
              }),
            }),
          }),
        };
      }
      if (table === "weddings") {
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                neq: () => ({
                  order: () => ({
                    limit: () => Promise.resolve(res),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unmocked table: ${table}`);
    },
  } as unknown as SupabaseClient;
}

const weddingRow = {
  id: "w-graph-1",
  couple_names: "Test",
  wedding_date: null as string | null,
  location: "",
  stage: "inquiry",
  project_type: "wedding",
  event_start_date: null as string | null,
  event_end_date: null as string | null,
};

describe("buildWeddingEmailGraph fail-closed", () => {
  it("returns ok: false when clients read errors", async () => {
    const supabase = mockSupabaseForGraph({
      clients: { data: null, error: { message: "clients read failed" } },
    });
    const out = await buildWeddingEmailGraph(supabase, {
      photographerId: "p1",
      weddingIds: ["w1"],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("clients:");
  });

  it("returns ok: false when wedding_people read errors", async () => {
    const supabase = mockSupabaseForGraph({
      clients: { data: [{ wedding_id: "w1", email: "a@b.com" }], error: null },
      wedding_people: { data: null, error: { message: "wp failed" } },
    });
    const out = await buildWeddingEmailGraph(supabase, {
      photographerId: "p1",
      weddingIds: ["w1"],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("wedding_people:");
  });

  it("returns ok: false when people read errors", async () => {
    const supabase = mockSupabaseForGraph({
      clients: { data: [], error: null },
      wedding_people: {
        data: [{ wedding_id: "w1", person_id: "per-1" }],
        error: null,
      },
      people: { data: null, error: { message: "people failed" } },
    });
    const out = await buildWeddingEmailGraph(supabase, {
      photographerId: "p1",
      weddingIds: ["w1"],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("people:");
  });

  it("returns ok: false when contact_points read errors", async () => {
    const supabase = mockSupabaseForGraph({
      clients: { data: [], error: null },
      wedding_people: {
        data: [{ wedding_id: "w1", person_id: "per-1" }],
        error: null,
      },
      people: { data: [{ id: "per-1", display_name: null }], error: null },
      contact_points: { data: null, error: { message: "cp failed" } },
    });
    const out = await buildWeddingEmailGraph(supabase, {
      photographerId: "p1",
      weddingIds: ["w1"],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("contact_points:");
  });

  it("returns ok: true on happy path with empty person graph", async () => {
    const supabase = mockSupabaseForGraph({
      clients: { data: [], error: null },
      wedding_people: { data: [], error: null },
    });
    const out = await buildWeddingEmailGraph(supabase, {
      photographerId: "p1",
      weddingIds: ["w1"],
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.graph.weddingIdToEmails.size).toBe(0);
  });
});

describe("runDeterministicInquiryProjectDedup graph integration", () => {
  it("skips when graph build fails", async () => {
    const supabase = mockSupabaseForGraph({
      weddings: { data: [weddingRow], error: null },
      clients: { data: null, error: { message: "boom" } },
    });
    const out = await runDeterministicInquiryProjectDedup(supabase, {
      photographerId: "p1",
      senderEmail: "x@y.com",
      subject: "",
      body: "",
    });
    expect(out.kind).toBe("skipped");
  });

  it("runs compute path when graph succeeds", async () => {
    const supabase = mockSupabaseForGraph({
      weddings: { data: [weddingRow], error: null },
      clients: { data: [], error: null },
      wedding_people: { data: [], error: null },
    });
    const out = await runDeterministicInquiryProjectDedup(supabase, {
      photographerId: "p1",
      senderEmail: "solo@tenant.com",
      subject: "",
      body: "",
    });
    expect(out.kind).toBe("no_match");
  });
});
