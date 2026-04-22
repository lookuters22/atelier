/**
 * Read-only current vs `template_patch` for `InvoiceSetupChangeProposalV1`.
 * "Current" is the same five allowlisted template fields as the apply path; **logo** is never included.
 */
import {
  INVOICE_SETUP_PROPOSAL_TEMPLATE_KEYS,
  type InvoiceSetupChangeProposalV1,
  type InvoiceSetupProposalTemplateKey,
} from "../types/invoiceSetupChangeProposal.types.ts";
import type { InvoiceSetupState } from "./invoiceSetupTypes.ts";

const DISPLAY_MAX = 1_200;

export type InvoiceSetupLiveTemplateSlice = Pick<
  InvoiceSetupState,
  "legalName" | "invoicePrefix" | "paymentTerms" | "accentColor" | "footerNote"
>;

export type InvoiceSetupProposalDiffLine = {
  key: InvoiceSetupProposalTemplateKey;
  label: string;
  currentDisplay: string;
  /** Same values the reviewed apply RPC would merge. */
  proposedDisplay: string;
};

export type InvoiceSetupProposalDiffResult = {
  lines: InvoiceSetupProposalDiffLine[];
  isEmpty: boolean;
};

const LABELS: Record<InvoiceSetupProposalTemplateKey, string> = {
  legalName: "Legal / studio name",
  invoicePrefix: "Invoice prefix",
  paymentTerms: "Payment terms",
  accentColor: "Accent color",
  footerNote: "Footer note",
};

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function currentFieldDisplay(
  key: InvoiceSetupProposalTemplateKey,
  live: InvoiceSetupLiveTemplateSlice,
  currentUnavailable: boolean,
): string {
  if (currentUnavailable) return "—";
  const v = live[key];
  if (v === null || v === undefined) return "—";
  if (key === "footerNote" && v === "") return "(empty)";
  const s = clip(String(v), DISPLAY_MAX);
  return s.length > 0 ? s : "—";
}

function proposedFieldDisplay(v: string | undefined): string {
  if (v === undefined) return "—";
  if (v === "") return "(empty)";
  return clip(String(v), DISPLAY_MAX);
}

/**
 * @param live - Sliced from the live `studio_invoice_setup.template` (no logo). Pass `null` when the row is missing.
 * @param currentUnavailable - When true (e.g. fetch failed), every "current" cell is "—" (proposed still shown from the patch).
 */
export function buildInvoiceSetupChangeProposalDiff(
  proposal: InvoiceSetupChangeProposalV1,
  live: InvoiceSetupLiveTemplateSlice | null,
  opts?: { currentUnavailable?: boolean },
): InvoiceSetupProposalDiffResult {
  const currentUnavailable = Boolean(opts?.currentUnavailable) || live === null;
  const base = live ?? {
    legalName: "",
    invoicePrefix: "",
    paymentTerms: "",
    accentColor: "",
    footerNote: "",
  };

  const patch = proposal.template_patch;
  const lines: InvoiceSetupProposalDiffLine[] = [];

  for (const key of INVOICE_SETUP_PROPOSAL_TEMPLATE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const v = patch[key as keyof typeof patch] as string | undefined;
    lines.push({
      key,
      label: LABELS[key],
      currentDisplay: currentFieldDisplay(key, base, currentUnavailable),
      proposedDisplay: proposedFieldDisplay(v),
    });
  }

  return { lines, isEmpty: lines.length === 0 };
}
