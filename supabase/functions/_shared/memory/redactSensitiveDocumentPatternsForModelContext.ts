/**
 * Sensitive-document / payment-identifier redaction v1 for **model-facing** strings.
 *
 * High-signal, fail-safe patterns only — not DLP, not a vault, not attachment OCR.
 * Prefer redacting a span over missing a live passport/IBAN in operator/client LLM context.
 */

/** Stable placeholder; must not contain substrings that later passes would re-match. */
export const SENSITIVE_DOCUMENT_REDACTION_TOKEN =
  "[redacted: sensitive document or payment identifier]" as const;

/** No `i` flag: `i` would let `[A-Z0-9]` match lowercase and swallow words like "thanks" after digits. */
const IBAN_BLOCK = /\b([A-Z]{2}\d{2}(?:[\s.\u00A0-]*[A-Z0-9]){11,32})\b/g;

function normalizeAlnumUpper(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** ISO 13616 mod-97-10 — rejects false positives like trailing English words uppercased into the capture. */
function isPlausibleIbanStructure(n: string): boolean {
  if (n.length < 15 || n.length > 34 || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(n)) return false;
  const rearr = n.slice(4) + n.slice(0, 4);
  let expanded = "";
  for (let i = 0; i < rearr.length; i++) {
    const c = rearr.charCodeAt(i);
    if (c >= 48 && c <= 57) expanded += String.fromCharCode(c);
    else if (c >= 65 && c <= 90) expanded += String(c - 55);
    else return false;
  }
  let remainder = 0;
  for (let i = 0; i < expanded.length; i++) {
    const d = expanded.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    remainder = (remainder * 10 + d) % 97;
  }
  return remainder === 1;
}

/** Longest IBAN-length prefix of over-captured block that passes mod-97 (stops at trailing English words). */
function longestValidIbanPrefix(normalized: string): string | null {
  for (let len = Math.min(normalized.length, 34); len >= 15; len--) {
    const pref = normalized.slice(0, len);
    if (isPlausibleIbanStructure(pref)) return pref;
  }
  return null;
}

function originalSliceLenForAlnumCount(raw: string, alnumCount: number): number {
  let seen = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    const alnum =
      (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    if (alnum) {
      seen++;
      if (seen === alnumCount) return i + 1;
    }
  }
  return raw.length;
}

function redactIbanLike(text: string): string {
  const upper = text.toUpperCase();
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(IBAN_BLOCK.source, "g");
  while ((m = re.exec(upper)) !== null) {
    const full = m[0];
    const n = normalizeAlnumUpper(full);
    const iban = longestValidIbanPrefix(n);
    if (iban == null) {
      continue;
    }
    const spanLen = originalSliceLenForAlnumCount(full, iban.length);
    out += text.slice(last, m.index) + SENSITIVE_DOCUMENT_REDACTION_TOKEN;
    last = m.index + spanLen;
  }
  out += text.slice(last);
  return out;
}

/**
 * Payment cards are almost always grouped (spaces/dashes). Requiring grouped separators avoids
 * treating long IBAN digit runs as PANs.
 */
const CARD_GROUPED = /\b(?:\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{1,7})\b/g;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const code = digits.charCodeAt(i);
    if (code < 48 || code > 57) return false;
    let n = code - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function redactPaymentCards(text: string): string {
  let t = text.replace(CARD_GROUPED, (block) => {
    const digits = block.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return block;
    return SENSITIVE_DOCUMENT_REDACTION_TOKEN;
  });
  t = t.replace(/\b\d{13,19}\b/g, (block) => (luhnValid(block) ? SENSITIVE_DOCUMENT_REDACTION_TOKEN : block));
  return t;
}

function redactUsSsn(text: string): string {
  return text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, SENSITIVE_DOCUMENT_REDACTION_TOKEN);
}

function redactLabeledBankRails(text: string): string {
  let t = text;
  t = t.replace(
    /\b(?:routing|aba)\s*(?:no\.?|number|#)?\s*[:#]?\s*\d{9}\b/gi,
    SENSITIVE_DOCUMENT_REDACTION_TOKEN,
  );
  t = t.replace(
    /\bsort\s*code\s*[:#]?\s*\d{2}[- \t]?\d{2}[- \t]?\d{2}\b/gi,
    SENSITIVE_DOCUMENT_REDACTION_TOKEN,
  );
  t = t.replace(
    /\b(?:account|acct)\s*(?:no\.?|number|#)?\s*[:#]?\s*\d{8,17}\b/gi,
    SENSITIVE_DOCUMENT_REDACTION_TOKEN,
  );
  return t;
}

function redactPassportNationalIdLicense(text: string): string {
  let t = text;
  const labeledId =
    /\b(?:passport|travel\s+document)\s*(?:no\.?|number|#)?\s*[:#]?\s*[A-Za-z0-9]{5,14}\b/gi;
  t = t.replace(labeledId, SENSITIVE_DOCUMENT_REDACTION_TOKEN);
  t = t.replace(
    /\bpassport\s*(?:no\.?|number|#)?\s*[:#]?\s*\d{6,12}\b/gi,
    SENSITIVE_DOCUMENT_REDACTION_TOKEN,
  );
  t = t.replace(
    /\bvisa\s*(?:no\.?|number|#)?\s*[:#]?\s*[A-Za-z0-9]{5,14}\b/gi,
    SENSITIVE_DOCUMENT_REDACTION_TOKEN,
  );
  t = t.replace(
    /\b(?:national\s+id|nid|personal\s+id\s+number)\s*[:#]?\s*[A-Z0-9]{5,14}\b/gi,
    SENSITIVE_DOCUMENT_REDACTION_TOKEN,
  );
  t = t.replace(
    /\b(?:driver'?s?\s+licen[cs]e|driving\s+licen[cs]e)\s*(?:no\.?|number|#)?\s*[:#]?\s*[A-Za-z0-9]{5,14}\b/gi,
    SENSITIVE_DOCUMENT_REDACTION_TOKEN,
  );
  return t;
}

/**
 * Only when the message already references identity/venue-access style documents,
 * strip explicit DOB fields so "team passport + DOB" lists do not leak through.
 */
const ID_CUE_NEAR_DOB =
  /\b(?:passport|national\s+id|id\s+card|visa(?:\s+number)?|travel\s+document|venue\s+security|access\s+list|government\s+id|identification|planner|team\s+member)\b/i;

function redactContextualDobFields(text: string): string {
  if (!ID_CUE_NEAR_DOB.test(text)) return text;
  let t = text;
  t = t.replace(
    /\b(?:d\.?o\.?b\.?|date\s+of\s+birth)\s*[:#]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2})\b/gi,
    SENSITIVE_DOCUMENT_REDACTION_TOKEN,
  );
  return t;
}

/**
 * Apply all v1 redactions (IBAN before card is fine: grouped-card pattern avoids IBAN collisions).
 */
export function redactSensitiveDocumentPatternsForModelContext(raw: string): string {
  let t = raw;
  t = redactIbanLike(t);
  t = redactPaymentCards(t);
  t = redactUsSsn(t);
  t = redactLabeledBankRails(t);
  t = redactPassportNationalIdLicense(t);
  t = redactContextualDobFields(t);
  return t;
}

/** True if {@link redactSensitiveDocumentPatternsForModelContext} would change the string. */
export function shouldRedactSensitiveDocumentPatternsForModelContext(raw: string): boolean {
  return redactSensitiveDocumentPatternsForModelContext(raw) !== raw;
}
