import type { NormalizedCancellationRule } from "./types";

export function matchCancellationRule(
  rules: NormalizedCancellationRule[],
  remainingMinutes: number,
): NormalizedCancellationRule | null {
  return (
    [...rules]
      .sort(
        (left, right) =>
          right.minimumMinutesBeforeTrip - left.minimumMinutesBeforeTrip,
      )
      .find((rule) => remainingMinutes >= rule.minimumMinutesBeforeTrip) ?? null
  );
}
