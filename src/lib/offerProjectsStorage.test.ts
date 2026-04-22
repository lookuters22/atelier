import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPuckData } from "./offerPuckNormalize";
import {
  __resetOfferProjectsAnonymousLegacyGuardForTests,
  OFFER_PROJECTS_ANONYMOUS_KEY,
  offerProjectsLocalStorageKey,
  type OfferProjectRecord,
} from "./offerProjectsLocal";

type RemoteRow = {
  id: string;
  photographer_id: string;
  name: string;
  puck_data: unknown;
  updated_at: string;
};

const sb = vi.hoisted(() => ({
  remoteRows: [] as RemoteRow[],
  upserts: [] as { table: string; payload: unknown }[],
  upsertAttempt: 0,
  failUpsertOnAttempt: null as number | null,
}));

function rowMatchesFilters(row: RemoteRow, filters: [string, string][]): boolean {
  const r = row as Record<string, unknown>;
  return filters.every(([c, v]) => String(r[c]) === v);
}

function createSelectChain() {
  const filters: [string, string][] = [];
  const chain: Record<string, unknown> = {};
  chain.eq = (col: string, val: string) => {
    filters.push([col, val]);
    return chain;
  };
  chain.order = () =>
    Promise.resolve({
      data: sb.remoteRows.filter((row) => rowMatchesFilters(row, filters)),
      error: null,
    });
  chain.maybeSingle = () => {
    const row = sb.remoteRows.find((r) => rowMatchesFilters(r, filters));
    return Promise.resolve({ data: row ?? null, error: null });
  };
  return chain;
}

function applyUpsertPayload(table: string, payload: unknown) {
  sb.upserts.push({ table, payload });
  sb.upsertAttempt += 1;
  if (sb.failUpsertOnAttempt !== null && sb.upsertAttempt === sb.failUpsertOnAttempt) {
    return Promise.resolve({ error: { message: "mock upsert failure" } });
  }
  const p = payload as {
    id: string;
    photographer_id: string;
    name: string;
    puck_data: unknown;
    updated_at: string;
  };
  const row: RemoteRow = {
    id: p.id,
    photographer_id: p.photographer_id,
    name: p.name,
    puck_data: p.puck_data,
    updated_at: p.updated_at,
  };
  const idx = sb.remoteRows.findIndex((r) => r.id === p.id);
  if (idx >= 0) sb.remoteRows[idx] = row;
  else sb.remoteRows.push(row);
  return Promise.resolve({ error: null });
}

function createFrom(table: string) {
  return {
    select: () => createSelectChain(),
    upsert: (payload: unknown) => applyUpsertPayload(table, payload),
    delete: () => ({
      eq: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  };
}

vi.mock("./supabase", () => ({
  supabase: {
    from: (t: string) => createFrom(t),
  },
}));

import {
  __resetOfferProjectsMigrationForTests,
  createOfferProject,
  listOfferProjects,
  OFFER_PROJECTS_MIGRATION_KEY_PREFIX,
} from "./offerProjectsStorage";

const PHOTO_A = "11111111-1111-1111-1111-111111111111";
const PHOTO_B = "22222222-2222-2222-2222-222222222222";

const localMem: Record<string, string> = {};

function migrationKey(photographerId: string): string {
  return `${OFFER_PROJECTS_MIGRATION_KEY_PREFIX}${photographerId}`;
}

function scopedKey(photographerId: string): string {
  return offerProjectsLocalStorageKey(photographerId);
}

describe("offerProjectsStorage", () => {
  beforeEach(() => {
    sb.remoteRows = [];
    sb.upserts = [];
    sb.upsertAttempt = 0;
    sb.failUpsertOnAttempt = null;
    Object.keys(localMem).forEach((k) => delete localMem[k]);
    globalThis.localStorage = {
      getItem: (k: string) => (k in localMem ? localMem[k] : null),
      setItem: (k: string, v: string) => {
        localMem[k] = v;
      },
      removeItem: (k: string) => {
        delete localMem[k];
      },
      clear: () => {
        Object.keys(localMem).forEach((k) => delete localMem[k]);
      },
      key: (i: number) => Object.keys(localMem)[i] ?? null,
      get length() {
        return Object.keys(localMem).length;
      },
    } as Storage;
    __resetOfferProjectsMigrationForTests();
    __resetOfferProjectsAnonymousLegacyGuardForTests();
  });

  it("listOfferProjects without session reads anonymous local projects only", async () => {
    const project: OfferProjectRecord = {
      id: "local-only",
      name: "Local",
      updatedAt: "2026-01-01T00:00:00.000Z",
      data: defaultPuckData(),
    };
    localStorage.setItem(OFFER_PROJECTS_ANONYMOUS_KEY, JSON.stringify({ projects: [project] }));

    const list = await listOfferProjects(null);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("local-only");
    expect(sb.upserts).toHaveLength(0);
    expect(localStorage.getItem(migrationKey(PHOTO_A))).toBeNull();
  });

  it("shared browser: photographer A scoped local drafts are not uploaded when B signs in", async () => {
    const aDraft: OfferProjectRecord = {
      id: "a-scoped-draft",
      name: "A secret",
      updatedAt: "2026-05-01T00:00:00.000Z",
      data: defaultPuckData(),
    };
    localStorage.setItem(scopedKey(PHOTO_A), JSON.stringify({ projects: [aDraft] }));

    await listOfferProjects(PHOTO_B);

    expect(sb.upserts).toHaveLength(0);
    const aParsed = JSON.parse(localStorage.getItem(scopedKey(PHOTO_A)) ?? "{}") as { projects: OfferProjectRecord[] };
    expect(aParsed.projects).toHaveLength(1);
    expect(aParsed.projects[0]?.id).toBe("a-scoped-draft");
  });

  it("anonymous bucket drafts are never reconciled into a photographer remote account", async () => {
    const anon: OfferProjectRecord = {
      id: "anon-only",
      name: "Logged out work",
      updatedAt: "2026-05-02T00:00:00.000Z",
      data: defaultPuckData(),
    };
    localStorage.setItem(OFFER_PROJECTS_ANONYMOUS_KEY, JSON.stringify({ projects: [anon] }));

    await listOfferProjects(PHOTO_B);

    expect(sb.upserts).toHaveLength(0);
    const anonParsed = JSON.parse(localStorage.getItem(OFFER_PROJECTS_ANONYMOUS_KEY) ?? "{}") as {
      projects: OfferProjectRecord[];
    };
    expect(anonParsed.projects).toHaveLength(1);
    expect(anonParsed.projects[0]?.id).toBe("anon-only");
  });

  it("migration flag is per photographer: A completed does not skip B reconciliation", async () => {
    localStorage.setItem(migrationKey(PHOTO_A), "1");

    const forB: OfferProjectRecord = {
      id: "b-local",
      name: "B only",
      updatedAt: "2026-04-01T00:00:00.000Z",
      data: defaultPuckData(),
    };
    localStorage.setItem(scopedKey(PHOTO_B), JSON.stringify({ projects: [forB] }));

    await listOfferProjects(PHOTO_B);

    expect(sb.upserts).toHaveLength(1);
    expect(sb.upserts[0]?.payload).toMatchObject({ id: "b-local", photographer_id: PHOTO_B });
    expect(localStorage.getItem(migrationKey(PHOTO_B))).toBe("1");
    expect(localStorage.getItem(migrationKey(PHOTO_A))).toBe("1");
  });

  it("remote non-empty + photographer-scoped local-only row: upserts then clears scoped store only", async () => {
    sb.remoteRows.push({
      id: "remote-1",
      photographer_id: PHOTO_A,
      name: "Server",
      puck_data: defaultPuckData(),
      updated_at: "2026-02-01T00:00:00.000Z",
    });
    const localOnly: OfferProjectRecord = {
      id: "local-only-offer",
      name: "Never uploaded",
      updatedAt: "2026-02-15T00:00:00.000Z",
      data: defaultPuckData(),
    };
    localStorage.setItem(scopedKey(PHOTO_A), JSON.stringify({ projects: [localOnly] }));

    const list = await listOfferProjects(PHOTO_A);

    expect(sb.upserts).toHaveLength(1);
    expect(sb.upserts[0]?.payload).toMatchObject({
      id: "local-only-offer",
      photographer_id: PHOTO_A,
      name: "Never uploaded",
    });
    const scopedParsed = JSON.parse(localStorage.getItem(scopedKey(PHOTO_A)) ?? "{}") as { projects: unknown[] };
    expect(scopedParsed.projects).toEqual([]);
    expect(list.map((p) => p.id).sort()).toEqual(["local-only-offer", "remote-1"].sort());
  });

  it("same id: local newer than remote is pushed; stale local is not pushed but scoped store still cleared after reconcile", async () => {
    sb.remoteRows.push({
      id: "shared-id",
      photographer_id: PHOTO_A,
      name: "Remote title",
      puck_data: defaultPuckData(),
      updated_at: "2026-03-01T00:00:00.000Z",
    });
    const staleLocal: OfferProjectRecord = {
      id: "shared-id",
      name: "Old local",
      updatedAt: "2026-02-01T00:00:00.000Z",
      data: defaultPuckData(),
    };
    localStorage.setItem(scopedKey(PHOTO_A), JSON.stringify({ projects: [staleLocal] }));

    await listOfferProjects(PHOTO_A);

    expect(sb.upserts).toHaveLength(0);
    const scopedParsed = JSON.parse(localStorage.getItem(scopedKey(PHOTO_A)) ?? "{}") as { projects: unknown[] };
    expect(scopedParsed.projects).toEqual([]);
    expect(localStorage.getItem(migrationKey(PHOTO_A))).toBe("1");
  });

  it("same id: local strictly newer than remote is upserted", async () => {
    sb.remoteRows.push({
      id: "shared-id",
      photographer_id: PHOTO_A,
      name: "Remote title",
      puck_data: defaultPuckData(),
      updated_at: "2026-02-01T00:00:00.000Z",
    });
    const newerLocal: OfferProjectRecord = {
      id: "shared-id",
      name: "Edited offline",
      updatedAt: "2026-04-01T00:00:00.000Z",
      data: defaultPuckData(),
    };
    localStorage.setItem(scopedKey(PHOTO_A), JSON.stringify({ projects: [newerLocal] }));

    await listOfferProjects(PHOTO_A);

    expect(sb.upserts).toHaveLength(1);
    expect(sb.upserts[0]?.payload).toMatchObject({
      id: "shared-id",
      name: "Edited offline",
      photographer_id: PHOTO_A,
    });
    const scopedParsed = JSON.parse(localStorage.getItem(scopedKey(PHOTO_A)) ?? "{}") as { projects: unknown[] };
    expect(scopedParsed.projects).toEqual([]);
  });

  it("when remote is empty but scoped local has projects, migration upserts each then clears scoped store", async () => {
    const localProject: OfferProjectRecord = {
      id: "migrate-me",
      name: "From browser",
      updatedAt: "2026-03-01T00:00:00.000Z",
      data: defaultPuckData(),
    };
    localStorage.setItem(scopedKey(PHOTO_A), JSON.stringify({ projects: [localProject] }));

    await listOfferProjects(PHOTO_A);

    expect(sb.upserts).toHaveLength(1);
    expect(sb.upserts[0]?.table).toBe("studio_offer_builder_projects");
    expect(sb.upserts[0]?.payload).toMatchObject({
      id: "migrate-me",
      photographer_id: PHOTO_A,
      name: "From browser",
    });
    expect(localStorage.getItem(migrationKey(PHOTO_A))).toBe("1");
    const scopedParsed = JSON.parse(localStorage.getItem(scopedKey(PHOTO_A)) ?? "{}") as { projects: unknown[] };
    expect(scopedParsed.projects).toEqual([]);
  });

  it("after successful reconciliation, scoped local cleared; on upsert failure scoped data kept and flag not set", async () => {
    const localProject: OfferProjectRecord = {
      id: "needs-push",
      name: "Fragile",
      updatedAt: "2026-03-01T00:00:00.000Z",
      data: defaultPuckData(),
    };
    localStorage.setItem(scopedKey(PHOTO_A), JSON.stringify({ projects: [localProject] }));
    sb.failUpsertOnAttempt = 1;

    await expect(listOfferProjects(PHOTO_A)).rejects.toThrow();

    const scopedParsed = JSON.parse(localStorage.getItem(scopedKey(PHOTO_A)) ?? "{}") as {
      projects: OfferProjectRecord[];
    };
    expect(scopedParsed.projects).toHaveLength(1);
    expect(scopedParsed.projects[0]?.id).toBe("needs-push");
    expect(localStorage.getItem(migrationKey(PHOTO_A))).toBeNull();
  });

  it("createOfferProject with session upserts a new row remotely", async () => {
    const project = await createOfferProject(PHOTO_A);
    expect(project.name).toBe("Untitled");
    expect(sb.upserts).toHaveLength(1);
    expect(sb.upserts[0]?.table).toBe("studio_offer_builder_projects");
    expect(sb.upserts[0]?.payload).toMatchObject({
      id: project.id,
      photographer_id: PHOTO_A,
      name: "Untitled",
    });
  });
});
