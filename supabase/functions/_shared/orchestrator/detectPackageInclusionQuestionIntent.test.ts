import { describe, expect, it } from "vitest";
import { detectPackageInclusionQuestionIntent } from "./detectPackageInclusionQuestionIntent.ts";

describe("detectPackageInclusionQuestionIntent", () => {
  describe("travel_inclusion", () => {
    it("matches direct: are flights included", () => {
      expect(detectPackageInclusionQuestionIntent("Are flights included in our package?")).toBe(
        "travel_inclusion",
      );
    });

    it("matches direct: is travel included", () => {
      expect(detectPackageInclusionQuestionIntent("Is travel included or billed separately?")).toBe(
        "travel_inclusion",
      );
    });

    it("matches topic + inclusion in same sentence", () => {
      expect(
        detectPackageInclusionQuestionIntent(
          "Does the quote cover hotel nights or are tickets extra?",
        ),
      ).toBe("travel_inclusion");
    });

    it("does not match travel topic without inclusion language or direct phrase", () => {
      expect(detectPackageInclusionQuestionIntent("I will book my flights next week.")).toBe(null);
    });
  });

  describe("second_shooter_inclusion", () => {
    it("matches direct: do we have a second shooter", () => {
      expect(detectPackageInclusionQuestionIntent("Do we have a second shooter for the ceremony?")).toBe(
        "second_shooter_inclusion",
      );
    });

    it("matches direct: do we have a second photographer", () => {
      expect(detectPackageInclusionQuestionIntent("Do we have a second photographer?")).toBe(
        "second_shooter_inclusion",
      );
    });

    it("matches direct: is a 2nd shooter included", () => {
      expect(detectPackageInclusionQuestionIntent("Is a 2nd shooter included?")).toBe("second_shooter_inclusion");
    });

    it("matches direct: are extra shooters included", () => {
      expect(detectPackageInclusionQuestionIntent("Are extra shooters included?")).toBe("second_shooter_inclusion");
    });

    it("matches direct: is a second shooter included", () => {
      expect(detectPackageInclusionQuestionIntent("Is a second shooter included in the collection?")).toBe(
        "second_shooter_inclusion",
      );
    });

    it("matches topic + inclusion same sentence", () => {
      expect(
        detectPackageInclusionQuestionIntent("Is the second photographer included in the fee?"),
      ).toBe("second_shooter_inclusion");
    });
  });

  describe("precedence and negatives", () => {
    it("does not match declarative statement: hotel + included but not an ask", () => {
      expect(
        detectPackageInclusionQuestionIntent(
          "The hotel is included for guests arriving Friday.",
        ),
      ).toBe(null);
    });

    it("prefers travel when both travel and second-shooter signals appear", () => {
      expect(
        detectPackageInclusionQuestionIntent(
          "Are flights included, and do we have a second shooter?",
        ),
      ).toBe("travel_inclusion");
    });

    it("noisy email: flight topic and question mark but unrelated — null", () => {
      const noisy =
        "I still need to book flights for May — can you send the timeline again? " +
        "Also what time is rehearsal?";
      expect(detectPackageInclusionQuestionIntent(noisy)).toBe(null);
    });

    it("noisy email: flights in one sentence, unrelated question with ?", () => {
      expect(
        detectPackageInclusionQuestionIntent(
          "We found cheaper flights on Tuesday.\n" +
            "Can you confirm the deposit is still 30%?",
        ),
      ).toBe(null);
    });

    it("does not match topic + ? alone without inclusion", () => {
      expect(detectPackageInclusionQuestionIntent("Flights?")).toBe(null);
    });
  });
});
