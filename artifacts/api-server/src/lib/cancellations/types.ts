import type { CancellationRuleSnapshot } from "@workspace/db";

export interface CancellationQuote {
  bookingId: string;
  tripStartsAt: string;
  requestedAt: string;
  remainingMinutes: number;
  matchedRuleId: string | null;
  feePercentage: string | null;
  originalAmountEgp: string;
  feeAmountEgp: string | null;
  refundAmountEgp: string | null;
  manualReviewRequired: boolean;
}

export type NormalizedCancellationRule = CancellationRuleSnapshot;
