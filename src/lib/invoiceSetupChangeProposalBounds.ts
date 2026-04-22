/**
 * Validate v1 invoice-setup change proposals. No persistence, enqueue, or apply — foundation only.
 */
import {
  INVOICE_SETUP_CHANGE_PROPOSAL_SCHEMA_VERSION,
  INVOICE_SETUP_PROPOSAL_TEMPLATE_KEYS,
  type InvoiceSetupChangeProposalV1,
  type InvoiceSetupTemplatePatchV1,
} from "../types/invoiceSetupChangeProposal.types.ts";

const RATIONALE_MAX = 8_000;
const LEGAL_NAME_MAX = 300;
const INVOICE_PREFIX_MAX = 32;
const PAYMENT_TERMS_MAX = 4_000;
const FOOTER_NOTE_MAX = 8_000;

const PROPOSED_AT_RE = /^\d{4}-\d{2}-\d{2}T/;

/** `#rgb` or `#rrggbb` (invoice UI uses hex presets). */
const ACCENT_HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const META_KEY_SET = new Set<string>(INVOICE_SETUP_PROPOSAL_TEMPLATE_KEYS as readonly string[]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function nonEmptyTrimmed(s: string | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

/**
 * True if patch has at least one allowed key that would change something (non-empty where required).
 * `footerNote` may be intentionally cleared with `""`.
 */
export function invoiceSetupTemplatePatchHasEffect(patch: InvoiceSetupTemplatePatchV1): boolean {
  if (nonEmptyTrimmed(patch.legalName)) return true;
  if (nonEmptyTrimmed(patch.invoicePrefix)) return true;
  if (nonEmptyTrimmed(patch.paymentTerms)) return true;
  if (nonEmptyTrimmed(patch.accentColor)) return true;
  if (patch.footerNote !== undefined && typeof patch.footerNote === "string") return true;
  return false;
}

/**
 * Rejects keys outside v1 allowlist, oversized strings, invalid accent hex, and empty patches.
 */
export function validateInvoiceSetupChangeProposalV1(
  raw: unknown,
): { ok: true; value: InvoiceSetupChangeProposalV1 } | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: "proposal must be a JSON object" };
  }
  if (raw.schema_version !== INVOICE_SETUP_CHANGE_PROPOSAL_SCHEMA_VERSION) {
    return { ok: false, error: "schema_version must be 1" };
  }
  if (raw.source !== "operator_assistant" && raw.source !== "operator" && raw.source !== "system") {
    return { ok: false, error: "invalid source" };
  }
  if (typeof raw.proposed_at !== "string" || !raw.proposed_at.trim() || !PROPOSED_AT_RE.test(raw.proposed_at.trim())) {
    return { ok: false, error: "proposed_at must be an ISO-8601 string" };
  }
  if (typeof raw.rationale !== "string" || !raw.rationale.trim()) {
    return { ok: false, error: "rationale is required" };
  }
  if (raw.rationale.length > RATIONALE_MAX) {
    return { ok: false, error: `rationale exceeds ${RATIONALE_MAX} characters` };
  }
  if (!isPlainObject(raw.template_patch)) {
    return { ok: false, error: "template_patch must be an object" };
  }
  for (const k of Object.keys(raw.template_patch)) {
    if (!META_KEY_SET.has(k)) {
      return { ok: false, error: `template_patch: unknown key "${k}"` };
    }
  }

  const tp = raw.template_patch as Record<string, unknown>;
  const template_patch: InvoiceSetupTemplatePatchV1 = {};

  if (tp.legalName !== undefined) {
    if (typeof tp.legalName !== "string") {
      return { ok: false, error: "template_patch.legalName must be a string" };
    }
    const v = tp.legalName.trim();
    if (!v.length) {
      return { ok: false, error: "template_patch.legalName must be non-empty when present" };
    }
    if (v.length > LEGAL_NAME_MAX) {
      return { ok: false, error: `template_patch.legalName exceeds ${LEGAL_NAME_MAX} characters` };
    }
    template_patch.legalName = v;
  }

  if (tp.invoicePrefix !== undefined) {
    if (typeof tp.invoicePrefix !== "string") {
      return { ok: false, error: "template_patch.invoicePrefix must be a string" };
    }
    const v = tp.invoicePrefix.trim();
    if (!v.length) {
      return { ok: false, error: "template_patch.invoicePrefix must be non-empty when present" };
    }
    if (v.length > INVOICE_PREFIX_MAX) {
      return { ok: false, error: `template_patch.invoicePrefix exceeds ${INVOICE_PREFIX_MAX} characters` };
    }
    template_patch.invoicePrefix = v;
  }

  if (tp.paymentTerms !== undefined) {
    if (typeof tp.paymentTerms !== "string") {
      return { ok: false, error: "template_patch.paymentTerms must be a string" };
    }
    const v = tp.paymentTerms.trim();
    if (!v.length) {
      return { ok: false, error: "template_patch.paymentTerms must be non-empty when present" };
    }
    if (v.length > PAYMENT_TERMS_MAX) {
      return { ok: false, error: `template_patch.paymentTerms exceeds ${PAYMENT_TERMS_MAX} characters` };
    }
    template_patch.paymentTerms = v;
  }

  if (tp.accentColor !== undefined) {
    if (typeof tp.accentColor !== "string") {
      return { ok: false, error: "template_patch.accentColor must be a string" };
    }
    const v = tp.accentColor.trim();
    if (!v.length) {
      return { ok: false, error: "template_patch.accentColor must be non-empty when present" };
    }
    if (!ACCENT_HEX_RE.test(v)) {
      return { ok: false, error: "template_patch.accentColor must be a hex color like #rgb or #rrggbb" };
    }
    template_patch.accentColor = v;
  }

  if (tp.footerNote !== undefined) {
    if (typeof tp.footerNote !== "string") {
      return { ok: false, error: "template_patch.footerNote must be a string" };
    }
    if (tp.footerNote.length > FOOTER_NOTE_MAX) {
      return { ok: false, error: `template_patch.footerNote exceeds ${FOOTER_NOTE_MAX} characters` };
    }
    template_patch.footerNote = tp.footerNote.trim();
  }

  if (!invoiceSetupTemplatePatchHasEffect(template_patch)) {
    return { ok: false, error: "template_patch must include at least one valid field change" };
  }

  if (Object.keys(raw).some((k) => !isProposalTopLevelKey(k))) {
    return { ok: false, error: "unknown top-level key" };
  }

  const value: InvoiceSetupChangeProposalV1 = {
    schema_version: INVOICE_SETUP_CHANGE_PROPOSAL_SCHEMA_VERSION,
    source: raw.source,
    proposed_at: raw.proposed_at.trim(),
    rationale: raw.rationale.trim(),
    template_patch,
  };
  return { ok: true, value };
}

function isProposalTopLevelKey(k: string): boolean {
  return k === "schema_version" || k === "source" || k === "proposed_at" || k === "rationale" || k === "template_patch";
}

const CLIP = 1_200;

function clipString(s: string): string {
  if (s.length <= CLIP) return s;
  return `${s.slice(0, CLIP - 1)}…`;
}

/**
 * Human-readable lines for a future **review** surface (read-only).
 */
export function formatInvoiceSetupChangeProposalForReview(proposal: InvoiceSetupChangeProposalV1): string[] {
  const lines: string[] = [
    `Source: ${proposal.source}`,
    `Proposed at: ${proposal.proposed_at}`,
    `Rationale: ${proposal.rationale}`,
    "Template patch (v1 allowlist: legalName, invoicePrefix, paymentTerms, accentColor, footerNote; logo excluded):",
  ];
  const p = proposal.template_patch;
  if (p.legalName != null) lines.push(`  - legalName: ${clipString(p.legalName)}`);
  if (p.invoicePrefix != null) lines.push(`  - invoicePrefix: ${clipString(p.invoicePrefix)}`);
  if (p.paymentTerms != null) lines.push(`  - paymentTerms: ${clipString(p.paymentTerms)}`);
  if (p.accentColor != null) lines.push(`  - accentColor: ${p.accentColor}`);
  if (p.footerNote !== undefined) {
    lines.push(`  - footerNote: ${clipString(p.footerNote)}`);
  }
  return lines;
}
