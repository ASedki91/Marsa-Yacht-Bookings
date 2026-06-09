import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export type UserRole = "guest" | "host" | "admin";

// Attach local user to request after Clerk validates the JWT
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;

  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, clerkUserId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "User not found. Please sync your account." });
      return;
    }

    (req as any).localUser = user;
    next();
  } catch (err) {
    req.log.error({ err }, "Failed to fetch local user in requireAuth");
    res.status(500).json({ error: "Internal server error" });
  }
};

// Role-based access control middleware — must be used after requireAuth
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).localUser;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(user.role as UserRole)) {
      res.status(403).json({ error: "Forbidden: insufficient role" });
      return;
    }
    next();
  };
};

// Optional auth — attaches user if present, but doesn't block unauthenticated requests
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;

  if (!clerkUserId) {
    next();
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, clerkUserId))
      .limit(1);

    if (user) {
      (req as any).localUser = user;
    }
  } catch (err) {
    logger.warn({ err }, "optionalAuth: failed to fetch local user");
  }

  next();
};
