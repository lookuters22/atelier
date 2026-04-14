import { describe, expect, it } from "vitest";
import { A5_MINI_CLASSIFIER_TRUNCATE_MARKER } from "./a5MiniClassifierBudget.ts";
import {
  LOGISTICS_MAX_CLIENT_MESSAGE_CHARS,
  LOGISTICS_MAX_LOCATION_CHARS,
  truncateLogisticsClientMessage,
  truncateLogisticsLocation,
  truncateLogisticsToolOutput,
} from "./logisticsA5Budget.ts";

describe("logisticsA5Budget", () => {
  it("caps location in system prompt", () => {
    const long = "L".repeat(LOGISTICS_MAX_LOCATION_CHARS + 50);
    const out = truncateLogisticsLocation(long);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("caps client message", () => {
    const long = "m".repeat(LOGISTICS_MAX_CLIENT_MESSAGE_CHARS + 50);
    const out = truncateLogisticsClientMessage(long);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });

  it("caps tool output", () => {
    const long = JSON.stringify({ estimate: "z".repeat(20000) });
    const out = truncateLogisticsToolOutput(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain(A5_MINI_CLASSIFIER_TRUNCATE_MARKER);
  });
});
