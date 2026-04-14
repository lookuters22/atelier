import { describe, expect, it } from "vitest";
import { buildAuthorizedCaseExceptionActiveWindowOrFilter } from "./fetchAuthorizedCaseExceptionsForDecisionContext.ts";

describe("buildAuthorizedCaseExceptionActiveWindowOrFilter", () => {
  it("double-quotes the ISO timestamp so PostgREST does not split on millisecond dots", () => {
    const now = "2026-04-09T17:36:40.896Z";
    expect(buildAuthorizedCaseExceptionActiveWindowOrFilter(now)).toBe(
      `effective_until.is.null,effective_until.gt."${now}"`,
    );
  });
});
