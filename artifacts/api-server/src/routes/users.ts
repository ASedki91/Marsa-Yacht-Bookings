import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, validateBody } from "../middlewares/index";

const router: IRouter = Router();

const userUpdateSchema = z.object({
  fullName: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  nationality: z.string().max(100).optional(),
  avatarUrl: z.string().url().optional(),
});

router.patch(
  "/users/me",
  requireAuth,
  validateBody(userUpdateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const { fullName, phone, nationality, avatarUrl } = req.body as z.infer<typeof userUpdateSchema>;

    const updates: Partial<typeof user> = {};
    if (fullName !== undefined) updates.fullName = fullName;
    if (phone !== undefined) updates.phone = phone;
    if (nationality !== undefined) updates.nationality = nationality;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;

    if (Object.keys(updates).length === 0) {
      res.json({ user });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, user.id))
      .returning();

    res.json({ user: updated });
  },
);

export default router;
