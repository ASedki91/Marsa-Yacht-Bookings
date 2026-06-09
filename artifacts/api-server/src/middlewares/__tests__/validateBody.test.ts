import { describe, it, expect, vi } from "vitest";
import { validateBody } from "../validate";
import { z } from "zod/v4";
import type { Request, Response, NextFunction } from "express";

function makeReq(body: unknown): Request {
  return { body, log: { error: vi.fn() } } as unknown as Request;
}

function makeRes(): { res: Response; calls: { status?: number; body?: unknown } } {
  const calls: { status?: number; body?: unknown } = {};
  const json = vi.fn((b: unknown) => { calls.body = b; return res; });
  const status = vi.fn((code: number) => { calls.status = code; return res; });
  const res = { json, status } as unknown as Response;
  status.mockReturnValue(res);
  return { res, calls };
}

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
});

describe("validateBody", () => {
  it("calls next when body is valid", () => {
    const req = makeReq({ email: "user@example.com" });
    const { res } = makeRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect((req as any).body.email).toBe("user@example.com");
  });

  it("returns 400 when body is invalid", () => {
    const req = makeReq({ email: "not-an-email" });
    const { res, calls } = makeRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(calls.body).toMatchObject({ error: "Validation failed" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 when required field is missing", () => {
    const req = makeReq({});
    const { res, calls } = makeRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(calls.body).toMatchObject({ error: "Validation failed" });
    expect(next).not.toHaveBeenCalled();
  });

  it("strips unknown fields (Zod default behavior)", () => {
    const req = makeReq({ email: "user@example.com", extra: "should be stripped" });
    const { res } = makeRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    // Zod strips by default in v4 with .strip()
    expect((req as any).body).not.toHaveProperty("extra");
  });
});
