import type { LucideIcon } from "lucide-react";
import { ClipboardPen, Inbox, ListTodo } from "lucide-react";

export type { ManagerApprovalDraft } from "./approvalDrafts";
export { MANAGER_APPROVAL_DRAFTS } from "./approvalDrafts";

export type Photographer = {
  id: string;
  displayName: string;
  initials: string;
  /** Tailwind classes for avatar ring + fill */
  ringClass: string;
};

export const PHOTOGRAPHERS: Photographer[] = [
  {
    id: "ph-elena",
    displayName: "Elena Duarte",
    initials: "ED",
    ringClass: "ring-amber-500/50 bg-amber-500/15 text-amber-950",
  },
  {
    id: "ph-marco",
    displayName: "Marco Rossi",
    initials: "MR",
    ringClass: "ring-sky-500/50 bg-sky-500/15 text-sky-950",
  },
  {
    id: "ph-luca",
    displayName: "Luca Bianchi",
    initials: "LB",
    ringClass: "ring-emerald-500/50 bg-emerald-500/15 text-emerald-950",
  },
  {
    id: "ph-sara",
    displayName: "Sara Nielsen",
    initials: "SN",
    ringClass: "ring-violet-500/50 bg-violet-500/15 text-violet-950",
  },
];

/** Which lead owns each catalog wedding (demo) */
export const WEDDING_PHOTOGRAPHER_ID: Record<string, string> = {
  "lake-como": "ph-elena",
  santorini: "ph-marco",
  london: "ph-luca",
};

export function getPhotographerById(id: string): Photographer | undefined {
  return PHOTOGRAPHERS.find((p) => p.id === id);
}

export function getPhotographerIdForWedding(weddingId: string | undefined | null): string | undefined {
  if (!weddingId) return undefined;
  return WEDDING_PHOTOGRAPHER_ID[weddingId];
}

export function countWeddingsForPhotographer(photographerId: string): number {
  return Object.values(WEDDING_PHOTOGRAPHER_ID).filter((pid) => pid === photographerId).length;
}

export type ManagerAttentionItem = {
  photographerId: string;
  title: string;
  count: number;
  hint: string;
  to: string;
  Icon: LucideIcon;
  iconGradient: string;
};

export const MANAGER_ATTENTION: ManagerAttentionItem[] = [
  {
    photographerId: "ph-elena",
    title: "Unfiled messages",
    count: 2,
    hint: "Link threads to the right wedding to keep timelines clean.",
    to: "/manager/inbox?filter=unfiled",
    Icon: Inbox,
    iconGradient: "linear-gradient(135deg, #ff6259 0%, #d63340 100%)",
  },
  {
    photographerId: "ph-marco",
    title: "Drafts awaiting approval",
    count: 1,
    hint: "Review tone before anything reaches a planner or couple.",
    to: "/manager/approvals",
    Icon: ClipboardPen,
    iconGradient: "linear-gradient(135deg, #38bdf8 0%, #0169cc 100%)",
  },
  {
    photographerId: "ph-elena",
    title: "Tasks due today",
    count: 1,
    hint: "Questionnaire reminder for Villa Cetinale.",
    to: "/manager/tasks",
    Icon: ListTodo,
    iconGradient: "linear-gradient(135deg, #34d399 0%, #059669 100%)",
  },
];

export const MANAGER_UPCOMING = [
  {
    couple: "Sofia & Marco",
    when: "Sat, Jun 14 · Lake Como",
    stage: "Booked",
    balance: "Balance · €4,200",
    id: "lake-como",
    photographerId: "ph-elena",
  },
  {
    couple: "Amelia & James",
    when: "Sat, Jul 5 · Santorini",
    stage: "Contract out",
    balance: "Retainer received",
    id: "santorini",
    photographerId: "ph-marco",
  },
  {
    couple: "Priya & Daniel",
    when: "Sep 20 · London",
    stage: "Inquiry",
    balance: "Proposal pending",
    id: "london",
    photographerId: "ph-luca",
  },
] as const;

export type ManagerPipelineRow = {
  id: string;
  weddingRouteId: string;
  couple: string;
  when: string;
  city: string;
  value: string;
  currentStageIndex: number;
  photographerId: string;
};

export const MANAGER_PIPELINE_WEDDINGS: ManagerPipelineRow[] = [
  {
    id: "priya",
    weddingRouteId: "london",
    couple: "Priya & Daniel",
    when: "Sep 20",
    city: "London",
    value: "£9.8k",
    currentStageIndex: 0,
    photographerId: "ph-luca",
  },
  {
    id: "amelia",
    weddingRouteId: "santorini",
    couple: "Amelia & James",
    when: "Jul 5",
    city: "Santorini",
    value: "£14.2k",
    currentStageIndex: 3,
    photographerId: "ph-marco",
  },
  {
    id: "sofia",
    weddingRouteId: "lake-como",
    couple: "Sofia & Marco",
    when: "Jun 14",
    city: "Lake Como",
    value: "€18.5k",
    currentStageIndex: 5,
    photographerId: "ph-elena",
  },
  {
    id: "nina",
    weddingRouteId: "london",
    couple: "Nina & Leo",
    when: "Aug 2025",
    city: "Provence",
    value: "€12.4k",
    currentStageIndex: 6,
    photographerId: "ph-sara",
  },
];

export type ManagerTaskRow = {
  photographerId: string;
  title: string;
  wedding: string;
  due: string;
  id: string;
};

export const MANAGER_TASKS: ManagerTaskRow[] = [
  {
    photographerId: "ph-elena",
    title: "Send questionnaire (6-week)",
    wedding: "Sofia & Marco",
    due: "Apr 02",
    id: "lake-como",
  },
  {
    photographerId: "ph-luca",
    title: "Confirm second shooter addendum",
    wedding: "Priya & Daniel",
    due: "Today",
    id: "london",
  },
  {
    photographerId: "ph-marco",
    title: "Upload COI to venue portal",
    wedding: "Amelia & James",
    due: "Apr 18",
    id: "santorini",
  },
];

export type ManagerContactRow = {
  photographerId: string;
  name: string;
  role: string;
  email: string;
  weddings: string[];
};

export const MANAGER_CONTACTS: ManagerContactRow[] = [
  {
    photographerId: "ph-elena",
    name: "Elena Rossi",
    role: "Planner",
    email: "elena@rossiplans.it",
    weddings: ["lake-como"],
  },
  {
    photographerId: "ph-elena",
    name: "Sofia Marin",
    role: "Bride",
    email: "sofia@email.com",
    weddings: ["lake-como"],
  },
  {
    photographerId: "ph-luca",
    name: "Priya Kapoor",
    role: "Bride",
    email: "priya@email.com",
    weddings: ["london"],
  },
];
