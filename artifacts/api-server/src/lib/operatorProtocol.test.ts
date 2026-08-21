import { describe, expect, it } from "vitest";
import {
  createConfirmationToken,
  fingerprintOperatorAction,
  verifyConfirmationToken,
} from "./operatorProtocol";

describe("operator confirmation tokens", () => {
  const secret = "test-only-operator-secret";

  it("is stable across equivalent object key ordering", () => {
    expect(fingerprintOperatorAction({ b: 2, a: [1, { z: true }] })).toBe(
      fingerprintOperatorAction({ a: [1, { z: true }], b: 2 }),
    );
  });

  it("accepts a valid signed token and rejects tampering", () => {
    const token = createConfirmationToken(
      {
        operationId: "b2d51e6d-40ae-42c2-a0b5-f0a1c8f694a1",
        actionHash: "a".repeat(64),
        expiresAt: Date.now() + 60_000,
      },
      secret,
    );
    expect(verifyConfirmationToken(token, secret)?.operationId).toBe(
      "b2d51e6d-40ae-42c2-a0b5-f0a1c8f694a1",
    );
    expect(verifyConfirmationToken(`${token}x`, secret)).toBeNull();
  });
});