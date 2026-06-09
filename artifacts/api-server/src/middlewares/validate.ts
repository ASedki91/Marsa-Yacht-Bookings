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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req.query = result.data as any;
    next();
  };
};
