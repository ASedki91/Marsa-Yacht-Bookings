import { describe, expect, it } from "vitest";
import {
  addPiasters,
  egpToPiasters,
  percentageOfPiasters,
  piastersToEgp,
} from "./money";

describe("money helpers", () => {
  it("converts EGP decimals without floating-point arithmetic", () => {
    expect(egpToPiasters("123.45")).toBe(12_345);
    expect(egpToPiasters("10.5")).toBe(1_050);
    expect(piastersToEgp(12_345)).toBe("123.45");
  });

  it("rounds percentage results half up to the nearest piaster", () => {
    expect(percentageOfPiasters(1_010, 5)).toBe(51);
    expect(percentageOfPiasters(100_000, "20.00")).toBe(20_000);
  });

  it("adds decimal values using integer piasters", () => {
    expect(addPiasters(["0.10", "0.20", 1])).toBe(130);
  });

  it.each(["-1", "1.001", "1e3", "", "not-money"])(
    "rejects invalid EGP input %s",
    (value) => {
      expect(() => egpToPiasters(value)).toThrow("Invalid EGP amount");
    },
  );
});
