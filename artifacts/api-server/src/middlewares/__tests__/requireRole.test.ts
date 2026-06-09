import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireRole } from "../auth";
import type { Request, Response, NextFunction } from "express";

function makeReq(overrides?: Partial<Request>): Request {
  return {
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; statusCode: number; body: unknown } {
  const ctx = { statusCode: 200, body: undefined as unknown };
  const json = vi.fn((b: unknown) => {
    ctx.body = b;
    return res;
  });
  const status = vi.fn((code: number) => {
    ctx.statusCode = code;
    return res;
  });
  const res = { json, status } as unknown as Response;
  // chain: status(n).json(b) — make status return res so json works
  status.mockReturnValue(res);
  return { res, ...ctx };
}

describe("requireRole", () => {
  it("returns 401 when localUser is not attached", () => {
    const req = makeReq();
    const { res, ...ctx } = makeRes();
    const next = vi.fn();

    requireRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when user role does not match", () => {
    const req = makeReq({ ["localUser" as keyof Request]: { role: "guest" } } as any);
    (req as any).localUser = { role: "guest" };
    const { res } = makeRes();
    const next = vi.fn();

    requireRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden: insufficient role" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when user role matches", () => {
    const req = makeReq();
    (req as any).localUser = { role: "admin" };
    const { res } = makeRes();
    const next = vi.fn();

    requireRole("admin")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows any of multiple roles", () => {
    const req = makeReq();
    (req as any).localUser = { role: "host" };
    const { res } = makeRes();
    const next = vi.fn();

    requireRole("guest", "host", "admin")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("blocks a role not in the allowed list", () => {
    const req = makeReq();
    (req as any).localUser = { role: "guest" };
    const { res } = makeRes();
    const next = vi.fn();

    requireRole("host", "admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
