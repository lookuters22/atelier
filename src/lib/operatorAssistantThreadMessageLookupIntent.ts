/**
 * Deterministic intent for operator assistant thread / message / email history questions.
 * Used to gate bounded `threads` + `messages` reads (no broad search).
 */

const TOPIC_STOP = new Set(
  `the a an to of in on for with from at by and or is it if we you they are was were be
about what when where which who how why that this there then than our your their
do did does can could should would not no yes just only very more much
please thanks hello hi hey ok okay app help settings weather package balance
phone phones call calls got another other too also did does doing done
sent send sending email emails thread threads message messages
regarding question questions quick career student project projects
maybe perhaps received somebody someone anybody anyone everyone
today yesterday week recently thing things stuff idea ideas
talk talks talking talked speak speaks speaking spoke chat chats chatting chatted
messaged text texting texted`.split(/\s+/),
);

/** Max topic keywords scored against inbox rows (title + latest sender + snippet). */
export const OPERATOR_INBOX_TOPIC_KEYWORD_CAP = 6;

/** Max characters of latest_body read for keyword / sender matching (bounded). */
export const OPERATOR_INBOX_BODY_SNIPPET_CHARS = 420;

export type OperatorInboxThreadRecencyHint = "today" | "yesterday" | "recent" | null;

export type OperatorInboxThreadLookupSignals = {
  topicKeywords: string[];
  senderPhrases: string[];
  recency: OperatorInboxThreadRecencyHint;
};

/**
 * True when the operator question likely refers to commercial / brand / product inbound
 * (not wedding-couple CRM semantics). Used to avoid wedding index false positives and to
 * steer the prompt toward inbox thread evidence.
 */
export function querySuggestsCommercialOrNonWeddingInboundFocus(queryText: string): boolean {
  const n = normalizeOperatorInboxMatchText(queryText);
  if (!n) return false;
  if (/\b(non[-\s]?wedding|not\s+a\s+wedding|commercial\s+inquir|brand\s+inquir)\b/.test(n)) {
    return true;
  }
  return /\b(skincare|cosmetic|cosmetics|brand|brands|campaign|commercial|corporate|editorial|ecommerce|e commerce|retail|influencer|advertising|lookbook|b2b|catalogue|catalog|launch|product|products|sponsorship|creative\s+agency|commissioned|photo\s+shoot|brand\s+shoot)\b/.test(
    n,
  );
}

/** Normalizes free text for substring matching (sender / title / body snippets). */
export function normalizeOperatorInboxMatchText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._+\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keeps a short leading name span and stops at clause words (e.g. "mira about the venue" → "mira").
 * Allows a single **and** / **&** between tokens for couple-style names ("rita and james").
 */
const SENDER_PHRASE_HARD_STOP = new Set(
  `about regarding concerning on for if when where which who how why
today yesterday tomorrow this last next week month year from by to at in
find show search get pull email thread message messages emails inquiry
the a an or but`.split(/\s+/),
);

function leadingSenderNameSpan(frag: string): string {
  const parts = frag.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i]!;
    const p = raw.toLowerCase();
    if (SENDER_PHRASE_HARD_STOP.has(p)) break;
    if (p === "and" || raw === "&") {
      if (out.length === 0) break;
      const next = parts[i + 1]?.toLowerCase();
      if (!next || SENDER_PHRASE_HARD_STOP.has(next)) break;
      out.push(raw);
      continue;
    }
    out.push(raw);
    if (out.length >= 5) break;
  }
  return out.join(" ").trim();
}

/**
 * Deterministic cues for inbox-thread retrieval: multi-keyword topic, sender/name/email
 * fragments, and UTC-calendar recency (aligned with inquiry-count windows).
 */
export function extractOperatorInboxThreadLookupSignals(queryText: string): OperatorInboxThreadLookupSignals {
  const raw = String(queryText ?? "");
  const lower = raw.toLowerCase();
  const norm = normalizeOperatorInboxMatchText(raw);
  const topicKeywords: string[] = [];
  const senderPhrases: string[] = [];

  for (const m of norm.matchAll(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/g)) {
    const e = m[0]!.trim();
    if (e.length >= 5) senderPhrases.push(e);
  }

  for (const re of [
    /\bfrom\s+([a-z][a-z\s.'-]{2,60})\b/gi,
    /\bby\s+([a-z][a-z\s.'-]{2,60})\b/gi,
    /\bcalled\s+([a-z][a-z\s.'-]{2,60})\b/gi,
    /\b(?:talk|talked|speak|spoke|chat|chatted)\s+(?:to|with)\s+([a-z][a-z\s.'-]{2,60})\b/gi,
    /\b(?:messaged|texted|emailed)\s+([a-z][a-z\s.'-]{2,60})\b/gi,
    /\b(?:did|do|does|have|has)\s+([a-z][a-z.'-]{1,48})\s+(?:email|emailed|e-mail|message|messaged|text|texted)\b/gi,
    /\b(?:did|do)\s+i\s+(?:talk|speak|chat)(?:ed|ing)?\s+(?:to|with)\s+([a-z][a-z\s.'-]{2,60})\b/gi,
    /\bhave\s+we\s+(?:talk|speak|chat)(?:ed|ing)?\s+(?:to|with)\s+([a-z][a-z\s.'-]{2,60})\b/gi,
    /\bhave\s+we\s+(?:messaged|texted|emailed)\s+([a-z][a-z\s.'-]{2,60})\b/gi,
    /\bheard\s+from\s+([a-z][a-z\s.'-]{2,60})\b/gi,
  ]) {
    for (const m of lower.matchAll(re)) {
      const frag = leadingSenderNameSpan(normalizeOperatorInboxMatchText(m[1] ?? ""));
      if (frag.length >= 3 && frag.length <= 48) senderPhrases.push(frag);
    }
  }

  const parts = norm.split(" ").filter((p) => p.length >= 4 && !TOPIC_STOP.has(p));
  const uniq = [...new Set(parts)];
  uniq.sort((a, b) => b.length - a.length || a.localeCompare(b));
  for (const p of uniq.slice(0, OPERATOR_INBOX_TOPIC_KEYWORD_CAP)) {
    topicKeywords.push(p);
  }

  let recency: OperatorInboxThreadRecencyHint = null;
  if (/\btoday\b/.test(lower)) recency = "today";
  else if (/\byesterday\b/.test(lower)) recency = "yesterday";
  else if (/\b(recently|this week|past week|last few days|last couple days)\b/.test(lower)) {
    recency = "recent";
  }

  const dedupedSenders = [...new Set(senderPhrases.map((s) => s.trim()).filter(Boolean))];
  return {
    topicKeywords,
    senderPhrases: dedupedSenders.slice(0, 6),
    recency,
  };
}

/**
 * Body-level questions (“what did they say?”, “what is this email about?”).
 * Used to widen thread retrieval and optionally load bounded `messages.body` excerpts.
 */
export function hasOperatorThreadMessageBodyLookupIntent(queryText: string): boolean {
  const s = String(queryText ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 8) return false;

  if (/\bwhat\s+did\s+(they|he|she|the client|the couple)\s+say\b/.test(s)) return true;
  if (/\bwhat\s+did\s+we\s+say\b/.test(s)) return true;
  if (/\bwhat\s+(does|did)\s+the\s+(email|message)\s+say\b/.test(s)) return true;
  if (/\bwhat\s+is\s+(the|this)\s+(email|message|thread)\s+about\b/.test(s)) return true;
  if (/\bwhat\s+do\s+they\s+want\b/.test(s)) return true;
  if (/\b(summarize|summarise)\s+(the\s+)?(email|message|thread)\b/.test(s)) return true;
  if (/\b(email|message)\s+(body|content|text)\b/.test(s)) return true;
  if (/\bquote\s+(the\s+)?(email|message)\b/.test(s)) return true;
  return false;
}

/**
 * True when the operator is likely asking about thread activity, email sends, or last contact.
 * Kept conservative: unrelated CRM questions should not match.
 */
export function hasOperatorThreadMessageLookupIntent(queryText: string): boolean {
  if (hasOperatorThreadMessageBodyLookupIntent(queryText)) return true;
  const s = String(queryText ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 3) return false;

  /** Person-then-verb: "did Danilo email us", "has Marco messaged" */
  if (
    /\b(did|does|do|has|have|was|is)\s+[a-z][a-z.'-]{1,48}\s+(email|emailed|e-mail|message|messaged|text|texted)\b/.test(
      s,
    )
  ) {
    return true;
  }
  /** Operator / studio phrasing: "did I talk to …", "have we messaged …" */
  if (/\b(did|do|does|have|has)\s+i\s+(talk|speak|chat)(ed|ing)?\s+(to|with)\b/.test(s)) {
    return true;
  }
  if (/\b(have|has)\s+we\s+(talk|speak|chat)(ed|ing)?\s+(to|with)\b/.test(s)) {
    return true;
  }
  if (/\b(have|has)\s+we\s+(messaged|texted|emailed)\b/.test(s)) {
    return true;
  }
  if (/\b(messaged|texted)\b/.test(s)) {
    return true;
  }
  if (/\bheard\s+from\b/.test(s)) {
    return true;
  }
  if (/\b(find|show|search|get|pull up|pull-up)\b.*\b(messages?|emails?|thread|threads)\b/.test(s)) {
    return true;
  }
  if (/\b(any|some)\s+(messages?|emails?)\s+from\b/.test(s)) {
    return true;
  }
  if (/\b(correspondence|communication)\s+(with|from)\b/.test(s)) {
    return true;
  }

  if (
    /\b(email|emails|e-mail|thread|threads|inquiry|inquiries|inbox|message|messages|sent|send|sending|outbound|inbound|reply|replied|whatsapp|dm|dms)\b/.test(s)
  ) {
    return true;
  }
  if (/\b(last|latest)\s+(activity|email|emails|message|messages|thread|contact|time)\b/.test(s)) {
    return true;
  }
  if (/\bwhen\s+did\s+(we|i|you)\s+(last\s+)?(email|send|write|contact)\b/.test(s)) {
    return true;
  }
  if (/\b(did|have|has)\s+(they|we|the client|the couple)\s+(send|sent|email)\b/.test(s)) {
    return true;
  }
  if (/\bwhat\s+(happened|is going on|was that)\b.*\b(inquiry|thread|email)\b/.test(s)) {
    return true;
  }
  if (/\bwhat\s+inquiry\b/.test(s) || /\binquiry\s+is\s+this\b/.test(s)) {
    return true;
  }

  return false;
}

/**
 * True when the operator is likely asking whether the studio communicated with a **named** person/sender
 * (used for prompt honesty — bounded retrieval vs “never emailed”).
 */
export function hasOperatorPersonNameCommunicationLookupIntent(queryText: string): boolean {
  if (!hasOperatorThreadMessageLookupIntent(queryText)) return false;
  const s = String(queryText ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (/\b(from|to|with)\s+[a-z][a-z.'-]{2,40}\b/.test(s)) return true;
  if (
    /\b(did|does|do|has|have|was|is)\s+[a-z][a-z.'-]{2,40}\s+(email|emailed|e-mail|message|messaged|text|texted)\b/.test(
      s,
    )
  ) {
    return true;
  }
  if (/\b(did|do)\s+i\s+(talk|speak|chat)/.test(s)) return true;
  if (/\b(have|has)\s+we\s+(talk|speak|chat|messaged|texted|emailed)/.test(s)) return true;
  if (/\b(messaged|texted)\s+[a-z]/.test(s)) return true;
  if (/\bheard\s+from\s+[a-z]/.test(s)) return true;
  if (/\b(find|show|search|get)\b.*\b(messages?|emails?)\b/.test(s)) return true;
  return false;
}

/**
 * Single topic token for bounded `threads.title` match when there is no resolved wedding/person (4–40 chars).
 */
export function extractOperatorThreadTitleSearchToken(queryText: string): string | null {
  const raw = String(queryText ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  const parts = raw.split(/\s+/).filter((p) => p.length >= 4 && !TOPIC_STOP.has(p));
  const sorted = [...parts].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const t = sorted[0];
  if (!t || t.length > 40) return null;
  return t;
}
