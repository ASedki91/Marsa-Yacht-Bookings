import { Request, Response, NextFunction } from "express";
import { ZodTypeAny, z } from "zod/v4";

// Validate request body against a Zod schema
export const validateBody = <T extends ZodTypeAny>(schema: T) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: z.treeifyError(result.error),
      });
      return;
    }
    req.body = result.data;
    next();
  };
};

// Validate query params against a Zod schema
export const validateQuery = <T extends ZodTypeAny>(schema: T) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: "Invalid query parameters",
        details: z.treeifyError(result.error),
      });
      return;
    }
    // Express 5: req.query is a getter-only property, so use defineProperty to override it
    Object.defineProperty(req, "query", {
      value: result.data,
      writable: true,
      configurable: true,
    });
    next();
  };
};
