import { describe, expect, it } from "vitest";
import { fetchAssistantQueryEntityIndex } from "./fetchAssistantQueryEntityIndex.ts";
import {
  ENTITY_PEOPLE_INDEX_LIMIT,
  ENTITY_WEDDINGS_INDEX_LIMIT,
  resolveOperatorQueryEntitiesFromIndex,
} from "./resolveOperatorQueryEntitiesFromIndex.ts";

type QueueEntry = { data: unknown[]; error: { message: string } | null };

function makeSupabase(queues: {
  weddings?: QueueEntry[];
  people?: QueueEntry[];
}) {
  const weddingQ = queues.weddings ?? [];
  const peopleQ = queues.people ?? [];
  const pop = (q: QueueEntry[]): QueueEntry =>
    q.length > 0 ? q.shift()! : { data: [], error: null };

  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const recordOrder = (col: string, opts?: { ascending: boolean; nullsFirst?: boolean }) => {
        (chain as { _orders?: unknown[] })._orders = (chain as { _orders?: unknown[] })._orders ?? [];
        (chain as { _orders: unknown[] })._orders.push({ col, opts });
        return chain;
      };
      chain.select = () => chain;
      chain.eq = (_col: string, _val: unknown) => chain;
      chain.order = (col: string, opts?: { ascending: boolean; nullsFirst?: boolean }) =>
        recordOrder(col, opts);
      chain.limit = (n: number) => {
        (chain as { _limit?: number })._limit = n;
        return chain;
      };
      chain.then = (resolve: (v: unknown) => unknown) => {
        if (table === "weddings") {
          const entry = pop(weddingQ);
          expect((chain as { _limit?: number })._limit).toBe(ENTITY_WEDDINGS_INDEX_LIMIT);
          const orders = (chain as { _orders?: unknown[] })._orders ?? [];
          expect(orders).toEqual([
            { col: "wedding_date", opts: { ascending: false } },
            { col: "id", opts: { ascending: true } },
          ]);
          return resolve({ data: entry.data, error: entry.error });
        }
        if (table === "people") {
          const entry = pop(peopleQ);
          expect((chain as { _limit?: number })._limit).toBe(ENTITY_PEOPLE_INDEX_LIMIT);
          const orders = (chain as { _orders?: unknown[] })._orders ?? [];
          expect(orders).toEqual([
            { col: "display_name", opts: { ascending: true } },
            { col: "id", opts: { ascending: true } },
          ]);
          return resolve({ data: entry.data, error: entry.error });
        }
        return resolve({ data: [], error: null });
      };
      return chain;
    },
  } as never;
}

describe("fetchAssistantQueryEntityIndex", () => {
  it("maps wedding_date null to null and stringifies other fields", async () => {
    const s = makeSupabase({
      weddings: [
        {
          data: [
            {
              id: "w-1",
              couple_names: "A & B",
              location: "Como",
              stage: "inquiry",
              project_type: "wedding",
              wedding_date: null,
            },
            {
              id: "w-2",
              couple_names: "C",
              location: "",
              stage: "booked",
              project_type: "elopement",
              wedding_date: "2026-06-01",
            },
          ],
          error: null,
        },
      ],
      people: [
        {
          data: [{ id: "p-1", display_name: "Rita", kind: "client" }],
          error: null,
        },
      ],
    });
    const r = await fetchAssistantQueryEntityIndex(s, "photo-1");
    expect(r.weddings).toEqual([
      {
        id: "w-1",
        couple_names: "A & B",
        location: "Como",
        stage: "inquiry",
        project_type: "wedding",
        wedding_date: null,
      },
      {
        id: "w-2",
        couple_names: "C",
        location: "",
        stage: "booked",
        project_type: "elopement",
        wedding_date: "2026-06-01",
      },
    ]);
    expect(r.people).toEqual([{ id: "p-1", display_name: "Rita", kind: "client" }]);
  });

  it("preserves row order from each query (deterministic DB ordering contract)", async () => {
    const s = makeSupabase({
      weddings: [
        {
          data: [
            { id: "z", couple_names: "Z", location: "", stage: "", project_type: "", wedding_date: null },
            { id: "a", couple_names: "A", location: "", stage: "", project_type: "", wedding_date: null },
          ],
          error: null,
        },
      ],
      people: [
        {
          data: [
            { id: "2", display_name: "Beta", kind: "vendor" },
            { id: "1", display_name: "Alpha", kind: "client" },
          ],
          error: null,
        },
      ],
    });
    const r = await fetchAssistantQueryEntityIndex(s, "photo-1");
    expect(r.weddings.map((w) => w.id)).toEqual(["z", "a"]);
    expect(r.people.map((p) => p.id)).toEqual(["2", "1"]);
  });

  it("throws with weddings error message when weddings query fails", async () => {
    const s = makeSupabase({
      weddings: [{ data: [], error: { message: "rls denied" } }],
      people: [{ data: [], error: null }],
    });
    await expect(fetchAssistantQueryEntityIndex(s, "photo-1")).rejects.toThrow(
      "fetchAssistantQueryEntityIndex weddings: rls denied",
    );
  });

  it("throws with people error message when people query fails", async () => {
    const s = makeSupabase({
      weddings: [{ data: [], error: null }],
      people: [{ data: [], error: { message: "timeout" } }],
    });
    await expect(fetchAssistantQueryEntityIndex(s, "photo-1")).rejects.toThrow(
      "fetchAssistantQueryEntityIndex people: timeout",
    );
  });

  it("mapped rows work with resolveOperatorQueryEntitiesFromIndex (project + person)", async () => {
    const s = makeSupabase({
      weddings: [
        {
          data: [
            {
              id: "w-em",
              couple_names: "Elena & Marco",
              location: "Milan",
              stage: "inquiry",
              project_type: "wedding",
              wedding_date: null,
            },
          ],
          error: null,
        },
      ],
      people: [
        {
          data: [{ id: "p-rita", display_name: "Rita James", kind: "client" }],
          error: null,
        },
      ],
    });
    const index = await fetchAssistantQueryEntityIndex(s, "photo-1");
    const weddingRes = resolveOperatorQueryEntitiesFromIndex(
      "What is the inquiry for Elena and Marco?",
      index.weddings,
      [],
    );
    expect(weddingRes.weddingSignal).toBe("unique");
    expect(weddingRes.uniqueWeddingId).toBe("w-em");

    const personRes = resolveOperatorQueryEntitiesFromIndex("When did we email Rita James?", [], index.people);
    expect(personRes.personMatches).toEqual([
      { id: "p-rita", display_name: "Rita James", kind: "client" },
    ]);
  });

  it("downstream resolver can return ambiguous weddings from fetched index rows", async () => {
    const s = makeSupabase({
      weddings: [
        {
          data: [
            {
              id: "w1",
              couple_names: "A & A",
              location: "Villa, Como",
              stage: "inquiry",
              project_type: "wedding",
              wedding_date: null,
            },
            {
              id: "w2",
              couple_names: "B & B",
              location: "Hotel Como",
              stage: "inquiry",
              project_type: "wedding",
              wedding_date: null,
            },
          ],
          error: null,
        },
      ],
      people: [{ data: [], error: null }],
    });
    const index = await fetchAssistantQueryEntityIndex(s, "photo-1");
    const r = resolveOperatorQueryEntitiesFromIndex("What is the inquiry in Como?", index.weddings, []);
    expect(r.weddingSignal).toBe("ambiguous");
    expect(r.uniqueWeddingId).toBeNull();
    expect(r.weddingCandidates.length).toBeGreaterThanOrEqual(2);
  });

  it("normalizes missing id / text fields to empty strings", async () => {
    const s = makeSupabase({
      weddings: [
        {
          data: [{}],
          error: null,
        },
      ],
      people: [
        {
          data: [{ id: null, display_name: null, kind: undefined }],
          error: null,
        },
      ],
    });
    const r = await fetchAssistantQueryEntityIndex(s, "photo-1");
    expect(r.weddings[0]).toEqual({
      id: "",
      couple_names: "",
      location: "",
      stage: "",
      project_type: "",
      wedding_date: null,
    });
    expect(r.people[0]).toEqual({ id: "", display_name: "", kind: "" });
  });
});
