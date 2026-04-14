import { describe, expect, it } from "vitest";
import { A5_MINI_CLASSIFIER_TRUNCATE_MARKER } from "./a5MiniClassifierBudget.ts";
import {
  MATCHMAKER_MAX_INBOUND_CHARS,
  MATCHMAKER_MAX_ROSTER_JSON_CHARS,
  truncateMatchmakerInboundMessage,
  truncateMatchmakerRosterJson,
} from "./matchmakerA5Budget.ts";

describe("matchmakerA5Budget", () => {
  it("caps inbound message", () => {
    const long = "m".repeat(MATCHMAKER_MAX_INBOUND_CHARS + 50);
    const out = truncateMatchmakerInboundMessage(long);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("caps roster JSON string", () => {
    const long = JSON.stringify({ rows: "r".repeat(MATCHMAKER_MAX_ROSTER_JSON_CHARS + 50) });
    const out = truncateMatchmakerRosterJson(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });
});
