import { describe, expect, it, vi, afterEach } from "vitest";
import {
  extractGeminiFunctionCallsFromResponse,
  extractGeminiGenerateContentText,
  extractGeminiRestErrorEnvelope,
  foldGeminiStreamChunksForFirstPass,
  geminiResponseHasFunctionCallParts,
  GeminiHttpError,
  isRetryableGeminiHttpStatus,
  mergeGeminiStreamingTextChunk,
  parseGeminiSseDataLine,
  postGeminiGenerateContentJson,
  postGeminiGenerateContentRaw,
  postGeminiStreamGenerateContentJson,
  postGeminiStreamGenerateContentToolFirstPass,
  splitSystemAndGeminiContents,
} from "./operatorStudioAssistantGemini.ts";

describe("splitSystemAndGeminiContents", () => {
  it("maps system + user/model turns", () => {
    const { systemInstruction, contents } = splitSystemAndGeminiContents([
      { role: "system", content: "SYS" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
    ]);
    expect(systemInstruction).toBe("SYS");
    expect(contents).toEqual([
      { role: "user", parts: [{ text: "u1" }] },
      { role: "model", parts: [{ text: "a1" }] },
      { role: "user", parts: [{ text: "u2" }] },
    ]);
  });

  it("rejects tool messages", () => {
    expect(() =>
      splitSystemAndGeminiContents([
        { role: "system", content: "S" },
        { role: "user", content: "u" },
        { role: "tool", tool_call_id: "x", content: "{}" },
      ]),
    ).toThrow(/Operator Ana \(Gemini\).*tool messages/);
  });
});

describe("Gemini function-call helpers", () => {
  it("extractGeminiFunctionCallsFromResponse preserves order and args", () => {
    const calls = extractGeminiFunctionCallsFromResponse({
      candidates: [
        {
          content: {
            parts: [
              { functionCall: { name: "operator_lookup_projects", args: { query: "a" } } },
              { functionCall: { name: "operator_lookup_project_details", args: { projectId: "u1" } } },
            ],
          },
        },
      ],
    });
    expect(calls).toEqual([
      { name: "operator_lookup_projects", args: { query: "a" } },
      { name: "operator_lookup_project_details", args: { projectId: "u1" } },
    ]);
  });

  it("geminiResponseHasFunctionCallParts detects functionCall parts only", () => {
    expect(
      geminiResponseHasFunctionCallParts({
        candidates: [{ content: { parts: [{ text: "{}" }] } }],
      }),
    ).toBe(false);
    expect(
      geminiResponseHasFunctionCallParts({
        candidates: [{ content: { parts: [{ functionCall: { name: "x", args: {} } }] } }],
      }),
    ).toBe(true);
  });
});

describe("extractGeminiGenerateContentText", () => {
  it("concatenates text parts from the first candidate", () => {
    const t = extractGeminiGenerateContentText({
      candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] } }],
    });
    expect(t).toBe('{"a":1}');
  });

  it("returns empty string when no candidates", () => {
    expect(extractGeminiGenerateContentText({ candidates: [] })).toBe("");
  });
});

describe("mergeGeminiStreamingTextChunk", () => {
  const chunk = (text: string) => ({
    candidates: [{ content: { parts: [{ text }] } }],
  });

  it("appends when new text is not a prefix extension (incremental deltas)", () => {
    expect(mergeGeminiStreamingTextChunk("", chunk("ab"))).toEqual({ delta: "ab", newFull: "ab" });
    expect(mergeGeminiStreamingTextChunk("ab", chunk("cd"))).toEqual({ delta: "cd", newFull: "abcd" });
  });

  it("emits only the suffix when API sends cumulative prefix-growing text", () => {
    expect(mergeGeminiStreamingTextChunk("hello", chunk("hello world"))).toEqual({
      delta: " world",
      newFull: "hello world",
    });
  });

  it("throws on error field in chunk", () => {
    expect(() => mergeGeminiStreamingTextChunk("", { error: { message: "quota" } })).toThrow(/quota/);
  });

  it("throws GeminiHttpError when chunk has REST error envelope with numeric code", () => {
    expect(() =>
      mergeGeminiStreamingTextChunk("", {
        error: { code: 503, message: "overloaded", status: "UNAVAILABLE" },
      }),
    ).toThrow(GeminiHttpError);
  });
});

describe("extractGeminiRestErrorEnvelope", () => {
  it("parses Google-style error object", () => {
    expect(
      extractGeminiRestErrorEnvelope({
        error: { code: 503, message: "UNAVAILABLE", status: "UNAVAILABLE" },
      }),
    ).toEqual({ code: 503, message: "UNAVAILABLE" });
  });

  it("returns null when no error", () => {
    expect(extractGeminiRestErrorEnvelope({ candidates: [] })).toBeNull();
  });
});

describe("isRetryableGeminiHttpStatus", () => {
  it("includes transient overload / gateway codes", () => {
    expect(isRetryableGeminiHttpStatus(429)).toBe(true);
    expect(isRetryableGeminiHttpStatus(500)).toBe(true);
    expect(isRetryableGeminiHttpStatus(503)).toBe(true);
    expect(isRetryableGeminiHttpStatus(502)).toBe(true);
    expect(isRetryableGeminiHttpStatus(504)).toBe(true);
  });

  it("excludes non-retryable client errors", () => {
    expect(isRetryableGeminiHttpStatus(400)).toBe(false);
    expect(isRetryableGeminiHttpStatus(401)).toBe(false);
    expect(isRetryableGeminiHttpStatus(403)).toBe(false);
  });
});

describe("postGeminiGenerateContentJson retries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retries on 503 then succeeds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const okJson = {
      candidates: [{ content: { parts: [{ text: '{"reply":"x","proposedActions":[]}' }] } }],
    };
    let n = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      n++;
      if (n === 1) return Promise.resolve(new Response("high demand temporary", { status: 503 }));
      return Promise.resolve(
        new Response(JSON.stringify(okJson), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = postGeminiGenerateContentJson({
      apiKey: "k",
      model: "m",
      systemInstruction: "s",
      contents: [{ role: "user", parts: [{ text: "u" }] }],
    });
    await vi.runAllTimersAsync();
    const out = await p;
    expect(out).toContain("reply");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 then succeeds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const okJson = { candidates: [{ content: { parts: [{ text: '{"reply":"r","proposedActions":[]}' }] } }] };
    let n = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      n++;
      if (n === 1) return Promise.resolve(new Response("rate limit", { status: 429 }));
      return Promise.resolve(new Response(JSON.stringify(okJson), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = postGeminiGenerateContentJson({
      apiKey: "k",
      model: "m",
      systemInstruction: "s",
      contents: [{ role: "user", parts: [{ text: "u" }] }],
    });
    await vi.runAllTimersAsync();
    await p;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad request body", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postGeminiGenerateContentJson({
        apiKey: "k",
        model: "m",
        systemInstruction: "s",
        contents: [{ role: "user", parts: [{ text: "u" }] }],
      }),
    ).rejects.toThrow(GeminiHttpError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries when HTTP 200 body is JSON error envelope 503 then succeeds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const okJson = {
      candidates: [{ content: { parts: [{ text: '{"reply":"x","proposedActions":[]}' }] } }],
    };
    let n = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      n++;
      if (n === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: 503, message: "The model is overloaded", status: "UNAVAILABLE" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify(okJson), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = postGeminiGenerateContentJson({
      apiKey: "k",
      model: "m",
      systemInstruction: "s",
      contents: [{ role: "user", parts: [{ text: "u" }] }],
    });
    await vi.runAllTimersAsync();
    const out = await p;
    expect(out).toContain("reply");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry JSON error envelope 400", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 400, message: "bad", status: "INVALID_ARGUMENT" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postGeminiGenerateContentJson({
        apiKey: "k",
        model: "m",
        systemInstruction: "s",
        contents: [{ role: "user", parts: [{ text: "u" }] }],
      }),
    ).rejects.toThrow(GeminiHttpError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws GeminiHttpError after retries exhausted on repeated 503", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response("still overloaded", { status: 503 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const p = postGeminiGenerateContentJson({
      apiKey: "k",
      model: "m",
      systemInstruction: "s",
      contents: [{ role: "user", parts: [{ text: "u" }] }],
    });
    const assertRejected = expect(p).rejects.toThrow(GeminiHttpError);
    await vi.runAllTimersAsync();
    await assertRejected;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("postGeminiGenerateContentRaw with functionDeclarations sends tools and omits responseMimeType", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: "model",
                parts: [{ functionCall: { name: "operator_lookup_projects", args: { query: "q" } } }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const raw = await postGeminiGenerateContentRaw({
      apiKey: "k",
      model: "gemini-2.5-flash",
      systemInstruction: "sys",
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      functionDeclarations: [{ name: "operator_lookup_projects", description: "d", parameters: { type: "object" } }],
    });
    expect(extractGeminiGenerateContentText(raw as object)).toBe("");
    expect(extractGeminiFunctionCallsFromResponse(raw)).toHaveLength(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      tools: unknown[];
      generationConfig: Record<string, unknown>;
    };
    expect(body.tools).toHaveLength(1);
    expect(body.generationConfig.responseMimeType).toBeUndefined();
  });
});

describe("foldGeminiStreamChunksForFirstPass", () => {
  it("merges incremental text chunks into one part", () => {
    const folded = foldGeminiStreamChunksForFirstPass([
      { candidates: [{ content: { parts: [{ text: '{"a":' }] } }] },
      { candidates: [{ content: { parts: [{ text: '1}' }] } }] },
    ]);
    expect(extractGeminiGenerateContentText(folded)).toBe('{"a":1}');
    expect(geminiResponseHasFunctionCallParts(folded)).toBe(false);
  });

  it("preserves text then functionCall parts for tool follow-up shape", () => {
    const folded = foldGeminiStreamChunksForFirstPass([
      { candidates: [{ content: { parts: [{ text: "hi" }] } }] },
      {
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "operator_lookup_projects", args: { query: "z" } } }],
            },
          },
        ],
      },
    ]);
    expect(extractGeminiGenerateContentText(folded)).toBe("hi");
    expect(geminiResponseHasFunctionCallParts(folded)).toBe(true);
    expect(extractGeminiFunctionCallsFromResponse(folded)[0]!.name).toBe("operator_lookup_projects");
  });
});

describe("postGeminiStreamGenerateContentToolFirstPass", () => {
  const te = new TextEncoder();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards text SSE deltas when the folded response has no function calls", async () => {
    const raw = JSON.stringify({ reply: "r", proposedActions: [] });
    const mid = Math.max(1, Math.floor(raw.length / 2));
    const pieces = [raw.slice(0, mid), raw.slice(mid)];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            for (const text of pieces) {
              c.enqueue(
                te.encode(
                  "data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }) + "\n",
                ),
              );
            }
            c.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const deltas: string[] = [];
    const folded = await postGeminiStreamGenerateContentToolFirstPass({
      apiKey: "k",
      model: "gemini-2.5-flash",
      systemInstruction: "s",
      contents: [{ role: "user", parts: [{ text: "u" }] }],
      functionDeclarations: [{ name: "operator_lookup_projects", parameters: { type: "object" } }],
      onTextDelta: (d) => deltas.push(d),
    });
    expect(geminiResponseHasFunctionCallParts(folded)).toBe(false);
    expect(extractGeminiGenerateContentText(folded).trim()).toBe(raw);
    expect(deltas.join("")).toBe(raw);
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      tools: unknown[];
      generationConfig: Record<string, unknown>;
    };
    expect(body.tools).toHaveLength(1);
    expect(body.generationConfig.responseMimeType).toBeUndefined();
  });

  it("does not invoke onTextDelta for functionCall-only SSE", async () => {
    const line =
      "data: " +
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "operator_lookup_projects", args: { query: "a" } } }],
            },
          },
        ],
      }) +
      "\n";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(te.encode(line));
            c.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const deltas: string[] = [];
    const folded = await postGeminiStreamGenerateContentToolFirstPass({
      apiKey: "k",
      model: "m",
      systemInstruction: "s",
      contents: [{ role: "user", parts: [{ text: "u" }] }],
      functionDeclarations: [{ name: "operator_lookup_projects", parameters: { type: "object" } }],
      onTextDelta: (d) => deltas.push(d),
    });
    expect(deltas).toEqual([]);
    expect(extractGeminiFunctionCallsFromResponse(folded).length).toBe(1);
  });
});

describe("parseGeminiSseDataLine", () => {
  it("parses data JSON lines", () => {
    const j = parseGeminiSseDataLine('data: {"candidates":[]}');
    expect(j).toEqual({ candidates: [] });
  });

  it("returns null for non-data lines and [DONE]", () => {
    expect(parseGeminiSseDataLine(": ping")).toBeNull();
    expect(parseGeminiSseDataLine("data: [DONE]")).toBeNull();
  });
});

describe("postGeminiStreamGenerateContentJson", () => {
  const te = new TextEncoder();
  function geminiSseLines(textPieces: string[]) {
    return textPieces.map((text) => {
      const obj = { candidates: [{ content: { parts: [{ text }] } }] };
      return te.encode("data: " + JSON.stringify(obj) + "\n");
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("streams deltas and returns full JSON for final parse", async () => {
    const finalObj = { reply: "Stream ok", proposedActions: [] as unknown[] };
    const raw = JSON.stringify(finalObj);
    const mid = Math.max(1, Math.floor(raw.length / 2));
    const pieces = [raw.slice(0, mid), raw.slice(mid)];
    const enc = geminiSseLines(pieces);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            for (const e of enc) c.enqueue(e);
            c.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const deltas: string[] = [];
    const full = await postGeminiStreamGenerateContentJson({
      apiKey: "k",
      model: "gemini-2.5-flash",
      systemInstruction: "sys",
      contents: [{ role: "user", parts: [{ text: "u" }] }],
      onTextDelta: (d) => deltas.push(d),
    });

    expect(full).toBe(raw);
    expect(deltas.join("")).toBe(raw);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String((fetchMock.mock.calls[0] as [string, RequestInit])[0]);
    expect(url).toContain(":streamGenerateContent");
    expect(url).toContain("alt=sse");
    expect(url).toContain("key=k");
  });

  it("retries initial fetch on 503 then streams SSE", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const raw = JSON.stringify({ reply: "after retry", proposedActions: [] });
    const line =
      "data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text: raw }] } }] }) + "\n";
    let n = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      n++;
      if (n === 1) return Promise.resolve(new Response("high demand", { status: 503 }));
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(line));
              c.close();
            },
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = postGeminiStreamGenerateContentJson({
      apiKey: "k",
      model: "gemini-2.5-flash",
      systemInstruction: "sys",
      contents: [{ role: "user", parts: [{ text: "u" }] }],
      onTextDelta: () => {},
    });
    await vi.runAllTimersAsync();
    const out = await p;
    expect(out).toBe(raw);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries when HTTP 200 SSE first chunk is error envelope 503 then succeeds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const raw = JSON.stringify({ reply: "recovered", proposedActions: [] });
    const okLine =
      "data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text: raw }] } }] }) + "\n";
    const errLine =
      "data: " +
      JSON.stringify({
        error: { code: 503, message: "The model is overloaded", status: "UNAVAILABLE" },
      }) +
      "\n";
    let n = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      n++;
      if (n === 1) {
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode(errLine));
                c.close();
              },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(okLine));
              c.close();
            },
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const p = postGeminiStreamGenerateContentJson({
      apiKey: "k",
      model: "gemini-2.5-flash",
      systemInstruction: "sys",
      contents: [{ role: "user", parts: [{ text: "u" }] }],
      onTextDelta: () => {},
    });
    await vi.runAllTimersAsync();
    const out = await p;
    expect(out).toBe(raw);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry SSE error envelope 400", async () => {
    const errLine =
      "data: " +
      JSON.stringify({ error: { code: 400, message: "bad", status: "INVALID_ARGUMENT" } }) +
      "\n";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode(errLine));
            c.close();
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postGeminiStreamGenerateContentJson({
        apiKey: "k",
        model: "gemini-2.5-flash",
        systemInstruction: "sys",
        contents: [{ role: "user", parts: [{ text: "u" }] }],
        onTextDelta: () => {},
      }),
    ).rejects.toThrow(GeminiHttpError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
