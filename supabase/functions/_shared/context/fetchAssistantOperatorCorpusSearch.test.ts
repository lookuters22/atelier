import { describe, expect, it } from "vitest";
import { fetchAssistantOperatorCorpusSearch } from "./fetchAssistantOperatorCorpusSearch.ts";
import { IDLE_ASSISTANT_STUDIO_INVOICE_SETUP } from "../../../../src/types/assistantContext.types.ts";
import type { EffectivePlaybookRule } from "../../../../src/types/decisionContext.types.ts";
import type { AuthorizedCaseExceptionRow } from "../../../../src/types/decisionContext.types.ts";

type ThenResult = { data: unknown[]; error: { message: string } | null };

type CorpusMock = {
  /** Pop one result per `v_threads_inbox_latest_message` query (title → sender → body per token). */
  inbox?: ThenResult[];
  weddings?: ThenResult[];
  memories?: ThenResult[];
  offers?: ThenResult[];
  messages?: ThenResult[];
  threads?: ThenResult[];
  /** Captured filters for assertions */
  captures?: {
    inboxNeq: Array<[string, unknown]>;
    inboxIlike: Array<[string, string]>;
    inboxLimits: number[];
    weddingLimits: number[];
    memoryLimits: number[];
    offerLimits: number[];
    messageLimits: number[];
  };
};

function playbookRule(partial: Partial<EffectivePlaybookRule> & { id: string }): EffectivePlaybookRule {
  return {
    id: partial.id,
    action_key: partial.action_key ?? "wedding_payment",
    topic: partial.topic ?? "Payments",
    decision_mode: partial.decision_mode ?? "suggest",
    scope: partial.scope ?? "global",
    channel: partial.channel ?? "email",
    instruction: partial.instruction ?? "Collect deposit before booking.",
    source_type: partial.source_type ?? "manual",
    confidence_label: partial.confidence_label ?? "high",
    is_active: partial.is_active ?? true,
    effectiveDecisionSource: partial.effectiveDecisionSource ?? "playbook",
    appliedAuthorizedExceptionId: partial.appliedAuthorizedExceptionId ?? null,
  };
}

function makeCorpusSupabase(mock: CorpusMock): typeof import("npm:@supabase/supabase-js@2").SupabaseClient {
  const inboxQ = [...(mock.inbox ?? [])];
  const weddingsQ = [...(mock.weddings ?? [])];
  const memoriesQ = [...(mock.memories ?? [])];
  const offersQ = [...(mock.offers ?? [])];
  const messagesQ = [...(mock.messages ?? [])];
  const threadsQ = [...(mock.threads ?? [])];
  const cap = mock.captures ?? {
    inboxNeq: [],
    inboxIlike: [],
    inboxLimits: [],
    weddingLimits: [],
    memoryLimits: [],
    offerLimits: [],
    messageLimits: [],
  };
  mock.captures = cap;

  const pop = (q: ThenResult[]): ThenResult =>
    q.length > 0 ? q.shift()! : { data: [], error: null };

  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.neq = (col: string, val: unknown) => {
        if (table === "v_threads_inbox_latest_message") cap.inboxNeq.push([col, val]);
        return chain;
      };
      chain.is = () => chain;
      chain.ilike = (col: string, pat: string) => {
        if (table === "v_threads_inbox_latest_message") cap.inboxIlike.push([col, pat]);
        return chain;
      };
      chain.or = () => chain;
      chain.order = () => chain;
      chain.limit = (n: number) => {
        if (table === "v_threads_inbox_latest_message") cap.inboxLimits.push(n);
        if (table === "weddings") cap.weddingLimits.push(n);
        if (table === "memories") cap.memoryLimits.push(n);
        if (table === "studio_offer_builder_projects") cap.offerLimits.push(n);
        if (table === "messages") cap.messageLimits.push(n);
        return chain;
      };
      chain.in = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => {
        if (table === "v_threads_inbox_latest_message") return resolve(pop(inboxQ));
        if (table === "weddings") return resolve(pop(weddingsQ));
        if (table === "memories") return resolve(pop(memoriesQ));
        if (table === "studio_offer_builder_projects") return resolve(pop(offersQ));
        if (table === "messages") return resolve(pop(messagesQ));
        if (table === "threads") return resolve(pop(threadsQ));
        return resolve({ data: [], error: null });
      };
      return chain;
    },
  } as never;
}

const baseInput = {
  playbookRules: [] as EffectivePlaybookRule[],
  authorizedCaseExceptions: [] as AuthorizedCaseExceptionRow[],
  studioInvoiceSetup: IDLE_ASSISTANT_STUDIO_INVOICE_SETUP,
};

const inboxRow = (o: {
  id: string;
  title?: string;
  wedding_id?: string | null;
  last_activity_at?: string;
  kind?: string;
  latest_sender?: string | null;
  latest_body?: string | null;
}) => ({
  id: o.id,
  title: o.title ?? "T",
  wedding_id: o.wedding_id ?? null,
  last_activity_at: o.last_activity_at ?? "2025-01-02T00:00:00.000Z",
  kind: o.kind ?? "client",
  latest_sender: o.latest_sender ?? null,
  latest_body: o.latest_body ?? null,
});

describe("fetchAssistantOperatorCorpusSearch", () => {
  it("returns early with scope note when stopword-only input yields no tokens", async () => {
    const mock: CorpusMock = {};
    const s = makeCorpusSupabase(mock);
    const r = await fetchAssistantOperatorCorpusSearch(s, "photo-1", {
      ...baseInput,
      queryText: "please find the thread about rules",
      deepCorpusSearch: false,
    });
    expect(r.didRun).toBe(true);
    expect(r.tokensQueried).toEqual([]);
    expect(r.scopeNote).toBe("no substantive tokens after stopword filter");
    expect(r.threadHits).toEqual([]);
    expect(r.messageBodyProbeRan).toBe(false);
    expect(mock.captures!.inboxLimits).toHaveLength(0);
  });

  it("applies kind != other on inbox view and wraps ilike patterns without inner wildcards", async () => {
    const mock: CorpusMock = {
      inbox: [
        { data: [inboxRow({ id: "t1", title: "Acme deposit" })], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ],
      weddings: [{ data: [], error: null }],
      memories: [{ data: [], error: null }],
      offers: [{ data: [], error: null }],
      threads: [
        {
          data: [
            {
              id: "t1",
              title: "Acme deposit",
              wedding_id: "w1",
              channel: "email",
              kind: "client",
              last_activity_at: "2025-01-02T00:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
    };
    const s = makeCorpusSupabase(mock);
    const r = await fetchAssistantOperatorCorpusSearch(s, "photo-1", {
      ...baseInput,
      queryText: "find anything about acme in messages",
      deepCorpusSearch: false,
    });
    expect(mock.captures!.inboxNeq).toEqual([["kind", "other"], ["kind", "other"], ["kind", "other"]]);
    const ilikes = mock.captures!.inboxIlike;
    expect(ilikes.map(([c]) => c)).toEqual(["title", "latest_sender", "latest_body"]);
    for (const [, pat] of ilikes) {
      expect(pat.startsWith("%")).toBe(true);
      expect(pat.endsWith("%")).toBe(true);
      expect(pat.slice(1, -1)).not.toMatch(/[%_]/);
    }
    expect(r.threadHits.some((h) => h.threadId === "t1" && h.matchedOn === "title")).toBe(true);
  });

  it("sets snippet for latest_sender and latest_body_snippet inbox matches", async () => {
    const mock: CorpusMock = {
      inbox: [
        { data: [], error: null },
        {
          data: [
            inboxRow({
              id: "t-s",
              title: "Subj",
              latest_sender: "Acme Photography",
              latest_body: null,
            }),
          ],
          error: null,
        },
        {
          data: [
            inboxRow({
              id: "t-b",
              title: "Subj2",
              latest_sender: null,
              latest_body: "Please confirm the deposit today",
            }),
          ],
          error: null,
        },
      ],
      weddings: [{ data: [], error: null }],
      memories: [{ data: [], error: null }],
      offers: [{ data: [], error: null }],
      threads: [
        {
          data: [
            {
              id: "t-s",
              title: "Subj",
              wedding_id: null,
              channel: "email",
              kind: "client",
              last_activity_at: "2025-01-02T00:00:00.000Z",
            },
            {
              id: "t-b",
              title: "Subj2",
              wedding_id: null,
              channel: "email",
              kind: "client",
              last_activity_at: "2025-01-02T00:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
    };
    const s = makeCorpusSupabase(mock);
    const r = await fetchAssistantOperatorCorpusSearch(s, "photo-1", {
      ...baseInput,
      queryText: "find acme deposit thread",
      deepCorpusSearch: false,
    });
    const senderHit = r.threadHits.find((h) => h.threadId === "t-s");
    const bodyHit = r.threadHits.find((h) => h.threadId === "t-b");
    expect(senderHit?.matchedOn).toBe("latest_sender");
    expect(senderHit?.snippet).toContain("Acme");
    expect(bodyHit?.matchedOn).toBe("latest_body_snippet");
    expect(bodyHit?.snippet).toContain("deposit");
  });

  it("redacts sensitive tokens in latest_body snippets for model-facing corpus hits", async () => {
    const mock: CorpusMock = {
      inbox: [
        { data: [], error: null },
        { data: [], error: null },
        {
          data: [
            inboxRow({
              id: "t-pii",
              title: "Invoice fix",
              latest_sender: null,
              latest_body: "Corrected passport line Passport no XK1234567 and IBAN DE89370400440532013000",
            }),
          ],
          error: null,
        },
      ],
      weddings: [{ data: [], error: null }],
      memories: [{ data: [], error: null }],
      offers: [{ data: [], error: null }],
      threads: [
        {
          data: [
            {
              id: "t-pii",
              title: "Invoice fix",
              wedding_id: null,
              channel: "email",
              kind: "client",
              last_activity_at: "2025-01-02T00:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
    };
    const s = makeCorpusSupabase(mock);
    const r = await fetchAssistantOperatorCorpusSearch(s, "photo-1", {
      ...baseInput,
      queryText: "passport",
      deepCorpusSearch: false,
    });
    const hit = r.threadHits.find((h) => h.threadId === "t-pii");
    expect(hit?.snippet).toBeTruthy();
    expect(hit?.snippet).toContain("[redacted: sensitive document or payment identifier]");
    expect(hit?.snippet).not.toMatch(/XK1234567/);
    expect(hit?.snippet).not.toMatch(/89370400440532013000/);
  });

  it("dedupes the same thread when multiple inbox columns would match", async () => {
    const row = inboxRow({ id: "t-dup", title: "X", latest_sender: "Acme Co", latest_body: "Hi" });
    const mock: CorpusMock = {
      inbox: [
        { data: [row], error: null },
        { data: [row], error: null },
        { data: [], error: null },
      ],
      weddings: [{ data: [], error: null }],
      memories: [{ data: [], error: null }],
      offers: [{ data: [], error: null }],
      threads: [
        {
          data: [
            {
              id: "t-dup",
              title: "X",
              wedding_id: null,
              channel: "email",
              kind: "client",
              last_activity_at: "2025-01-01T00:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
    };
    const s = makeCorpusSupabase(mock);
    const r = await fetchAssistantOperatorCorpusSearch(s, "photo-1", {
      ...baseInput,
      queryText: "find acme thread",
      deepCorpusSearch: false,
    });
    expect(r.threadHits.filter((h) => h.threadId === "t-dup")).toHaveLength(1);
    expect(r.threadHits[0]!.matchedOn).toBe("title");
  });

  it("does not run message body probe for short queries", async () => {
    const mock: CorpusMock = {
      inbox: [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ],
      weddings: [{ data: [], error: null }],
      memories: [{ data: [], error: null }],
      offers: [{ data: [], error: null }],
      threads: [{ data: [], error: null }],
    };
    const s = makeCorpusSupabase(mock);
    const r = await fetchAssistantOperatorCorpusSearch(s, "photo-1", {
      ...baseInput,
      queryText: "find acme",
      deepCorpusSearch: false,
    });
    expect(r.messageBodyProbeRan).toBe(false);
    expect(mock.captures!.messageLimits).toHaveLength(0);
    expect(r.scopeNote).toContain("No **messages.body** table scan.");
  });

  it("runs message body probe when gated and merges probe-only threads", async () => {
    const mock: CorpusMock = {
      messages: [{ data: [{ thread_id: "t-probe" }], error: null }],
      inbox: [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ],
      weddings: [{ data: [], error: null }],
      memories: [{ data: [], error: null }],
      offers: [{ data: [], error: null }],
      threads: [
        {
          data: [
            {
              id: "t-probe",
              title: "Probe only",
              wedding_id: "w9",
              channel: "sms",
              kind: "client",
              last_activity_at: "2025-03-03T00:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
    };
    const s = makeCorpusSupabase(mock);
    const r = await fetchAssistantOperatorCorpusSearch(s, "photo-1", {
      ...baseInput,
      queryText: "find anything about deposit in messages",
      deepCorpusSearch: false,
    });
    expect(r.messageBodyProbeRan).toBe(true);
    expect(mock.captures!.messageLimits).toEqual([18]);
    const probeHit = r.threadHits.find((h) => h.threadId === "t-probe");
    expect(probeHit?.matchedOn).toBe("message_body_probe");
    expect(r.scopeNote).toContain("messages.body** ilike probe");
  });

  it("uses wider per-table limits in deep mode", async () => {
    const probeCue =
      "find anything about velvet in inbox"; /* whole-word `inbox` — `messages` does not match the probe regex */
    const mockNormal: CorpusMock = {
      messages: [{ data: [], error: null }],
      inbox: Array.from({ length: 3 }, () => ({ data: [], error: null })),
      weddings: [{ data: [], error: null }],
      memories: [{ data: [], error: null }],
      offers: [{ data: [], error: null }],
      threads: [{ data: [], error: null }],
    };
    const sN = makeCorpusSupabase(mockNormal);
    await fetchAssistantOperatorCorpusSearch(sN, "photo-1", {
      ...baseInput,
      queryText: probeCue,
      deepCorpusSearch: false,
    });
    expect(mockNormal.captures!.inboxLimits.every((x) => x === 14)).toBe(true);
    expect(mockNormal.captures!.messageLimits).toEqual([18]);

    const mockDeep: CorpusMock = {
      messages: [{ data: [], error: null }],
      inbox: Array.from({ length: 3 }, () => ({ data: [], error: null })),
      weddings: [{ data: [], error: null }],
      memories: [{ data: [], error: null }],
      offers: [{ data: [], error: null }],
      threads: [{ data: [], error: null }],
    };
    const sD = makeCorpusSupabase(mockDeep);
    await fetchAssistantOperatorCorpusSearch(sD, "photo-1", {
      ...baseInput,
      queryText: probeCue,
      deepCorpusSearch: true,
    });
    expect(mockDeep.captures!.inboxLimits.every((x) => x === 22)).toBe(true);
    expect(mockDeep.captures!.messageLimits).toEqual([28]);
  });

  it("sorts thread hits by lastActivityAt desc then threadId asc", async () => {
    const mock: CorpusMock = {
      inbox: [
        {
          data: [
            inboxRow({
              id: "t-b",
              title: "B",
              last_activity_at: "2025-01-01T00:00:00.000Z",
            }),
          ],
          error: null,
        },
        { data: [], error: null },
        { data: [], error: null },
        {
          data: [
            inboxRow({
              id: "t-a",
              title: "A",
              last_activity_at: "2025-02-02T00:00:00.000Z",
            }),
          ],
          error: null,
        },
        { data: [], error: null },
        { data: [], error: null },
      ],
      weddings: [{ data: [], error: null }, { data: [], error: null }],
      memories: [{ data: [], error: null }, { data: [], error: null }],
      offers: [{ data: [], error: null }, { data: [], error: null }],
      threads: [
        {
          data: [
            {
              id: "t-a",
              title: "A",
              wedding_id: null,
              channel: "email",
              kind: "client",
              last_activity_at: "2025-02-02T00:00:00.000Z",
            },
            {
              id: "t-b",
              title: "B",
              wedding_id: null,
              channel: "email",
              kind: "client",
              last_activity_at: "2025-01-01T00:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
    };
    const s = makeCorpusSupabase(mock);
    const r = await fetchAssistantOperatorCorpusSearch(s, "photo-1", {
      ...baseInput,
      queryText: "find velvet and acme thread",
      deepCorpusSearch: false,
    });
    expect(r.threadHits.map((h) => h.threadId)).toEqual(["t-a", "t-b"]);
  });

  it("matches playbook and case exception notes in memory with caps", async () => {
    const mock: CorpusMock = {
      inbox: Array.from({ length: 3 }, () => ({ data: [], error: null })),
      weddings: [{ data: [], error: null }],
      memories: [{ data: [], error: null }],
      offers: [{ data: [], error: null }],
      threads: [{ data: [], error: null }],
    };
    const s = makeCorpusSupabase(mock);
    const r = await fetchAssistantOperatorCorpusSearch(s, "photo-1", {
      ...baseInput,
      queryText: "find rule for net 30 terms",
      deepCorpusSearch: false,
      playbookRules: [
        playbookRule({
          id: "r1",
          topic: "Net terms",
          action_key: "commercial_net",
          instruction: "Offer net 30 for trusted clients.",
        }),
      ],
      authorizedCaseExceptions: [
        {
          id: "e1",
          photographer_id: "photo-1",
          wedding_id: "w1",
          thread_id: null,
          status: "approved",
          overrides_action_key: null,
          target_playbook_rule_id: null,
          override_payload: null,
          approved_by: null,
          approved_via_escalation_id: null,
          effective_from: null,
          effective_until: null,
          notes: "Exception: net 45 for Acme",
        },
      ],
    });
    expect(r.playbookHits.length).toBeGreaterThan(0);
    expect(r.playbookHits[0]!.ruleId).toBe("r1");
    expect(r.caseExceptionHits.some((h) => h.id === "e1")).toBe(true);
    expect(mock.captures!.memoryLimits.every((x) => x === 10)).toBe(true);
  });

  it("sets invoiceTemplateMentioned when template strings match a substantive token", async () => {
    const mock: CorpusMock = {
      inbox: Array.from({ length: 3 }, () => ({ data: [], error: null })),
      weddings: [{ data: [], error: null }],
      memories: [{ data: [], error: null }],
      offers: [{ data: [], error: null }],
      threads: [{ data: [], error: null }],
    };
    const s = makeCorpusSupabase(mock);
    const r = await fetchAssistantOperatorCorpusSearch(s, "photo-1", {
      ...baseInput,
      queryText: "find footer note about Globex legal name",
      deepCorpusSearch: false,
      studioInvoiceSetup: {
        ...IDLE_ASSISTANT_STUDIO_INVOICE_SETUP,
        hasRow: true,
        updatedAt: "2025-01-01T00:00:00.000Z",
        legalName: "Globex Photography LLC",
        invoicePrefix: "GX",
        paymentTerms: "Due on receipt",
        accentColor: "#000",
        footerNote: "Thank you",
        footerNoteTruncated: false,
        logo: IDLE_ASSISTANT_STUDIO_INVOICE_SETUP.logo,
        note: "",
      },
    });
    expect(r.invoiceTemplateMentioned).toBe(true);
  });

  it("skips SQL token rounds when sanitized token is too long (defensive ilike)", async () => {
    const long = "x".repeat(52);
    const mock: CorpusMock = {
      inbox: Array.from({ length: 3 }, () => ({ data: [], error: null })),
      weddings: [{ data: [], error: null }],
      memories: [{ data: [], error: null }],
      offers: [{ data: [], error: null }],
      threads: [{ data: [], error: null }],
    };
    const s = makeCorpusSupabase(mock);
    await fetchAssistantOperatorCorpusSearch(s, "photo-1", {
      ...baseInput,
      queryText: `find anything about ${long} in messages`,
      deepCorpusSearch: false,
    });
    expect(mock.captures!.inboxIlike).toHaveLength(0);
    expect(mock.captures!.weddingLimits).toHaveLength(0);
  });
});
