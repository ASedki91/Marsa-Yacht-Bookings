import { describe, expect, it } from "vitest";
import { matchCancellationRule } from "./matchRule";

const rules = [
  { id: "48-hours", minimumMinutesBeforeTrip: 2_880, feePercentage: "5.00" },
  { id: "24-hours", minimumMinutesBeforeTrip: 1_440, feePercentage: "20.00" },
  { id: "catch-all", minimumMinutesBeforeTrip: 0, feePercentage: "50.00" },
];

describe("matchCancellationRule", () => {
  it.each([
    [2_881, "48-hours"],
    [2_880, "48-hours"],
    [2_879, "24-hours"],
    [1_440, "24-hours"],
    [1_439, "catch-all"],
    [0, "catch-all"],
  ])("matches %i remaining minutes to %s", (remainingMinutes, expectedId) => {
    expect(matchCancellationRule(rules, remainingMinutes)?.id).toBe(expectedId);
  });

  it("returns null after the trip has started", () => {
    expect(matchCancellationRule(rules, -1)).toBeNull();
  });

  it("does not depend on storage order", () => {
    expect(matchCancellationRule([...rules].reverse(), 3_000)?.id).toBe(
      "48-hours",
    );
  });
});
