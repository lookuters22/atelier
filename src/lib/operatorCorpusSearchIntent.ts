/**
 * Gates **tenant corpus-wide indexed search** for operator Ana (normal + deep).
 * Cheap SQL ilike / in-memory scans — not full-body dumps on every turn.
 */

const TOKEN_STOP = new Set(
  `the a an to of in on for with from at by and or as is it if we you they are was were be been being
about what when where which who how why that this these those there then than into over out up down
our your their its his her them me my mine us
do did does doing done can could should would will shall may might must
not no yes just also only very more most much many few some any each every both
please thanks hello hi hey okay ok
find search look show anything something everything nothing
have has had having get got already rule rules thread threads message messages email emails
project projects memory memories playbook policy exception
going last week day days time times today tomorrow yesterday help need want know tell give
completely sure maybe seems seem thank this that these those`.split(/\s+/),
);

function normalizeQ(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Substantive tokens for ilike / in-memory matching (longest first, capped).
 */
export function extractCorpusSearchTokens(queryText: string, maxTokens = 4): string[] {
  const n = normalizeQ(queryText);
  if (!n) return [];
  const parts = n.split(" ").filter((p) => p.length >= 3 && !TOKEN_STOP.has(p));
  const uniq = [...new Set(parts)];
  uniq.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return uniq.slice(0, maxTokens);
}

/**
 * True when we should run **phase-1** corpus search in `buildAssistantContext`.
 * Conservative: skips pure queue/calendar/weather turns; requires tokens + search-like cue.
 */
export function shouldLoadOperatorCorpusSearchSnapshot(queryText: string): boolean {
  const raw = String(queryText ?? "").trim();
  if (raw.length < 8) return false;
  const q = normalizeQ(raw);
  const tokens = extractCorpusSearchTokens(raw, 4);
  if (tokens.length === 0) return false;

  // Pure schedule / inquiry analytics without retrieval substance
  if (
    /\b(what('?s|\s+is)\s+the\s+weather)\b/i.test(raw) ||
    (/^\s*how\s+many\s+inquir/i.test(raw) &&
      !/\b(find|search|show|anything|thread|project|rule|memory|mention)\b/i.test(raw))
  ) {
    return false;
  }

  const explicitSearch =
    /\b(find|search|look\s+for|show\s+me|anything\s+about|references?\s+to|mentioning)\b/i.test(q) ||
    /\b(do\s+we\s+(have|already)|is\s+there\s+anything)\b/i.test(q) ||
    /\b(threads?\s+about|messages?\s+(about|from)|inbox\s+about)\b/i.test(q) ||
    /\b(projects?\s+(about|mentioning)|crm\s+about)\b/i.test(q) ||
    /\b(rule\s+for|rules?\s+(for|about)|playbook\s+.*\b(have|find|search|already|cover)\b)\b/i.test(q) ||
    /\b(case\s+exception|authorized\s+case|policy\s+exception)\b/i.test(q) ||
    /\b(memor(y|ies)\s+about)\b/i.test(q) ||
    /\b(offer\s+builder|investment\s+guide).*\b(find|search|mention)\b/i.test(q) ||
    /\b(invoice\s+setup|payment\s+terms|footer).*\b(find|search|mention|net\s+)/i.test(q);

  const substanceCue =
    /\b(discuss(ed)?|split\s+deposit|net\s+\d+|commercial\s+shoot|venue\s+pric|lake\s+como|villa\s+)/i.test(
      q,
    );

  return explicitSearch || substanceCue;
}

/** True when a cheap `messages.body` ilike probe is warranted (bounded). */
export function shouldProbeMessageBodiesForCorpusSearch(queryText: string): boolean {
  const q = normalizeQ(queryText);
  if (q.length < 10) return false;
  return (
    /\b(discuss(ed)?|said|wrote|email\s+about|message\s+about|invoice|deposit|net\s+\d+|terms)\b/.test(q) ||
    /\b(find|search|anything)\b.*\b(message|email|thread|inbox)\b/.test(q)
  );
}
