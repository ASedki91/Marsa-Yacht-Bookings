import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  adminEventsTable,
  adminSectionViewsTable,
  db,
} from "@workspace/db";
import { and, eq, gt, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares";
import { ADMIN_SECTION_KEYS } from "../lib/adminActivity";

const router: IRouter = Router();
const sectionKeySchema = z.enum(ADMIN_SECTION_KEYS);

router.use("/admin/activity", requireAuth, requireRole("admin"));

router.get(
  "/admin/activity/unseen-counts",
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const views = await db
      .select()
      .from(adminSectionViewsTable)
      .where(eq(adminSectionViewsTable.adminUserId, user.id));
    const seenBySection = new Map(
      views.map((view) => [view.sectionKey, view.lastSeenAt]),
    );
    const entries = await Promise.all(
      ADMIN_SECTION_KEYS.map(async (sectionKey) => {
        const lastSeenAt = seenBySection.get(sectionKey) ?? new Date(0);
        const [result] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(adminEventsTable)
          .where(
            and(
              eq(adminEventsTable.sectionKey, sectionKey),
              gt(adminEventsTable.occurredAt, lastSeenAt),
            ),
          );
        return [sectionKey, result?.count ?? 0] as const;
      }),
    );
    res.json({ counts: Object.fromEntries(entries) });
  },
);

router.post(
  "/admin/activity/sections/:sectionKey/seen",
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const parsed = sectionKeySchema.safeParse(String(req.params.sectionKey));
    if (!parsed.success) {
      res.status(400).json({ error: "Unknown admin section" });
      return;
    }
    const lastSeenAt = new Date();
    const [view] = await db
      .insert(adminSectionViewsTable)
      .values({
        adminUserId: user.id,
        sectionKey: parsed.data,
        lastSeenAt,
      })
      .onConflictDoUpdate({
        target: [
          adminSectionViewsTable.adminUserId,
          adminSectionViewsTable.sectionKey,
        ],
        set: { lastSeenAt },
      })
      .returning();
    res.json({
      sectionKey: view.sectionKey,
      lastSeenAt: view.lastSeenAt.toISOString(),
    });
  },
);

export default router;
