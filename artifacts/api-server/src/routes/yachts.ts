import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  db,
  yachtsTable,
  yachtPhotosTable,
  yachtTemplatePricingTable,
  bookingTemplatesTable,
  reviewsTable,
  categoriesTable,
  addOnsTable,
  availabilitySlotsTable,
  usersTable,
  hostProfilesTable,
} from "@workspace/db";
import { and, eq, gte, lte, inArray, sql, desc, asc } from "drizzle-orm";
import { getEgpUsdRate } from "../lib/exchange";
import { validateQuery } from "../middlewares/index";

const router: IRouter = Router();

// ── Categories ─────────────────────────────────────────────────────────────
router.get("/categories", async (_req: Request, res: Response): Promise<void> => {
  const categories = await db
    .select()
    .from(categoriesTable)
    .orderBy(asc(categoriesTable.sortOrder));
  res.json({ categories });
});

// ── Booking Templates ───────────────────────────────────────────────────────
router.get("/booking-templates", async (_req: Request, res: Response): Promise<void> => {
  const templates = await db
    .select()
    .from(bookingTemplatesTable)
    .where(eq(bookingTemplatesTable.isActive, true))
    .orderBy(asc(bookingTemplatesTable.sortOrder));
  res.json({ templates });
});

// ── Add-ons ─────────────────────────────────────────────────────────────────
router.get("/add-ons", async (_req: Request, res: Response): Promise<void> => {
  const addOns = await db
    .select()
    .from(addOnsTable)
    .where(eq(addOnsTable.isActive, true));
  res.json({ addOns });
});

// ── Exchange Rate ────────────────────────────────────────────────────────────
router.get("/exchange-rate", async (_req: Request, res: Response): Promise<void> => {
  const { rate, fetchedAt } = await getEgpUsdRate();
  res.json({ pair: "USDEGP", rate, fetchedAt: fetchedAt.toISOString() });
});

// ── Yacht Availability (query-params only — avoids Orval param+query collision) ──
const availabilityQuerySchema = z.object({
  yachtId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
});

router.get(
  "/yachts/availability",
  validateQuery(availabilityQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    const { yachtId, from, to } = req.query as z.infer<typeof availabilityQuerySchema>;
    const slots = await db
      .select()
      .from(availabilitySlotsTable)
      .where(
        and(
          eq(availabilitySlotsTable.yachtId, yachtId),
          eq(availabilitySlotsTable.isAvailable, true),
          gte(availabilitySlotsTable.date, from),
          lte(availabilitySlotsTable.date, to),
        ),
      )
      .orderBy(asc(availabilitySlotsTable.date), asc(availabilitySlotsTable.startTime));
    res.json({ slots });
  },
);

// ── Yacht Listing ───────────────────────────────────────────────────────────
const listYachtsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  categoryId: z.string().optional(),
  capacity: z.coerce.number().int().positive().optional(),
  date: z.string().optional(),
  templateId: z.string().optional(),
});

router.get(
  "/yachts",
  validateQuery(listYachtsQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    const { page, limit, categoryId, capacity, date, templateId } =
      req.query as unknown as z.infer<typeof listYachtsQuerySchema>;

    const conditions: ReturnType<typeof eq>[] = [eq(yachtsTable.status, "live")];
    if (categoryId) conditions.push(eq(yachtsTable.categoryId, categoryId) as any);
    if (capacity) conditions.push(gte(yachtsTable.capacity, capacity) as any);

    // Date filter: only yachts with an available slot on that date
    if (date) {
      const slotsOnDate = await db
        .selectDistinct({ yachtId: availabilitySlotsTable.yachtId })
        .from(availabilitySlotsTable)
        .where(
          and(
            eq(availabilitySlotsTable.date, date),
            eq(availabilitySlotsTable.isAvailable, true),
            templateId ? eq(availabilitySlotsTable.templateId, templateId) : sql`true`,
          ),
        );
      const yachtIds = slotsOnDate.map((r) => r.yachtId);
      if (yachtIds.length === 0) {
        res.json({ yachts: [], total: 0, page, limit });
        return;
      }
      conditions.push(inArray(yachtsTable.id, yachtIds) as any);
    }

    const offset = (page - 1) * limit;
    const where = and(...conditions);

    const [yachts, [countRow]] = await Promise.all([
      db
        .select()
        .from(yachtsTable)
        .where(where)
        .orderBy(desc(yachtsTable.avgRating), desc(yachtsTable.reviewCount))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(yachtsTable)
        .where(where),
    ]);

    res.json({ yachts, total: countRow?.count ?? 0, page, limit });
  },
);

// ── Yacht Detail ────────────────────────────────────────────────────────────
router.get("/yachts/:id", async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);

  const [yacht] = await db
    .select()
    .from(yachtsTable)
    .where(and(eq(yachtsTable.id, id), eq(yachtsTable.status, "live")))
    .limit(1);

  if (!yacht) {
    res.status(404).json({ error: "Yacht not found" });
    return;
  }

  const [photos, pricingRows, approvedReviews, hostProfile] = await Promise.all([
    db
      .select()
      .from(yachtPhotosTable)
      .where(eq(yachtPhotosTable.yachtId, id))
      .orderBy(asc(yachtPhotosTable.sortOrder)),
    db
      .select({
        templateId: yachtTemplatePricingTable.templateId,
        templateName: bookingTemplatesTable.name,
        durationHours: bookingTemplatesTable.durationHours,
        priceEgp: yachtTemplatePricingTable.price,
      })
      .from(yachtTemplatePricingTable)
      .innerJoin(
        bookingTemplatesTable,
        eq(yachtTemplatePricingTable.templateId, bookingTemplatesTable.id),
      )
      .where(
        and(
          eq(yachtTemplatePricingTable.yachtId, id),
          eq(yachtTemplatePricingTable.isActive, true),
          eq(bookingTemplatesTable.isActive, true),
        ),
      ),
    db
      .select()
      .from(reviewsTable)
      .where(
        and(
          eq(reviewsTable.yachtId, id),
          eq(reviewsTable.type, "guest_to_host"),
          eq(reviewsTable.status, "approved"),
        ),
      )
      .orderBy(desc(reviewsTable.createdAt))
      .limit(20),
    db
      .select({
        id: hostProfilesTable.id,
        fullName: usersTable.fullName,
        avatarUrl: usersTable.avatarUrl,
        bio: hostProfilesTable.bio,
        memberSince: hostProfilesTable.createdAt,
      })
      .from(hostProfilesTable)
      .innerJoin(usersTable, eq(hostProfilesTable.userId, usersTable.id))
      .where(eq(hostProfilesTable.id, yacht.hostId))
      .limit(1),
  ]);

  res.json({
    yacht,
    photos,
    pricing: pricingRows,
    reviews: approvedReviews,
    host: hostProfile[0] ?? null,
  });
});

export default router;
