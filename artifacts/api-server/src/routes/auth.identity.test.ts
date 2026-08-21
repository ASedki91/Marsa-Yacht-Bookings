import { describe, expect, it } from "vitest";
import { submittedEmailMatchesVerifiedEmail } from "./auth";

describe("auth sync identity claims", () => {
  it("rejects a client email that does not match Clerk's verified email", () => {
    expect(
      submittedEmailMatchesVerifiedEmail(
        "attacker@example.com",
        "invited-admin@example.com",
      ),
    ).toBe(false);
  });

  it("allows the same verified email with harmless casing or whitespace changes", () => {
    expect(
      submittedEmailMatchesVerifiedEmail(
        " Invited-Admin@Example.com ",
        "invited-admin@example.com",
      ),
    ).toBe(true);
  });
});