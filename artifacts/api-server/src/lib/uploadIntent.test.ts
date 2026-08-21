import { afterEach, describe, expect, it } from "vitest";
import { createUploadIntent, verifyUploadIntent } from "./uploadIntent";

describe("upload intents", () => {
  const originalSecret = process.env.SESSION_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSecret;
    }
  });

  it("binds an intent to the user and object path", () => {
    process.env.SESSION_SECRET = "test-secret";
    const token = createUploadIntent("user-1", "/objects/uploads/object-1");

    expect(verifyUploadIntent(token, "user-1", "/objects/uploads/object-1")).toBe(true);
    expect(verifyUploadIntent(token, "user-2", "/objects/uploads/object-1")).toBe(false);
    expect(verifyUploadIntent(token, "user-1", "/objects/uploads/object-2")).toBe(false);
  });

  it("rejects tampered intents and missing signing configuration", () => {
    process.env.SESSION_SECRET = "test-secret";
    const token = createUploadIntent("user-1", "/objects/uploads/object-1");

    expect(verifyUploadIntent(`${token}tampered`, "user-1", "/objects/uploads/object-1")).toBe(
      false,
    );

    delete process.env.SESSION_SECRET;
    expect(verifyUploadIntent(token, "user-1", "/objects/uploads/object-1")).toBe(false);
    expect(() => createUploadIntent("user-1", "/objects/uploads/object-1")).toThrow(
      "SESSION_SECRET",
    );
  });
});