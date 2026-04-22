import { describe, expect, it } from "vitest";
import {
  extractCorpusSearchTokens,
  shouldLoadOperatorCorpusSearchSnapshot,
  shouldProbeMessageBodiesForCorpusSearch,
} from "./operatorCorpusSearchIntent.ts";

describe("operatorCorpusSearchIntent", () => {
  it("extractCorpusSearchTokens strips stopwords and keeps longest substantive tokens", () => {
    expect(extractCorpusSearchTokens("find messages from Danilo about venue pricing", 4)).toEqual([
      "pricing",
      "danilo",
      "venue",
    ]);
  });

  it("shouldLoadOperatorCorpusSearchSnapshot is true for explicit find/search phrasing with tokens", () => {
    expect(shouldLoadOperatorCorpusSearchSnapshot("find anything about split deposits")).toBe(true);
    expect(shouldLoadOperatorCorpusSearchSnapshot("do we already have a rule for net 14 invoices")).toBe(true);
  });

  it("shouldLoadOperatorCorpusSearchSnapshot is false for very short queries", () => {
    expect(shouldLoadOperatorCorpusSearchSnapshot("find x")).toBe(false);
  });

  it("shouldLoadOperatorCorpusSearchSnapshot skips pure weather questions", () => {
    expect(shouldLoadOperatorCorpusSearchSnapshot("what's the weather in Paris tomorrow")).toBe(false);
  });

  it("shouldLoadOperatorCorpusSearchSnapshot skips bare inquiry counts without search substance", () => {
    expect(shouldLoadOperatorCorpusSearchSnapshot("how many inquiries did we get this week")).toBe(false);
  });

  it("shouldProbeMessageBodiesForCorpusSearch is true for discuss / email-about style questions", () => {
    expect(shouldProbeMessageBodiesForCorpusSearch("did we discuss net 14 with them")).toBe(true);
  });
});
