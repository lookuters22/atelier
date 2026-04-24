import { describe, expect, it } from "vitest";
import {
  hasOperatorCalendarContinuityIntent,
  hasOperatorCalendarScheduleIntent,
} from "./operatorAssistantCalendarScheduleIntent";

describe("hasOperatorCalendarContinuityIntent", () => {
  const cfCal = { lastDomain: "calendar" as const, ageSeconds: 10 };

  it("is true for elliptical day follow-ups after a calendar-domain prior turn", () => {
    expect(hasOperatorCalendarContinuityIntent("and friday?", cfCal)).toBe(true);
    // "next week" wording trips primary schedule intent via the `next` content cue — use a day ref only.
    expect(hasOperatorCalendarContinuityIntent("same for saturday?", cfCal)).toBe(true);
    expect(hasOperatorCalendarContinuityIntent("and saturday?", cfCal)).toBe(true);
  });

  it("is false when primary schedule intent already covers the query (continuity is redundant)", () => {
    expect(hasOperatorCalendarContinuityIntent("what about tomorrow?", cfCal)).toBe(false);
  });

  it("is false without calendar lastDomain or when age is stale", () => {
    expect(hasOperatorCalendarContinuityIntent("and friday?", { lastDomain: "projects", ageSeconds: 10 })).toBe(
      false,
    );
    expect(hasOperatorCalendarContinuityIntent("and friday?", { lastDomain: "calendar", ageSeconds: 200 })).toBe(
      false,
    );
  });

  it("is false when primary schedule or thread/inquiry intent wins", () => {
    expect(hasOperatorCalendarContinuityIntent("What's on Friday?", cfCal)).toBe(false);
    expect(hasOperatorCalendarContinuityIntent("did they email friday?", cfCal)).toBe(false);
    expect(
      hasOperatorCalendarContinuityIntent("how many leads came in today?", {
        lastDomain: "calendar",
        ageSeconds: 10,
      }),
    ).toBe(false);
  });
});

describe("hasOperatorCalendarScheduleIntent", () => {
  it("is true for upcoming schedule / what’s on questions", () => {
    expect(hasOperatorCalendarScheduleIntent("What’s on Friday?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("what's next on my calendar?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("Do I have anything on the 26th?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("What’s the next shoot after the Capri wedding?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("Show me upcoming events this week")).toBe(true);
  });

  it("is false for pure calendar UI navigation (no content question)", () => {
    expect(hasOperatorCalendarScheduleIntent("How do I open the calendar?")).toBe(false);
    expect(hasOperatorCalendarScheduleIntent("Where can I find the schedule tab?")).toBe(false);
  });

  it("is true for historical and month/day schedule questions", () => {
    expect(hasOperatorCalendarScheduleIntent("What was on June 14?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("What happened last Thursday on the calendar?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("When did we last have a consultation?")).toBe(true);
  });

  it("is true for named couple / location schedule questions when calendar-related", () => {
    expect(hasOperatorCalendarScheduleIntent("What calendar items do Rita and James have?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("Do we have anything in Capri that week?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("What is scheduled around this wedding?")).toBe(true);
  });

  it("is false for lead/inquiry analytics even with week words (not schedule lookup)", () => {
    expect(
      hasOperatorCalendarScheduleIntent("How many new leads did I receive this week and last week?"),
    ).toBe(false);
  });

  it("is false for lead wording with weekend (still analytics, not schedule)", () => {
    expect(hasOperatorCalendarScheduleIntent("How many leads came in this weekend?")).toBe(false);
  });

  it("is true for weekend and ISO-date schedule questions", () => {
    expect(hasOperatorCalendarScheduleIntent("What's on this weekend?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("Anything on my calendar next weekend?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("Do I have shoots on 2026-08-20?")).toBe(true);
  });

  it("is true for availability phrasing tied to a time hint", () => {
    expect(hasOperatorCalendarScheduleIntent("What's my availability look like on Tuesday?")).toBe(true);
  });

  it("is false for very short input", () => {
    expect(hasOperatorCalendarScheduleIntent("ok")).toBe(false);
  });
});
