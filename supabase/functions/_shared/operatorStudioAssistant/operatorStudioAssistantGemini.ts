/**
 * Minimal Gemini (Generative Language API) adapter for Operator Ana.
 * Supports JSON text completions and the same bounded read-only `operator_lookup_*` tool round as OpenAI.
 * Streaming widget path (Slice D): tool-enabled **first** pass uses `streamGenerateContent` + SSE so plain JSON
 * replies stream token-wise; SSE chunks that contain `functionCall` parts skip visible text deltas (aligned with
 * OpenAI’s tool first pass). One-shot `completeOperatorStudioAssistantLlm` still uses non-stream `generateContent`.
 * Callers must not pass OpenAI-style `tool` role messages into {@link splitSystemAndGeminiContents}; tool
 * follow-ups are appended as native Gemini `functionResponse` parts instead.
 */

export type GeminiFunctionCallPart = { name: string; args: Record<string, unknown> };

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_BASE_MS = 320;

type OpenAiStyleMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: unknown[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** HTTP failure from Gemini REST; message body is shortened for logs and client surfacing. */
export class GeminiHttpError extends Error {
  readonly status: number;
  readonly bodySnippet: string;
  constructor(status: number, bodyText: string) {
    const snippet = shortenGeminiErrorBody(bodyText);
    super(`Gemini API error ${status}: ${snippet}`);
    this.name = "GeminiHttpError";
    this.status = status;
    this.bodySnippet = snippet;
  }
}

function shortenGeminiErrorBody(raw: string, max = 380): string {
  const one = raw.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

/** Transient overload / gateway statuses worth retrying (Operator Ana backend only). */
export function isRetryableGeminiHttpStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 503 || status === 502 || status === 504;
}

/**
 * Gemini REST often returns HTTP 200 with a JSON body `{ "error": { "code": 503, "message": "...", "status": "UNAVAILABLE" } }`.
 * Our retry logic must treat that like a failed request, not "empty candidates".
 */
export function extractGeminiRestErrorEnvelope(data: unknown): { code: number; message: string } | null {
  if (!data || typeof data !== "object") return null;
  const err = (data as { error?: unknown }).error;
  if (!err || typeof err !== "object") return null;
  const code = (err as { code?: unknown }).code;
  const message = (err as { message?: unknown }).message;
  if (typeof code !== "number" || typeof message !== "string") return null;
  return { code, message };
}

function geminiRetryDelayMs(attemptIndexAfterFailure: number): number {
  const exp = GEMINI_RETRY_BASE_MS * Math.pow(2, Math.max(0, attemptIndexAfterFailure - 1));
  return Math.min(exp + Math.floor(Math.random() * 150), 2800);
}

function logGeminiRetry(ctx: {
  phase: "generateContent" | "streamGenerateContent";
  previousAttempt: number;
  status: number | null;
  errorClass: "http" | "network";
  detail?: string;
}) {
  console.log(
    JSON.stringify({
      type: "operator_assistant_gemini_retry",
      provider: "google",
      ...ctx,
      maxAttempts: GEMINI_MAX_ATTEMPTS,
    }),
  );
}

function logGeminiRetrySuccess(ctx: { phase: "generateContent" | "streamGenerateContent"; attemptsUsed: number }) {
  console.log(
    JSON.stringify({
      type: "operator_assistant_gemini_retry_success",
      provider: "google",
      ...ctx,
    }),
  );
}

async function sleepGeminiRetry(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function splitSystemAndGeminiContents(messages: OpenAiStyleMessage[]): {
  systemInstruction: string;
  contents: GeminiContent[];
} {
  let systemInstruction = "";
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemInstruction = m.content;
      continue;
    }
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
      continue;
    }
    if (m.role === "assistant") {
      if (m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        throw new Error(
          "Operator Ana (Gemini): conversation history cannot include OpenAI-style assistant tool_calls; use plain-text assistant turns when ANA_LLM_PROVIDER=google.",
        );
      }
      contents.push({ role: "model", parts: [{ text: m.content ?? "" }] });
      continue;
    }
    if (m.role === "tool") {
      throw new Error(
        "Operator Ana (Gemini): conversation history cannot include OpenAI-style tool messages; use plain-text turns when ANA_LLM_PROVIDER=google.",
      );
    }
  }
  return { systemInstruction, contents };
}

/** Extracts concatenated text from a `generateContent` JSON body (tests + runtime). */
export function extractGeminiGenerateContentText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const cands = (data as { candidates?: unknown }).candidates;
  if (!Array.isArray(cands) || cands.length === 0) return "";
  const parts = (cands[0] as { content?: { parts?: unknown } })?.content?.parts;
  if (!Array.isArray(parts)) return "";
  let out = "";
  for (const p of parts) {
    if (p && typeof p === "object" && "text" in p && typeof (p as { text: unknown }).text === "string") {
      out += (p as { text: string }).text;
    }
  }
  return out;
}

function geminiFirstCandidateParts(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const cands = (data as { candidates?: unknown }).candidates;
  if (!Array.isArray(cands) || cands.length === 0) return [];
  const parts = (cands[0] as { content?: { parts?: unknown } })?.content?.parts;
  return Array.isArray(parts) ? parts : [];
}

/** True when the model emitted at least one `functionCall` part (used to distinguish tool round vs plain text). */
export function geminiResponseHasFunctionCallParts(data: unknown): boolean {
  return geminiFirstCandidateParts(data).some(
    (p) => p && typeof p === "object" && "functionCall" in p,
  );
}

function normalizeGeminiFunctionArgs(raw: unknown): Record<string, unknown> {
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/**
 * Parses `functionCall` parts from the first candidate (order preserved). Empty `name` values are kept so
 * callers can fail safely or return structured errors.
 */
export function extractGeminiFunctionCallsFromResponse(data: unknown): GeminiFunctionCallPart[] {
  const parts = geminiFirstCandidateParts(data);
  const out: GeminiFunctionCallPart[] = [];
  for (const p of parts) {
    if (!p || typeof p !== "object" || !("functionCall" in p)) continue;
    const fc = (p as { functionCall: { name?: unknown; args?: unknown } }).functionCall;
    const name = typeof fc?.name === "string" ? fc.name.trim() : "";
    out.push({ name, args: normalizeGeminiFunctionArgs(fc?.args) });
  }
  return out;
}

/**
 * Builds the model `content` block to append before `functionResponse` user turns. Prefers the API candidate
 * when it contains coherent `functionCall` / `text` parts; otherwise synthesizes from parsed calls.
 */
export function geminiModelContentForToolFollowUp(data: unknown, calls: GeminiFunctionCallPart[]): GeminiContent {
  if (!data || typeof data !== "object") {
    /* fall through to synthetic */
  } else {
    const cands = (data as { candidates?: unknown }).candidates;
    if (Array.isArray(cands) && cands.length > 0) {
      const content = (cands[0] as { content?: unknown }).content;
      if (content && typeof content === "object") {
        const partsRaw = (content as { parts?: unknown }).parts;
        if (Array.isArray(partsRaw) && partsRaw.length > 0) {
          const normalized: GeminiPart[] = [];
          for (const p of partsRaw) {
            if (!p || typeof p !== "object") continue;
            if ("functionCall" in p) {
              const fc = (p as { functionCall: { name?: unknown; args?: unknown } }).functionCall;
              const name = typeof fc?.name === "string" ? fc.name : "";
              normalized.push({
                functionCall: { name, args: normalizeGeminiFunctionArgs(fc?.args) },
              });
            } else if ("text" in p && typeof (p as { text: unknown }).text === "string") {
              normalized.push({ text: (p as { text: string }).text });
            }
          }
          if (normalized.some((x) => "functionCall" in x)) {
            return { role: "model", parts: normalized };
          }
        }
      }
    }
  }
  if (calls.length === 0) {
    throw new Error("Gemini tool round: missing model function-call content");
  }
  return {
    role: "model",
    parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
  };
}

export type GeminiFunctionDeclaration = {
  name: string;
  description?: string;
  parameters?: unknown;
};

export type PostGeminiGenerateContentParams = {
  apiKey: string;
  model: string;
  systemInstruction: string;
  contents: GeminiContent[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  functionDeclarations?: GeminiFunctionDeclaration[];
  /**
   * When `functionDeclarations` are set, `responseMimeType` is always omitted (tool-calling pass).
   * Otherwise: default `application/json`; pass `null` to omit (rare).
   */
  responseMimeType?: "application/json" | null;
};

/** Low-level `generateContent` — returns the full JSON body (for tool rounds with no assistant text). */
export async function postGeminiGenerateContentRaw(params: PostGeminiGenerateContentParams): Promise<unknown> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent` +
    `?key=${encodeURIComponent(params.apiKey)}`;
  const hasTools = (params.functionDeclarations?.length ?? 0) > 0;
  const generationConfig: Record<string, unknown> = {
    temperature: params.temperature ?? 0.25,
    maxOutputTokens: params.maxOutputTokens ?? 1600,
  };
  if (!hasTools) {
    const mime = params.responseMimeType === null ? undefined : (params.responseMimeType ?? "application/json");
    if (mime) generationConfig.responseMimeType = mime;
  }
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: params.systemInstruction }] },
    contents: params.contents,
    generationConfig,
  };
  if (hasTools) {
    body.tools = [{ functionDeclarations: params.functionDeclarations }];
  }

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: params.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (!isRetryableGeminiHttpStatus(res.status) || attempt >= GEMINI_MAX_ATTEMPTS) {
          throw new GeminiHttpError(res.status, errText);
        }
        logGeminiRetry({
          phase: "generateContent",
          previousAttempt: attempt,
          status: res.status,
          errorClass: "http",
          detail: "http_status",
        });
        await sleepGeminiRetry(geminiRetryDelayMs(attempt), params.signal);
        continue;
      }

      const json = (await res.json()) as unknown;
      const apiErr = extractGeminiRestErrorEnvelope(json);
      if (apiErr) {
        if (!isRetryableGeminiHttpStatus(apiErr.code) || attempt >= GEMINI_MAX_ATTEMPTS) {
          throw new GeminiHttpError(apiErr.code, apiErr.message);
        }
        logGeminiRetry({
          phase: "generateContent",
          previousAttempt: attempt,
          status: apiErr.code,
          errorClass: "http",
          detail: "json_error_envelope",
        });
        await sleepGeminiRetry(geminiRetryDelayMs(attempt), params.signal);
        continue;
      }

      if (attempt > 1) {
        logGeminiRetrySuccess({ phase: "generateContent", attemptsUsed: attempt });
      }
      return json;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw e;
      }
      if (e instanceof GeminiHttpError) {
        throw e;
      }
      if (e instanceof TypeError && attempt < GEMINI_MAX_ATTEMPTS) {
        logGeminiRetry({
          phase: "generateContent",
          previousAttempt: attempt,
          status: null,
          errorClass: "network",
        });
        await sleepGeminiRetry(geminiRetryDelayMs(attempt), params.signal);
        continue;
      }
      throw e;
    }
  }

  throw new Error("Gemini: retries exhausted");
}

/**
 * Merges one streamed `GenerateContentResponse` chunk into running assistant text.
 * Handles both incremental token chunks and cumulative (prefix-growing) chunks from the API.
 */
export function mergeGeminiStreamingTextChunk(
  prevFull: string,
  chunk: unknown,
): { delta: string; newFull: string } {
  if (chunk && typeof chunk === "object" && "error" in chunk) {
    const env = extractGeminiRestErrorEnvelope(chunk);
    if (env) {
      throw new GeminiHttpError(env.code, env.message);
    }
    const e = (chunk as { error: unknown }).error;
    const msg =
      e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
        ? (e as { message: string }).message
        : JSON.stringify(e);
    throw new Error(`Gemini stream error: ${msg}`);
  }
  const piece = extractGeminiGenerateContentText(chunk);
  if (!piece) return { delta: "", newFull: prevFull };
  if (prevFull.length > 0 && piece.startsWith(prevFull)) {
    return { delta: piece.slice(prevFull.length), newFull: piece };
  }
  return { delta: piece, newFull: prevFull + piece };
}

/**
 * Reconstructs one `generateContent`-shaped object from streamed chunks (tool-aware first pass).
 * Preserves per-chunk part order; merges text segments with {@link mergeGeminiStreamingTextChunk}.
 */
export function foldGeminiStreamChunksForFirstPass(chunks: unknown[]): unknown {
  const mergedParts: unknown[] = [];
  let textRun = "";
  const flushTextRun = () => {
    if (textRun.length > 0) {
      mergedParts.push({ text: textRun });
      textRun = "";
    }
  };
  for (const ch of chunks) {
    const parts = geminiFirstCandidateParts(ch);
    for (const p of parts) {
      if (!p || typeof p !== "object") continue;
      if ("functionCall" in p) {
        flushTextRun();
        mergedParts.push(p);
      } else if ("text" in p && typeof (p as { text: unknown }).text === "string") {
        const piece = (p as { text: string }).text;
        const { newFull } = mergeGeminiStreamingTextChunk(textRun, {
          candidates: [{ content: { parts: [{ text: piece }] } }],
        });
        textRun = newFull;
      }
    }
  }
  flushTextRun();
  return { candidates: [{ content: { parts: mergedParts } }] };
}

async function readGeminiSseStreamFirstPassToolAware(
  res: Response,
  onTextDelta: ((delta: string) => void) | undefined,
  deliveredChars: { n: number },
): Promise<{ chunks: unknown[]; folded: unknown }> {
  if (!res.body) {
    throw new Error("Gemini stream has no body");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder("utf-8", { fatal: false });
  let lineBuf = "";
  const chunks: unknown[] = [];
  let runningForDelta = "";

  const emit = (delta: string) => {
    if (delta.length === 0) return;
    deliveredChars.n += delta.length;
    onTextDelta?.(delta);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      lineBuf += dec.decode(value, { stream: !done });
    }
    if (done) {
      lineBuf += dec.decode();
    }

    while (lineBuf.length > 0) {
      const n = lineBuf.indexOf("\n");
      if (n < 0) break;
      const line = lineBuf.slice(0, n).replace(/\r$/, "");
      lineBuf = lineBuf.slice(n + 1);

      const parsed = parseGeminiSseDataLine(line);
      if (parsed == null) continue;
      chunks.push(parsed);
      if (onTextDelta && !geminiResponseHasFunctionCallParts(parsed)) {
        const { delta, newFull } = mergeGeminiStreamingTextChunk(runningForDelta, parsed);
        runningForDelta = newFull;
        emit(delta);
      }
    }

    if (done) {
      if (lineBuf.length > 0) {
        const parsed = parseGeminiSseDataLine(lineBuf.replace(/\r$/, ""));
        if (parsed != null) {
          chunks.push(parsed);
          if (onTextDelta && !geminiResponseHasFunctionCallParts(parsed)) {
            const { delta, newFull } = mergeGeminiStreamingTextChunk(runningForDelta, parsed);
            runningForDelta = newFull;
            emit(delta);
          }
        }
      }
      break;
    }
  }

  if (chunks.length === 0) {
    throw new Error("Gemini stream returned no candidates");
  }
  return { chunks, folded: foldGeminiStreamChunksForFirstPass(chunks) };
}

/**
 * First pass with **tools**: `streamGenerateContent` (SSE) so plain JSON turns stream like OpenAI.
 * Chunks that include `functionCall` parts do **not** forward text to `onTextDelta` (tool round mirrors
 * OpenAI: no first-pass assistant text in the visible stream). Folded response matches `generateContent`
 * shape for {@link extractGeminiFunctionCallsFromResponse} / {@link geminiModelContentForToolFollowUp}.
 */
export async function postGeminiStreamGenerateContentToolFirstPass(
  params: PostGeminiGenerateContentParams & { onTextDelta?: (delta: string) => void },
): Promise<unknown> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:streamGenerateContent` +
    `?key=${encodeURIComponent(params.apiKey)}&alt=sse`;
  const hasTools = (params.functionDeclarations?.length ?? 0) > 0;
  if (!hasTools) {
    throw new Error("postGeminiStreamGenerateContentToolFirstPass requires functionDeclarations");
  }
  const generationConfig: Record<string, unknown> = {
    temperature: params.temperature ?? 0.25,
    maxOutputTokens: params.maxOutputTokens ?? 1600,
  };
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: params.systemInstruction }] },
    contents: params.contents,
    generationConfig,
    tools: [{ functionDeclarations: params.functionDeclarations }],
  };

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    const deliveredChars = { n: 0 };
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: params.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (!isRetryableGeminiHttpStatus(res.status) || attempt >= GEMINI_MAX_ATTEMPTS) {
          throw new GeminiHttpError(res.status, errText);
        }
        logGeminiRetry({
          phase: "streamGenerateContent",
          previousAttempt: attempt,
          status: res.status,
          errorClass: "http",
          detail: "http_status",
        });
        await sleepGeminiRetry(geminiRetryDelayMs(attempt), params.signal);
        continue;
      }

      const { folded } = await readGeminiSseStreamFirstPassToolAware(res, params.onTextDelta, deliveredChars);

      const apiErr = extractGeminiRestErrorEnvelope(folded);
      if (apiErr) {
        if (!isRetryableGeminiHttpStatus(apiErr.code) || attempt >= GEMINI_MAX_ATTEMPTS) {
          throw new GeminiHttpError(apiErr.code, apiErr.message);
        }
        logGeminiRetry({
          phase: "streamGenerateContent",
          previousAttempt: attempt,
          status: apiErr.code,
          errorClass: "http",
          detail: "json_error_envelope",
        });
        await sleepGeminiRetry(geminiRetryDelayMs(attempt), params.signal);
        continue;
      }

      const hasFn = geminiResponseHasFunctionCallParts(folded);
      const text = extractGeminiGenerateContentText(folded).trim();
      if (!hasFn && !text) {
        throw new Error("Gemini stream returned empty assistant content");
      }

      if (attempt > 1) {
        logGeminiRetrySuccess({ phase: "streamGenerateContent", attemptsUsed: attempt });
      }
      return folded;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw e;
      }
      if (e instanceof GeminiHttpError) {
        const canRetryStreamError =
          isRetryableGeminiHttpStatus(e.status) &&
          attempt < GEMINI_MAX_ATTEMPTS &&
          deliveredChars.n === 0;
        if (canRetryStreamError) {
          logGeminiRetry({
            phase: "streamGenerateContent",
            previousAttempt: attempt,
            status: e.status,
            errorClass: "http",
            detail: "retryable_envelope_or_stream",
          });
          await sleepGeminiRetry(geminiRetryDelayMs(attempt), params.signal);
          continue;
        }
        throw e;
      }
      if (e instanceof TypeError && attempt < GEMINI_MAX_ATTEMPTS) {
        logGeminiRetry({
          phase: "streamGenerateContent",
          previousAttempt: attempt,
          status: null,
          errorClass: "network",
        });
        await sleepGeminiRetry(geminiRetryDelayMs(attempt), params.signal);
        continue;
      }
      throw e;
    }
  }

  throw new Error("Gemini stream: retries exhausted");
}

/** Parses one SSE line from `streamGenerateContent?alt=sse`. Returns parsed JSON or null. */
export function parseGeminiSseDataLine(line: string): unknown | null {
  const trimmed = line.replace(/\r$/, "");
  if (!trimmed.startsWith("data: ")) return null;
  const payload = trimmed.slice(6).trim();
  if (payload.length === 0 || payload === "[DONE]") return null;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

async function readGeminiSseStreamToText(
  res: Response,
  onTextDelta: (delta: string) => void,
  deliveredChars: { n: number },
): Promise<string> {
  if (!res.body) {
    throw new Error("Gemini stream has no body");
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder("utf-8", { fatal: false });
  let lineBuf = "";
  let accumulated = "";

  const emitDelta = (delta: string) => {
    if (delta.length > 0) {
      deliveredChars.n += delta.length;
      onTextDelta(delta);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      lineBuf += dec.decode(value, { stream: !done });
    }
    if (done) {
      lineBuf += dec.decode();
    }

    while (lineBuf.length > 0) {
      const n = lineBuf.indexOf("\n");
      if (n < 0) break;
      const line = lineBuf.slice(0, n).replace(/\r$/, "");
      lineBuf = lineBuf.slice(n + 1);

      const parsed = parseGeminiSseDataLine(line);
      if (parsed == null) continue;

      const { delta, newFull } = mergeGeminiStreamingTextChunk(accumulated, parsed);
      accumulated = newFull;
      emitDelta(delta);
    }

    if (done) {
      if (lineBuf.length > 0) {
        const parsed = parseGeminiSseDataLine(lineBuf.replace(/\r$/, ""));
        if (parsed != null) {
          const { delta, newFull } = mergeGeminiStreamingTextChunk(accumulated, parsed);
          accumulated = newFull;
          emitDelta(delta);
        }
      }
      break;
    }
  }

  const text = accumulated.trim();
  if (!text) {
    throw new Error("Gemini stream returned empty text content");
  }
  return text;
}

/**
 * Reads Gemini `streamGenerateContent` (`alt=sse`) and forwards **model text deltas** to `onTextDelta`.
 * Returns the full concatenated model text (same as a non-streaming `generateContent` body would yield).
 * Retries on retryable HTTP status, network errors, HTTP 200 + JSON error envelope, and SSE chunks with a retryable
 * `error.code` when no text deltas have been delivered yet (avoids duplicating partial output).
 */
export async function postGeminiStreamGenerateContentJson(params: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  contents: GeminiContent[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  onTextDelta: (delta: string) => void;
}): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:streamGenerateContent` +
    `?key=${encodeURIComponent(params.apiKey)}&alt=sse`;
  const body = {
    systemInstruction: { parts: [{ text: params.systemInstruction }] },
    contents: params.contents,
    generationConfig: {
      temperature: params.temperature ?? 0.25,
      maxOutputTokens: params.maxOutputTokens ?? 1600,
      responseMimeType: "application/json",
    },
  };

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    const deliveredChars = { n: 0 };
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: params.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        if (!isRetryableGeminiHttpStatus(res.status) || attempt >= GEMINI_MAX_ATTEMPTS) {
          throw new GeminiHttpError(res.status, errText);
        }
        logGeminiRetry({
          phase: "streamGenerateContent",
          previousAttempt: attempt,
          status: res.status,
          errorClass: "http",
          detail: "http_status",
        });
        await sleepGeminiRetry(geminiRetryDelayMs(attempt), params.signal);
        continue;
      }

      const out = await readGeminiSseStreamToText(res, params.onTextDelta, deliveredChars);
      if (attempt > 1) {
        logGeminiRetrySuccess({ phase: "streamGenerateContent", attemptsUsed: attempt });
      }
      return out;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw e;
      }
      if (e instanceof GeminiHttpError) {
        const canRetryStreamError =
          isRetryableGeminiHttpStatus(e.status) &&
          attempt < GEMINI_MAX_ATTEMPTS &&
          deliveredChars.n === 0;
        if (canRetryStreamError) {
          logGeminiRetry({
            phase: "streamGenerateContent",
            previousAttempt: attempt,
            status: e.status,
            errorClass: "http",
            detail: "retryable_envelope_or_stream",
          });
          await sleepGeminiRetry(geminiRetryDelayMs(attempt), params.signal);
          continue;
        }
        throw e;
      }
      if (e instanceof TypeError && attempt < GEMINI_MAX_ATTEMPTS) {
        logGeminiRetry({
          phase: "streamGenerateContent",
          previousAttempt: attempt,
          status: null,
          errorClass: "network",
        });
        await sleepGeminiRetry(geminiRetryDelayMs(attempt), params.signal);
        continue;
      }
      throw e;
    }
  }

  throw new Error("Gemini stream: retries exhausted");
}

export async function postGeminiGenerateContentJson(params: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  contents: GeminiContent[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const json = await postGeminiGenerateContentRaw(params);
  const text = extractGeminiGenerateContentText(json).trim();
  if (!text) {
    throw new Error("Gemini returned empty text content");
  }
  return text;
}
