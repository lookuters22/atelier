import { describe, expect, it } from "vitest";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import {
  crmHasPackageInclusion,
  isPackageInclusionItem,
  parsePackageInclusions,
} from "./crmPackageInclusions.ts";

describe("parsePackageInclusions", () => {
  it("returns empty for non-array", () => {
    expect(parsePackageInclusions(undefined)).toEqual([]);
    expect(parsePackageInclusions(null)).toEqual([]);
    expect(parsePackageInclusions({})).toEqual([]);
    expect(parsePackageInclusions("x")).toEqual([]);
  });

  it("keeps known tokens in order and drops unknown", () => {
    expect(
      parsePackageInclusions([
        "second_shooter",
        "bogus",
        "travel_fee_included",
        1,
        null,
        "engagement_session",
      ]),
    ).toEqual(["second_shooter", "travel_fee_included", "engagement_session"]);
  });
});

describe("isPackageInclusionItem", () => {
  it("narrows union members", () => {
    expect(isPackageInclusionItem("second_shooter")).toBe(true);
    expect(isPackageInclusionItem("not_a_token")).toBe(false);
  });
});

describe("crmHasPackageInclusion", () => {
  it("is false for null/undefined and empty snapshot", () => {
    expect(crmHasPackageInclusion(undefined, "second_shooter")).toBe(false);
    expect(crmHasPackageInclusion(null, "second_shooter")).toBe(false);
    expect(crmHasPackageInclusion(emptyCrmSnapshot(), "second_shooter")).toBe(false);
  });

  it("matches membership on package_inclusions", () => {
    const snap = {
      ...emptyCrmSnapshot(),
      package_inclusions: ["second_shooter", "wedding_album"],
    };
    expect(crmHasPackageInclusion(snap, "second_shooter")).toBe(true);
    expect(crmHasPackageInclusion(snap, "travel_fee_included")).toBe(false);
  });
});
