import { describe, expect, it } from "vitest";
import { listOfferPuckBlockTypesForAssistant, summarizeOfferPuckDataForAssistant } from "./offerPuckAssistantSummary.ts";

describe("offerPuckAssistantSummary", () => {
  it("summarizes document title, block counts, and PricingTier lines", () => {
    const s = summarizeOfferPuckDataForAssistant({
      root: { props: { title: "2026 menu" } },
      content: [
        {
          type: "PricingTier",
          props: { tierName: "Gold", price: "$3k", features: [{ text: "8h" }, { text: "Album" }] },
        },
        { type: "SplitBlock", props: { body: "Why us" } },
      ],
    });
    expect(s).toContain("2026 menu");
    expect(s).toMatch(/Gold|\$3k/);
    expect(s).toMatch(/Split section|Why us/);
  });

  it("listOfferPuckBlockTypesForAssistant returns types in order", () => {
    const t = listOfferPuckBlockTypesForAssistant({
      root: { props: {} },
      content: [{ type: "CoverImage", props: {} }, { type: "StatementBlock", props: { body: "Hi" } }],
    });
    expect(t).toEqual(["CoverImage", "StatementBlock"]);
  });

  it("returns placeholder when data is not an object", () => {
    expect(summarizeOfferPuckDataForAssistant(null)).toMatch(/no offer document/);
  });
});
