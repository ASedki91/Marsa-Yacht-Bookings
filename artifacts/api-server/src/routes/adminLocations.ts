import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { auditLogsTable, db, locationsTable } from "@workspace/db";
import { asc, desc, eq } from "drizzle-orm";
import { requireAuth, requireRole, validateBody } from "../middlewares";
import { assertValidTimeZone } from "../lib/cancellations/time";

const router: IRouter = Router();
const locationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  timeZone: z.string().trim().min(1).max(120),
  isDefault: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional().default(0),
});
const locationUpdateSchema = locationInputSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

router.use("/admin/locations", requireAuth, requireRole("admin"));

function baseSlug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "location"
  );
}

async function uniqueLocationSlug(name: string, excludeId?: string): Promise<string> {
  const base = baseSlug(name);
  const locations = await db
    .select({ id: locationsTable.id, slug: locationsTable.slug })
    .from(locationsTable);
  const used = new Set(
    locations
      .filter((location) => location.id !== excludeId)
      .map((location) => location.slug),
  );
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

router.get(
  "/admin/locations",
  async (_req: Request, res: Response): Promise<void> => {
    const locations = await db
      .select()
      .from(locationsTable)
      .orderBy(
        desc(locationsTable.isDefault),
        asc(locationsTable.sortOrder),
        asc(locationsTable.name),
      );
    res.json({ locations, allowCustomLocation: true });
  },
);

router.post(
  "/admin/locations",
  validateBody(locationInputSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const input = req.body as z.infer<typeof locationInputSchema>;
    try {
      assertValidTimeZone(input.timeZone);
    } catch {
      res.status(400).json({ error: "timeZone must be a valid IANA time zone" });
      return;
    }
    const id = randomUUID();
    const slug = await uniqueLocationSlug(input.name);
    const [location] = await db.transaction(async (tx) => {
      if (input.isDefault) {
        await tx
          .update(locationsTable)
          .set({ isDefault: false })
          .where(eq(locationsTable.isDefault, true));
      }
      const [created] = await tx
        .insert(locationsTable)
        .values({
          id,
          name: input.name,
          city: input.city,
          country: input.country,
          timeZone: input.timeZone,
          slug,
          isActive: true,
          isDefault: input.isDefault,
          sortOrder: input.sortOrder,
        })
        .returning();
      await tx.insert(auditLogsTable).values({
        id: randomUUID(),
        userId: user.id,
        action: "location.created",
        entityType: "location",
        entityId: id,
        newValue: input,
        ipAddress: req.ip,
      });
      return [created];
    });
    res.status(201).json(location);
  },
);

router.patch(
  "/admin/locations/:id",
  validateBody(locationUpdateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const locationId = String(req.params.id);
    const input = req.body as z.infer<typeof locationUpdateSchema>;
    const [existing] = await db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.id, locationId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Location not found" });
      return;
    }
    if (input.timeZone) {
      try {
        assertValidTimeZone(input.timeZone);
      } catch {
        res.status(400).json({ error: "timeZone must be a valid IANA time zone" });
        return;
      }
    }
    if (
      existing.isDefault &&
      (input.isDefault === false || input.isActive === false)
    ) {
      res.status(409).json({
        error: "Choose another default location before changing this one",
      });
      return;
    }
    const updates = {
      ...input,
      ...(input.name ? { slug: await uniqueLocationSlug(input.name, locationId) } : {}),
      ...(input.isDefault ? { isActive: true } : {}),
    };
    const [location] = await db.transaction(async (tx) => {
      if (input.isDefault) {
        await tx
          .update(locationsTable)
          .set({ isDefault: false })
          .where(eq(locationsTable.isDefault, true));
      }
      const [updated] = await tx
        .update(locationsTable)
        .set(updates)
        .where(eq(locationsTable.id, locationId))
        .returning();
      await tx.insert(auditLogsTable).values({
        id: randomUUID(),
        userId: user.id,
        action: "location.updated",
        entityType: "location",
        entityId: locationId,
        oldValue: existing,
        newValue: updates,
        ipAddress: req.ip,
      });
      return [updated];
    });
    res.json(location);
  },
);

router.post(
  "/admin/locations/:id/deactivate",
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const locationId = String(req.params.id);
    const [existing] = await db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.id, locationId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Location not found" });
      return;
    }
    if (existing.isDefault) {
      res.status(409).json({
        error: "The default location cannot be deactivated",
      });
      return;
    }
    const [location] = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(locationsTable)
        .set({ isActive: false })
        .where(eq(locationsTable.id, locationId))
        .returning();
      await tx.insert(auditLogsTable).values({
        id: randomUUID(),
        userId: user.id,
        action: "location.deactivated",
        entityType: "location",
        entityId: locationId,
        ipAddress: req.ip,
      });
      return [updated];
    });
    res.json(location);
  },
);

export default router;
