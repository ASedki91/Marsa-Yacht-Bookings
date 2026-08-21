import { describe, expect, it } from "vitest";
import {
  dryRunRequestSchema,
  executeRequestSchema,
  operatorAuthorizationFailure,
} from "./operator";

const action = {
  kind: "location" as const,
  name: "Abu Tig Marina",
  city: "El Gouna",
  country: "Egypt",
  timeZone: "Africa/Cairo",
};
const operationId = "0a477284-0ee5-48ba-a1be-5e8b527c7d6d";

describe("production operator endpoint contract", () => {
  it("fails closed outside production and without the dedicated Bearer secret", () => {
    expect(
      operatorAuthorizationFailure("development", "operator-secret", "Bearer operator-secret"),
    ).toMatchObject({ status: 404 });
    expect(operatorAuthorizationFailure("production", undefined, undefined)).toMatchObject({
      status: 503,
    });
    expect(
      operatorAuthorizationFailure("production", "operator-secret", "operator-secret"),
    ).toMatchObject({ status: 401 });
    expect(
      operatorAuthorizationFailure("production", "operator-secret", "Bearer incorrect"),
    ).toMatchObject({ status: 401 });
    expect(
      operatorAuthorizationFailure(
        "production",
        "operator-secret",
        "Bearer operator-secret",
      ),
    ).toBeNull();
  });

  it("accepts only the dry-run then explicit-confirm execution contract", () => {
    expect(
      dryRunRequestSchema.safeParse({
        phase: "dry_run",
        operationId,
        action,
      }).success,
    ).toBe(true);
    expect(
      executeRequestSchema.safeParse({
        phase: "execute",
        operationId,
        action,
        confirmationToken: "a".repeat(20),
        confirmed: true,
      }).success,
    ).toBe(true);
    expect(
      executeRequestSchema.safeParse({
        phase: "execute",
        operationId,
        action,
        confirmationToken: "a".repeat(20),
        confirmed: false,
      }).success,
    ).toBe(false);
  });
});