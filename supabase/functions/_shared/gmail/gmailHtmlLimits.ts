/**
 * Shared HTML size caps for Gmail import pipeline (materialize + sanitize).
 * Keep in one file so Vitest + Edge stay aligned without pulling sanitize-html into tests.
 */
export const GMAIL_HTML_MAX_STORAGE_CHARS = 1_500_000;
