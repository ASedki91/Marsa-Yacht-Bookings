import type { Booking, BookingCancellationTerms } from "@workspace/db";
import { egpToPiasters, percentageOfPiasters, piastersToEgp } from "../money";
import { matchCancellationRule } from "./matchRule";
import { remainingWholeMinutes, tripStartToUtc } from "./time";
import type { CancellationQuote } from "./types";

export function calculateCancellationQuote(
  booking: Booking,
  terms: BookingCancellationTerms | null,
  requestedAt = new Date(),
): CancellationQuote {
  const originalPiasters = egpToPiasters(booking.totalAmountEgp);

  if (!terms) {
    const fallbackTimeZone = process.env.DEFAULT_MARKET_TIME_ZONE || "Africa/Cairo";
    const tripStartsAt = tripStartToUtc(
      booking.bookingDate,
      booking.startTime,
      fallbackTimeZone,
    );
    const remainingMinutes = remainingWholeMinutes(tripStartsAt, requestedAt);
    if (remainingMinutes < 0) {
      throw new Error("Booking can no longer be cancelled");
    }
    return {
      bookingId: booking.id,
      tripStartsAt: tripStartsAt.toISOString(),
      requestedAt: requestedAt.toISOString(),
      remainingMinutes,
      matchedRuleId: null,
      feePercentage: null,
      originalAmountEgp: piastersToEgp(originalPiasters),
      feeAmountEgp: null,
      refundAmountEgp: null,
      manualReviewRequired: true,
    };
  }

  const remainingMinutes = remainingWholeMinutes(terms.tripStartsAt, requestedAt);
  const rule = matchCancellationRule(terms.rulesSnapshot, remainingMinutes);
  if (remainingMinutes < 0 || !rule) {
    throw new Error("Booking can no longer be cancelled");
  }

  const feePiasters = percentageOfPiasters(originalPiasters, rule.feePercentage);
  return {
    bookingId: booking.id,
    tripStartsAt: terms.tripStartsAt.toISOString(),
    requestedAt: requestedAt.toISOString(),
    remainingMinutes,
    matchedRuleId: rule.id,
    feePercentage: Number(rule.feePercentage).toFixed(2),
    originalAmountEgp: piastersToEgp(originalPiasters),
    feeAmountEgp: piastersToEgp(feePiasters),
    refundAmountEgp: piastersToEgp(originalPiasters - feePiasters),
    manualReviewRequired: false,
  };
}
