/**
 * Deterministic intent: client is **asking** whether travel or second-shooter is included in the package.
 * Fallback (topic + inclusion in one sentence) requires that sentence to read as a question — not a declarative.
 */
export type PackageInclusionQuestionIntent = "travel_inclusion" | "second_shooter_inclusion";

const TRAVEL_TOPIC = /\b(?:flight|flights|travel|hotel|ticket|tickets)\b/i;

const SECOND_SHOOTER_TOPIC =
  /\b(?:second\s+shooter|2nd\s+shooter|second\s+photographer|2nd\s+photographer|extra\s+shooters?)\b/i;

/** Inclusion-shaped language (same sentence as topic for fallback path). */
const INCLUSION_LANGUAGE = /\b(?:included|including|cover(?:ed)?|part\s+of|comes?\s+with|come\s+with)\b/i;

const DIRECT_TRAVEL_QUESTIONS = [
  /\bare\s+(?:the\s+)?flights?\s+included\b/i,
  /\bis\s+travel\s+included\b/i,
] as const;

/** Direct asks — narrow; synonym forms for second shooter / photographer. */
const DIRECT_SECOND_SHOOTER_QUESTIONS = [
  /\bdo\s+we\s+have\s+(?:a\s+)?(?:second\s+shooter|2nd\s+shooter|second\s+photographer|2nd\s+photographer|extra\s+shooters?)\b/i,
  /\b(?:is|are)\s+(?:a\s+)?(?:second\s+shooter|2nd\s+shooter|second\s+photographer|2nd\s+photographer)\s+included\b/i,
  /\bare\s+extra\s+shooters?\s+included\b/i,
] as const;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * True when the sentence is an ask (not a plain declarative), e.g. hotel + "included" in
 * "The hotel is included for guests Friday." must be false.
 */
function sentenceReadsAsQuestion(s: string): boolean {
  const t = s.trim();
  if (t.length === 0) return false;
  if (t.endsWith("?")) return true;
  if (/^(?:is|are|do|does|did|can|could|would|should|will|have|has|was|were|may|might|must)\b/i.test(t)) {
    return true;
  }
  if (/^(?:what|when|where|who|which|how|why)\b/i.test(t)) return true;
  if (/\b(?:can you confirm|could you confirm|do we have|do you know if)\b/i.test(t)) return true;
  return false;
}

/**
 * Topic + inclusion language in the **same sentence**, and that sentence must read as a question.
 */
function topicInclusionQuestionSameSentence(topic: RegExp, text: string): boolean {
  for (const s of splitSentences(text)) {
    if (topic.test(s) && INCLUSION_LANGUAGE.test(s) && sentenceReadsAsQuestion(s)) return true;
  }
  return false;
}

function matchesDirectTravel(text: string): boolean {
  return DIRECT_TRAVEL_QUESTIONS.some((r) => r.test(text));
}

function matchesDirectSecondShooter(text: string): boolean {
  return DIRECT_SECOND_SHOOTER_QUESTIONS.some((r) => r.test(text));
}

/**
 * Returns which package-inclusion question the client is asking, or null.
 * Travel takes precedence when both match.
 */
export function detectPackageInclusionQuestionIntent(rawMessage: string): PackageInclusionQuestionIntent | null {
  const text = typeof rawMessage === "string" ? rawMessage : "";
  if (text.trim().length === 0) return null;

  const travel = matchesDirectTravel(text) || topicInclusionQuestionSameSentence(TRAVEL_TOPIC, text);

  const secondShooter =
    matchesDirectSecondShooter(text) || topicInclusionQuestionSameSentence(SECOND_SHOOTER_TOPIC, text);

  if (travel) return "travel_inclusion";
  if (secondShooter) return "second_shooter_inclusion";
  return null;
}
