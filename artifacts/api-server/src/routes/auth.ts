import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod/v4";
import rateLimit from "express-rate-limit";
import { validateBody, auditLog } from "../middlewares/index";
import { recordAdminEvent } from "../lib/adminActivity";

const router: IRouter = Router();

// Tighter rate limit for auth operations to protect against brute-force
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth requests, please try again later" },
  // trust proxy is set to 1 so req.ip is the real client IP
  skip: () => false,
});

// Validation schema for /auth/sync body
const userSyncBodySchema = z.object({
  email: z.string().email("Invalid email address"),
  fullName: z.string().max(200).optional(),
  avatarUrl: z.string().url("Invalid avatar URL").optional(),
  phone: z.string().max(30).optional(),
  nationality: z.string().max(100).optional(),
});

/**
 * POST /auth/sync
 * Called by the mobile/web app after Clerk sign-in to ensure a local user record exists.
 * Creates the user on first sign-in (JIT provisioning), returns the existing record on repeat calls.
 */
router.post(
  "/auth/sync",
  authRateLimit,
  validateBody(userSyncBodySchema),
  auditLog({ action: "auth.sync", entityType: "user" }),
  async (req: Request, res: Response): Promise<void> => {
    const auth = getAuth(req);
    const clerkUserId = auth?.userId;

    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { email, fullName, avatarUrl, phone, nationality } = req.body as z.infer<
      typeof userSyncBodySchema
    >;

    let [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, clerkUserId))
      .limit(1);

    // If no match by clerkId, try to find by email (e.g. pre-seeded admin accounts).
    // Relink the clerkId so subsequent lookups succeed and the role is preserved.
    if (!existing) {
      const [byEmail] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);

      if (byEmail) {
        req.log.info({ userId: byEmail.id, email }, "Relinking clerkId for existing user");
        const [relinked] = await db
          .update(usersTable)
          .set({ clerkId: clerkUserId })
          .where(eq(usersTable.id, byEmail.id))
          .returning();
        existing = relinked;
      }
    }

    if (existing) {
      const updates: Partial<typeof existing> = {};
      if (fullName !== undefined && fullName !== existing.fullName) updates.fullName = fullName;
      if (avatarUrl !== undefined && avatarUrl !== existing.avatarUrl) updates.avatarUrl = avatarUrl;
      if (phone !== undefined && phone !== existing.phone) updates.phone = phone;
      if (nationality !== undefined && nationality !== existing.nationality) updates.nationality = nationality;

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
    void recordAdminEvent({
      sectionKey: "users",
      entityType: "user",
      entityId: created.id,
      eventType: "user.created",
    }).catch(() => {});
    res.status(201).json({ user: created, created: true });
  },
);

/**
 * GET /auth/me
 * Returns the current user's local record. Requires Clerk auth.
 */
router.get(
  "/auth/me",
  authRateLimit,
  async (req: Request, res: Response): Promise<void> => {
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
  },
);

export default router;
