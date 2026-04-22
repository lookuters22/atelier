/**
 * Offer builder persistence: Supabase `studio_offer_builder_projects` when logged in,
 * else localStorage fallback (dev / no session).
 */
import { supabase } from "./supabase";
import { defaultPuckData } from "./offerPuckNormalize";
import {
  clearOfferProjectsLocalStore,
  createOfferProjectLocal,
  deleteOfferProjectLocal,
  getOfferProjectLocal,
  listOfferProjectsLocal,
  upsertOfferProjectLocal,
  type OfferProjectRecord,
} from "./offerProjectsLocal";
import {
  deleteOfferProjectRemote,
  getOfferProjectRemote,
  listOfferProjectsRemote,
  upsertOfferProjectRemote,
} from "./offerProjectsRemote";

export type { OfferProjectRecord };

/** Prefix for per-photographer keys: `${prefix}${photographerId}` */
export const OFFER_PROJECTS_MIGRATION_KEY_PREFIX = "atelier-offer-projects-remote-v1-done:";

function migrationKeyFor(photographerId: string): string {
  return `${OFFER_PROJECTS_MIGRATION_KEY_PREFIX}${photographerId}`;
}

function hasRemotePersistence(photographerId: string | null | undefined): photographerId is string {
  return typeof photographerId === "string" && photographerId.length > 0;
}

/**
 * Reconcile browser-local projects into Supabase for this photographer, then clear local when safe.
 *
 * - Migration completion is tracked per `photographerId` (shared-browser multi-account safe).
 * - If remote already has rows, local-only projects are upserted — never dropped without a successful push.
 * - Same `id`: keep the version with the greater `updatedAt` (ISO); push local only when strictly newer.
 */
async function ensureRemoteMigration(photographerId: string): Promise<void> {
  if (typeof localStorage === "undefined") return;

  const key = migrationKeyFor(photographerId);
  const local = listOfferProjectsLocal(photographerId);

  if (local.length === 0) {
    if (localStorage.getItem(key) !== "1") {
      localStorage.setItem(key, "1");
    }
    return;
  }

  const remote = await listOfferProjectsRemote(supabase, photographerId);
  const remoteById = new Map(remote.map((r) => [r.id, r]));

  const toUpsert: OfferProjectRecord[] = [];
  for (const p of local) {
    const r = remoteById.get(p.id);
    if (!r || p.updatedAt > r.updatedAt) {
      toUpsert.push(p);
    }
  }

  for (const p of toUpsert) {
    await upsertOfferProjectRemote(supabase, photographerId, p);
  }

  clearOfferProjectsLocalStore(photographerId);
  localStorage.setItem(key, "1");
}

export async function listOfferProjects(photographerId: string | null | undefined): Promise<OfferProjectRecord[]> {
  if (hasRemotePersistence(photographerId)) {
    await ensureRemoteMigration(photographerId);
    return listOfferProjectsRemote(supabase, photographerId);
  }
  return listOfferProjectsLocal(null);
}

export async function getOfferProject(
  id: string,
  photographerId: string | null | undefined,
): Promise<OfferProjectRecord | undefined> {
  if (hasRemotePersistence(photographerId)) {
    await ensureRemoteMigration(photographerId);
    return getOfferProjectRemote(supabase, photographerId, id);
  }
  return getOfferProjectLocal(id, null);
}

export async function upsertOfferProject(
  project: OfferProjectRecord,
  photographerId: string | null | undefined,
): Promise<void> {
  if (hasRemotePersistence(photographerId)) {
    await ensureRemoteMigration(photographerId);
    await upsertOfferProjectRemote(supabase, photographerId, project);
    return;
  }
  upsertOfferProjectLocal(project, null);
}

export async function deleteOfferProject(id: string, photographerId: string | null | undefined): Promise<void> {
  if (hasRemotePersistence(photographerId)) {
    await ensureRemoteMigration(photographerId);
    await deleteOfferProjectRemote(supabase, photographerId, id);
    return;
  }
  deleteOfferProjectLocal(id, null);
}

export async function createOfferProject(photographerId: string | null | undefined): Promise<OfferProjectRecord> {
  if (hasRemotePersistence(photographerId)) {
    await ensureRemoteMigration(photographerId);
    const id = crypto.randomUUID();
    const data = defaultPuckData();
    const project: OfferProjectRecord = {
      id,
      name: "Untitled",
      updatedAt: new Date().toISOString(),
      data,
    };
    await upsertOfferProjectRemote(supabase, photographerId, project);
    return project;
  }
  return createOfferProjectLocal(null);
}

/** Test hook: clear all per-photographer migration flags */
export function __resetOfferProjectsMigrationForTests(): void {
  if (typeof localStorage === "undefined") return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(OFFER_PROJECTS_MIGRATION_KEY_PREFIX)) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) {
    localStorage.removeItem(k);
  }
}
