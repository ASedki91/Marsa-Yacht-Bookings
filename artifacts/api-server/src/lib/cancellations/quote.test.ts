import type { Booking, BookingCancellationTerms } from "@workspace/db";
import { describe, expect, it } from "vitest";
import { calculateCancellationQuote } from "./quote";

const booking = {
  id: "booking-1",
  bookingDate: "2026-08-10",
  startTime: "12:00:00",
  totalAmountEgp: "1000.00",
} as Booking;

const terms = {
  policyId: "policy-1",
  policyVersion: 3,
  policyName: "Standard",
  tripStartsAt: new Date("2026-08-10T09:00:00.000Z"),
  timeZone: "Africa/Cairo",
  rulesSnapshot: [
    {
      id: "48-hours",
      minimumMinutesBeforeTrip: 2_880,
      feePercentage: "5.00",
    },
    {
      id: "catch-all",
      minimumMinutesBeforeTrip: 0,
      feePercentage: "50.00",
    },
  ],
} as BookingCancellationTerms;

describe("calculateCancellationQuote", () => {
  it("uses the immutable policy snapshot at exact boundaries", () => {
    const quote = calculateCancellationQuote(
      booking,
      terms,
      new Date("2026-08-08T09:00:00.000Z"),
    );

    expect(quote).toMatchObject({
      matchedRuleId: "48-hours",
      remainingMinutes: 2_880,
      feePercentage: "5.00",
      originalAmountEgp: "1000.00",
      feeAmountEgp: "50.00",
      refundAmountEgp: "950.00",
      manualReviewRequired: false,
    });
  });

  it("marks legacy bookings without a policy snapshot for manual review", () => {
    const quote = calculateCancellationQuote(
      booking,
      null,
      new Date("2026-08-08T09:00:00.000Z"),
    );

    expect(quote).toMatchObject({
      matchedRuleId: null,
      feePercentage: null,
      feeAmountEgp: null,
      refundAmountEgp: null,
      manualReviewRequired: true,
    });
  });

  it("rejects cancellation after the trip starts", () => {
    expect(() =>
      calculateCancellationQuote(
        booking,
        terms,
        new Date("2026-08-10T09:00:01.000Z"),
      ),
    ).toThrow("Booking can no longer be cancelled");
  });
});
