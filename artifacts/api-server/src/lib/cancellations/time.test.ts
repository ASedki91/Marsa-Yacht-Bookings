import { describe, expect, it } from "vitest";
import { remainingWholeMinutes, tripStartToUtc } from "./time";

describe("cancellation time helpers", () => {
  it("converts an Africa/Cairo winter wall-clock time to UTC", () => {
    expect(
      tripStartToUtc("2026-01-15", "12:30:00", "Africa/Cairo").toISOString(),
    ).toBe("2026-01-15T10:30:00.000Z");
  });

  it("rejects invalid time zones and nonexistent local times", () => {
    expect(() =>
      tripStartToUtc("2026-01-15", "12:30", "Not/A_Time_Zone"),
    ).toThrow("Invalid IANA time zone");
    expect(() =>
      tripStartToUtc("2026-03-08", "02:30", "America/New_York"),
    ).toThrow("Trip time does not exist");
  });

  it("floors remaining time so policy boundaries are deterministic", () => {
    const trip = new Date("2026-08-01T12:00:00.000Z");
    expect(
      remainingWholeMinutes(trip, new Date("2026-08-01T10:59:00.001Z")),
    ).toBe(60);
  });
});
