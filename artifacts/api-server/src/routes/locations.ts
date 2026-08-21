import { Router, type IRouter, type Request, type Response } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { db, locationsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/locations", async (_req: Request, res: Response): Promise<void> => {
  const locations = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.isActive, true))
    .orderBy(
      desc(locationsTable.isDefault),
      asc(locationsTable.sortOrder),
      asc(locationsTable.name),
    );

  res.json({ locations, allowCustomLocation: true });
});

export default router;
