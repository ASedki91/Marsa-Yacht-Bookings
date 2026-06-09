import { Request, Response, NextFunction } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";

interface AuditLogOptions {
  action: string;
  entityType: string;
  getEntityId?: (req: Request) => string | undefined;
  getOldValue?: (req: Request) => Record<string, unknown> | undefined;
  getNewValue?: (req: Request, res: Response) => Record<string, unknown> | undefined;
}

// Middleware factory that records admin actions to audit_logs
export const auditLog = (opts: AuditLogOptions) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as any).localUser;
    const entityId = opts.getEntityId?.(req);
    const oldValue = opts.getOldValue?.(req);

    // Capture the original json method to intercept the response
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      // Fire-and-forget the audit log write after successful responses (2xx/3xx)
      if (res.statusCode < 400) {
        const newValue = opts.getNewValue?.(req, res);
        db.insert(auditLogsTable)
          .values({
            id: randomUUID(),
            userId: user?.id,
            action: opts.action,
            entityType: opts.entityType,
            entityId,
            oldValue: oldValue ?? null,
            newValue: newValue ?? (body as Record<string, unknown>) ?? null,
            ipAddress: req.ip,
          })
          .catch((err) => logger.error({ err }, "Failed to write audit log"));
      }
      return originalJson(body);
    };

    next();
  };
};
