import { describe, expect, it } from "vitest";
import type { AgentContext } from "../../../../src/types/agent.types.ts";
import {
  buildDecisionContextRetrievalTrace,
  decideGlobalKnowledgeBaseQuery,
} from "./gateGlobalKnowledgeRetrievalForDecisionContext.ts";

const mem = (id: string): AgentContext["selectedMemories"][number] => ({
  id,
  type: "note",
  title: "t",
  summary: "s",
  full_content: "c",
});

describe("decideGlobalKnowledgeBaseQuery", () => {
  it("skips empty turns", () => {
    const r = decideGlobalKnowledgeBaseQuery({
      rawMessage: "   ",
      threadSummary: null,
      replyChannel: "email",
      promotedMemoryIds: [],
    });
    expect(r.queryKnowledgeBase).toBe(false);
    expect(r.gateDetail).toBe("skipped_empty_turn");
  });

  it("skips ack-only short replies", () => {
    const r = decideGlobalKnowledgeBaseQuery({
      rawMessage: "Thanks!",
      threadSummary: null,
      replyChannel: "email",
      promotedMemoryIds: [],
    });
    expect(r.queryKnowledgeBase).toBe(false);
    expect(r.gateDetail).toBe("skipped_ack_only");
  });

  it("queries when case-memory ids were promoted", () => {
    const r = decideGlobalKnowledgeBaseQuery({
      rawMessage: "ok",
      threadSummary: null,
      replyChannel: "email",
      promotedMemoryIds: ["mem-1"],
    });
    expect(r.queryKnowledgeBase).toBe(true);
    expect(r.gateDetail).toBe("query_memory_promotion");
  });

  it("queries on trigger lexicon (e.g. contract)", () => {
    const r = decideGlobalKnowledgeBaseQuery({
      rawMessage: "Please send the contract for review.",
      threadSummary: null,
      replyChannel: "email",
      promotedMemoryIds: [],
    });
    expect(r.queryKnowledgeBase).toBe(true);
    expect(r.gateDetail).toBe("query_trigger_lexicon");
  });

  it("queries substantive turns without triggers when token count is high", () => {
    const r = decideGlobalKnowledgeBaseQuery({
      rawMessage:
        "We are finalizing logistics for Saturday family portraits before cocktail hour ends",
      threadSummary: null,
      replyChannel: "email",
      promotedMemoryIds: [],
    });
    expect(r.queryKnowledgeBase).toBe(true);
    expect(r.gateDetail).toBe("query_substantive_turn");
  });

  it("skips vague short turns with no triggers", () => {
    const r = decideGlobalKnowledgeBaseQuery({
      rawMessage: "how are you",
      threadSummary: null,
      replyChannel: "email",
      promotedMemoryIds: [],
    });
    expect(r.queryKnowledgeBase).toBe(false);
    expect(r.gateDetail).toBe("skipped_no_heuristic_signal");
  });

  it("queries whatsapp with minimal tokens (channel signal)", () => {
    const r = decideGlobalKnowledgeBaseQuery({
      rawMessage: "running late today",
      threadSummary: null,
      replyChannel: "whatsapp",
      promotedMemoryIds: [],
    });
    expect(r.queryKnowledgeBase).toBe(true);
    expect(r.gateDetail).toBe("query_whatsapp_channel");
  });

  it("honors qa bypass", () => {
    const r = decideGlobalKnowledgeBaseQuery({
      rawMessage: "hi",
      threadSummary: null,
      replyChannel: "email",
      promotedMemoryIds: [],
      qaBypassGate: true,
    });
    expect(r.queryKnowledgeBase).toBe(true);
    expect(r.gateDetail).toBe("qa_bypass");
  });
});

describe("buildDecisionContextRetrievalTrace", () => {
  it("records memory ids, counts, and global KB ids; marks skipped fetch", () => {
    const gate = decideGlobalKnowledgeBaseQuery({
      rawMessage: "thanks",
      threadSummary: null,
      replyChannel: "email",
      promotedMemoryIds: [],
    });
    const trace = buildDecisionContextRetrievalTrace({
      selectedMemoryIdsResolved: ["a", "b"],
      selectedMemories: [mem("a"), mem("b")],
      globalKnowledge: [],
      gate,
    });
    expect(trace.selectedMemoryIdsResolved).toEqual(["a", "b"]);
    expect(trace.selectedMemoriesLoadedCount).toBe(2);
    expect(trace.globalKnowledgeFetch).toBe("skipped_by_gate");
    expect(trace.globalKnowledgeLoadedCount).toBe(0);
    expect(trace.globalKnowledgeIdsLoaded).toEqual([]);
    expect(trace.globalKnowledgeGateDetail).toBe("skipped_ack_only");
  });

  it("extracts global knowledge ids from rows", () => {
    const gate = decideGlobalKnowledgeBaseQuery({
      rawMessage: "What is your retainer policy?",
      threadSummary: null,
      replyChannel: "email",
      promotedMemoryIds: [],
    });
    expect(gate.queryKnowledgeBase).toBe(true);
    const trace = buildDecisionContextRetrievalTrace({
      selectedMemoryIdsResolved: [],
      selectedMemories: [],
      globalKnowledge: [{ id: "gk-1", content: "x" }],
      gate,
    });
    expect(trace.globalKnowledgeFetch).toBe("queried");
    expect(trace.globalKnowledgeIdsLoaded).toEqual(["gk-1"]);
    expect(trace.globalKnowledgeLoadedCount).toBe(1);
  });
});
