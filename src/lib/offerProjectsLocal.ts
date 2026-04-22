import type { Data } from "@measured/puck";
import { OFFER_PUCK_STORAGE_KEY } from "./offerHtmlDocument";
import { defaultPuckData, normalizePuckData, projectDisplayName } from "./offerPuckNormalize";
import { loadJson, saveJson } from "./settingsStorage";

/**
 * Logged-out / anonymous browser drafts. Never auto-reconciled into a photographer's remote account
 * (shared-browser safe). Legacy single-key bucket from before per-photographer scoping.
 */
export const OFFER_PROJECTS_ANONYMOUS_KEY = "atelier-offer-projects-v1";

/** @deprecated Use OFFER_PROJECTS_ANONYMOUS_KEY */
export const OFFER_PROJECTS_KEY = OFFER_PROJECTS_ANONYMOUS_KEY;

/** `null` / missing → anonymous; otherwise drafts scoped to that photographer id only. */
export function offerProjectsLocalStorageKey(photographerId: string | null | undefined): string {
  if (photographerId == null || photographerId === "") {
    return OFFER_PROJECTS_ANONYMOUS_KEY;
  }
  return `${OFFER_PROJECTS_ANONYMOUS_KEY}:photographer:${photographerId}`;
}

export type OfferProjectRecord = {
  id: string;
  name: string;
  updatedAt: string;
  data: Data;
};

type ProjectsFile = { projects: OfferProjectRecord[] };

function readStore(photographerId: string | null): ProjectsFile {
  const key = offerProjectsLocalStorageKey(photographerId);
  return loadJson<ProjectsFile>(key, { projects: [] });
}

function writeStore(photographerId: string | null, store: ProjectsFile): void {
  saveJson(offerProjectsLocalStorageKey(photographerId), store);
}

/** Prevents re-importing legacy Puck blob into anonymous store after an intentional clear. */
let anonymousLegacyPuckMigrated = false;

function migrateLegacyPuckToAnonymousIfNeeded(): void {
  if (anonymousLegacyPuckMigrated) return;
  anonymousLegacyPuckMigrated = true;
  const store = readStore(null);
  if (store.projects.length > 0) return;

  const legacy = loadJson<Data | null>(OFFER_PUCK_STORAGE_KEY, null);
  if (!legacy || !legacy.root || !Array.isArray(legacy.content)) return;

  const id = crypto.randomUUID();
  const data = normalizePuckData(legacy);
  const project: OfferProjectRecord = {
    id,
    name: projectDisplayName(data),
    updatedAt: new Date().toISOString(),
    data,
  };
  writeStore(null, { projects: [project] });
}

function ensureReady(photographerId: string | null): void {
  if (photographerId == null) {
    migrateLegacyPuckToAnonymousIfNeeded();
  }
}

export function listOfferProjectsLocal(photographerId: string | null): OfferProjectRecord[] {
  ensureReady(photographerId);
  const { projects } = readStore(photographerId);
  return [...projects].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getOfferProjectLocal(id: string, photographerId: string | null): OfferProjectRecord | undefined {
  ensureReady(photographerId);
  return readStore(photographerId).projects.find((p) => p.id === id);
}

export function upsertOfferProjectLocal(project: OfferProjectRecord, photographerId: string | null): void {
  ensureReady(photographerId);
  const store = readStore(photographerId);
  const i = store.projects.findIndex((p) => p.id === project.id);
  if (i >= 0) store.projects[i] = project;
  else store.projects.push(project);
  writeStore(photographerId, store);
}

export function deleteOfferProjectLocal(id: string, photographerId: string | null): void {
  ensureReady(photographerId);
  const store = readStore(photographerId);
  store.projects = store.projects.filter((p) => p.id !== id);
  writeStore(photographerId, store);
}

export function createOfferProjectLocal(photographerId: string | null): OfferProjectRecord {
  ensureReady(photographerId);
  const id = crypto.randomUUID();
  const data = defaultPuckData();
  const project: OfferProjectRecord = {
    id,
    name: "Untitled",
    updatedAt: new Date().toISOString(),
    data,
  };
  upsertOfferProjectLocal(project, photographerId);
  return project;
}

/** Clears only this photographer's scoped local bucket (used after successful remote reconciliation). */
export function clearOfferProjectsLocalStore(photographerId: string): void {
  writeStore(photographerId, { projects: [] });
}

/** Test hook: reset legacy-import guard (anonymous bucket only). */
export function __resetOfferProjectsAnonymousLegacyGuardForTests(): void {
  anonymousLegacyPuckMigrated = false;
}
