const DECIMAL_PATTERN = /^\d+(?:\.\d{1,2})?$/;

export function egpToPiasters(value: string | number): number {
  const normalized = typeof value === "number" ? value.toFixed(2) : value.trim();
  if (!DECIMAL_PATTERN.test(normalized)) {
    throw new Error("Invalid EGP amount");
  }

  const [whole, fraction = ""] = normalized.split(".");
  const piasters = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(piasters) || piasters < 0) {
    throw new Error("EGP amount is outside the supported range");
  }
  return piasters;
}

export function piastersToEgp(piasters: number): string {
  if (!Number.isSafeInteger(piasters) || piasters < 0) {
    throw new Error("Invalid piaster amount");
  }
  return (piasters / 100).toFixed(2);
}

export function percentageOfPiasters(
  amountPiasters: number,
  percentage: string | number,
): number {
  const percentageHundredths = Math.round(Number(percentage) * 100);
  if (
    !Number.isSafeInteger(amountPiasters) ||
    amountPiasters < 0 ||
    !Number.isInteger(percentageHundredths) ||
    percentageHundredths < 0 ||
    percentageHundredths > 10_000
  ) {
    throw new Error("Invalid percentage calculation");
  }

  // Round half up to the nearest piaster.
  return Math.floor((amountPiasters * percentageHundredths + 5_000) / 10_000);
}

export function addPiasters(values: Array<string | number>): number {
  return values.reduce<number>((total, value) => {
    const next = total + egpToPiasters(value);
    if (!Number.isSafeInteger(next)) throw new Error("EGP total is too large");
    return next;
  }, 0);
}
