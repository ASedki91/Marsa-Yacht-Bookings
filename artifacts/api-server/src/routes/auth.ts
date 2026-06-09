import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import rateLimit from "express-rate-limit";

const router: IRouter = Router();

// Tighter rate limit for auth operations to protect against brute-force
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth requests, please try again later" },
  // trust proxy is set to 1, so req.ip is already the real client IP
  skip: () => false,
});

/**
 * POST /auth/sync
 * Called by the mobile/web app after Clerk sign-in to ensure a local user record exists.
 * Creates the user on first sign-in (JIT provisioning), returns the existing record on repeat calls.
 */
router.post("/auth/sync", authRateLimit, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;

  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { email, fullName, avatarUrl, phone, nationality } = req.body as {
    email?: string;
    fullName?: string;
    avatarUrl?: string;
    phone?: string;
    nationality?: string;
  };

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkUserId))
    .limit(1);

  if (existing) {
    const updates: Partial<typeof existing> = {};
    if (fullName && fullName !== existing.fullName) updates.fullName = fullName;
    if (avatarUrl && avatarUrl !== existing.avatarUrl) updates.avatarUrl = avatarUrl;
    if (phone && phone !== existing.phone) updates.phone = phone;
    if (nationality && nationality !== existing.nationality) updates.nationality = nationality;

    if (Object.keys(updates).length > 0) {
      const [updated] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.clerkId, clerkUserId))
        .returning();
      res.json({ user: updated, created: false });
      return;
    }

    res.json({ user: existing, created: false });
    return;
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      id: randomUUID(),
      clerkId: clerkUserId,
      email,
      fullName: fullName ?? null,
      avatarUrl: avatarUrl ?? null,
      phone: phone ?? null,
      nationality: nationality ?? null,
      role: "guest",
    })
    .returning();

  req.log.info({ userId: created.id }, "New user provisioned");
  res.status(201).json({ user: created, created: true });
});

/**
 * GET /auth/me
 * Returns the current user's local record. Requires Clerk auth.
 */
router.get("/auth/me", authRateLimit, async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;

  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkUserId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found. Call /auth/sync first." });
    return;
  }

  res.json({ user });
});

export default router;
