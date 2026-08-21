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
import {
  and,
  eq,
  gte,
  lte,
  inArray,
  sql,
  desc,
  asc,
  between,
} from "drizzle-orm";
import { getEgpUsdRate } from "../lib/exchange";
import { validateQuery } from "../middlewares/index";

const router: IRouter = Router();

// ── Categories ─────────────────────────────────────────────────────────────
router.get(
  "/categories",
  async (_req: Request, res: Response): Promise<void> => {
    const categories = await db
      .select()
      .from(categoriesTable)
      .orderBy(asc(categoriesTable.sortOrder));
    res.json({ categories });
  },
);

// ── Booking Templates ───────────────────────────────────────────────────────
router.get(
  "/booking-templates",
  async (_req: Request, res: Response): Promise<void> => {
    const templates = await db
      .select()
      .from(bookingTemplatesTable)
      .where(eq(bookingTemplatesTable.isActive, true))
      .orderBy(asc(bookingTemplatesTable.sortOrder));
    res.json({ templates });
  },
);

// ── Add-ons ─────────────────────────────────────────────────────────────────
router.get("/add-ons", async (_req: Request, res: Response): Promise<void> => {
  const addOns = await db
    .select()
    .from(addOnsTable)
    .where(eq(addOnsTable.isActive, true));
  res.json({ addOns });
});

// ── Exchange Rate ────────────────────────────────────────────────────────────
router.get(
  "/exchange-rate",
  async (_req: Request, res: Response): Promise<void> => {
    const { rate, fetchedAt } = await getEgpUsdRate();
    res.json({ pair: "USDEGP", rate, fetchedAt: fetchedAt.toISOString() });
  },
);

// ── Yacht Availability (query-params only — avoids Orval param+query collision) ──
const availabilityQuerySchema = z.object({
  yachtId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
});

function availabilityDisplayStatus(
  date: string,
  startTime: string,
): "available" | "past" {
  const slotDateTime = new Date(`${date}T${startTime}`);
  return Number.isNaN(slotDateTime.getTime()) ||
    slotDateTime.getTime() >= Date.now()
    ? "available"
    : "past";
}

async function getPublicAvailabilitySlots(
  yachtId: string,
  from: string,
  to: string,
  templateId?: string,
) {
  const [liveYacht] = await db
    .select({ id: yachtsTable.id })
    .from(yachtsTable)
    .where(and(eq(yachtsTable.id, yachtId), eq(yachtsTable.status, "live")))
    .limit(1);

  if (!liveYacht) return null;

  const conditions = [
    eq(availabilitySlotsTable.yachtId, yachtId),
    eq(availabilitySlotsTable.isAvailable, true),
    gte(availabilitySlotsTable.date, from),
    lte(availabilitySlotsTable.date, to),
  ];
  if (templateId) {
    conditions.push(eq(availabilitySlotsTable.templateId, templateId) as any);
  }

  const slots = await db
    .select({
      id: availabilitySlotsTable.id,
      yachtId: availabilitySlotsTable.yachtId,
      templateId: availabilitySlotsTable.templateId,
      date: availabilitySlotsTable.date,
      startTime: availabilitySlotsTable.startTime,
      isAvailable: availabilitySlotsTable.isAvailable,
      priceOverrideEgp: availabilitySlotsTable.priceOverrideEgp,
      templatePriceEgp: yachtTemplatePricingTable.price,
    })
    .from(availabilitySlotsTable)
    .leftJoin(
      yachtTemplatePricingTable,
      and(
        eq(yachtTemplatePricingTable.yachtId, availabilitySlotsTable.yachtId),
        eq(
          yachtTemplatePricingTable.templateId,
          availabilitySlotsTable.templateId,
        ),
        eq(yachtTemplatePricingTable.isActive, true),
      ),
    )
    .where(and(...conditions))
    .orderBy(
      asc(availabilitySlotsTable.date),
      asc(availabilitySlotsTable.startTime),
    );

  return slots.map(({ templatePriceEgp, ...slot }) => ({
    ...slot,
    effectivePriceEgp: slot.priceOverrideEgp ?? templatePriceEgp,
    displayStatus: availabilityDisplayStatus(slot.date, slot.startTime),
    editable: false,
    bookingId: null,
  }));
}

router.get(
  "/yachts/availability",
  validateQuery(availabilityQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    const { yachtId, from, to } = req.query as z.infer<
      typeof availabilityQuerySchema
    >;
    const slots = await getPublicAvailabilitySlots(yachtId, from, to);
    if (!slots) {
      res.status(404).json({ error: "Yacht not found" });
      return;
    }
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
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  features: z.string().optional(), // comma-separated list e.g. "wifi,ac"
  locationId: z.string().optional(),
  intent: z.enum(["rent", "buy"]).optional().default("rent"),
});

router.get(
  "/yachts",
  validateQuery(listYachtsQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    const {
      page,
      limit,
      categoryId,
      capacity,
      date,
      templateId,
      minPrice,
      maxPrice,
      features,
      locationId,
      intent,
    } = req.query as unknown as z.infer<typeof listYachtsQuerySchema>;

    if (intent === "buy") {
      res.status(400).json({
        error: "Boat sales are coming soon. Rental search is available now.",
      });
      return;
    }

    const conditions: ReturnType<typeof eq>[] = [
      eq(yachtsTable.status, "live"),
    ];
    let datePriceByYacht: Map<string, number> | null = null;
    if (categoryId)
      conditions.push(eq(yachtsTable.categoryId, categoryId) as any);
    if (locationId)
      conditions.push(eq(yachtsTable.locationId, locationId) as any);
    if (capacity) conditions.push(gte(yachtsTable.capacity, capacity) as any);

    // Features filter: yachts whose features JSONB array contains ALL requested features
    if (features) {
      const featureList = features
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      if (featureList.length > 0) {
        // Use @> (contains) operator on JSONB
        conditions.push(
          sql`${yachtsTable.features} @> ${JSON.stringify(featureList)}::jsonb` as any,
        );
      }
    }

    // Date filter: only yachts with an available slot on that date
    if (date) {
      const slotsOnDate = await db
        .select({
          yachtId: availabilitySlotsTable.yachtId,
          priceOverrideEgp: availabilitySlotsTable.priceOverrideEgp,
          templatePriceEgp: yachtTemplatePricingTable.price,
        })
        .from(availabilitySlotsTable)
        .leftJoin(
          yachtTemplatePricingTable,
          and(
            eq(
              yachtTemplatePricingTable.yachtId,
              availabilitySlotsTable.yachtId,
            ),
            eq(
              yachtTemplatePricingTable.templateId,
              availabilitySlotsTable.templateId,
            ),
            eq(yachtTemplatePricingTable.isActive, true),
          ),
        )
        .where(
          and(
            eq(availabilitySlotsTable.date, date),
            eq(availabilitySlotsTable.isAvailable, true),
            templateId
              ? eq(availabilitySlotsTable.templateId, templateId)
              : sql`true`,
          ),
        );
      datePriceByYacht = new Map<string, number>();
      for (const slot of slotsOnDate) {
        const effectivePrice = Number(
          slot.priceOverrideEgp ?? slot.templatePriceEgp,
        );
        const current = datePriceByYacht.get(slot.yachtId);
        if (
          Number.isFinite(effectivePrice) &&
          (current === undefined || effectivePrice < current)
        ) {
          datePriceByYacht.set(slot.yachtId, effectivePrice);
        }
      }
      const yachtIds = [...new Set(slotsOnDate.map((slot) => slot.yachtId))];
      if (yachtIds.length === 0) {
        res.json({ yachts: [], total: 0, page, limit });
        return;
      }
      conditions.push(inArray(yachtsTable.id, yachtIds) as any);
    }

    // Price filter: only yachts that have at least one active pricing entry in range
    if (minPrice !== undefined || maxPrice !== undefined) {
      if (datePriceByYacht) {
        const matchingYachtIds = [...datePriceByYacht.entries()]
          .filter(
            ([, price]) =>
              (minPrice === undefined || price >= minPrice) &&
              (maxPrice === undefined || price <= maxPrice),
          )
          .map(([yachtId]) => yachtId);
        if (matchingYachtIds.length === 0) {
          res.json({ yachts: [], total: 0, page, limit });
          return;
        }
        conditions.push(inArray(yachtsTable.id, matchingYachtIds) as any);
      } else {
        const priceSubs = db
          .selectDistinct({ yachtId: yachtTemplatePricingTable.yachtId })
          .from(yachtTemplatePricingTable)
          .where(
            and(
              eq(yachtTemplatePricingTable.isActive, true),
              minPrice !== undefined
                ? sql`CAST(${yachtTemplatePricingTable.price} AS numeric) >= ${minPrice}`
                : sql`true`,
              maxPrice !== undefined
                ? sql`CAST(${yachtTemplatePricingTable.price} AS numeric) <= ${maxPrice}`
                : sql`true`,
            ),
          );
        conditions.push(sql`${yachtsTable.id} IN (${priceSubs})` as any);
      }
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

    // Attach photos + starting price so list cards can render fully
    const ids = yachts.map((y) => y.id);
    const [photoRows, priceRows] = ids.length
      ? await Promise.all([
          db
            .select()
            .from(yachtPhotosTable)
            .where(inArray(yachtPhotosTable.yachtId, ids))
            .orderBy(asc(yachtPhotosTable.sortOrder)),
          db
            .select({
              yachtId: yachtTemplatePricingTable.yachtId,
              price: yachtTemplatePricingTable.price,
            })
            .from(yachtTemplatePricingTable)
            .where(
              and(
                inArray(yachtTemplatePricingTable.yachtId, ids),
                eq(yachtTemplatePricingTable.isActive, true),
              ),
            ),
        ])
      : [[], []];

    const photosByYacht = new Map<string, typeof photoRows>();
    for (const p of photoRows) {
      const arr = photosByYacht.get(p.yachtId) ?? [];
      arr.push(p);
      photosByYacht.set(p.yachtId, arr);
    }
    const minPriceByYacht = new Map<string, number>();
    for (const r of priceRows) {
      const val = Number(r.price);
      const cur = minPriceByYacht.get(r.yachtId);
      if (cur === undefined || val < cur) minPriceByYacht.set(r.yachtId, val);
    }

    const normalized = yachts.map((y) => ({
      ...y,
      name: y.title,
      rating: y.avgRating != null ? Number(y.avgRating) : null,
      photos: photosByYacht.get(y.id) ?? [],
      basePriceEgp:
        datePriceByYacht?.get(y.id) !== undefined
          ? datePriceByYacht.get(y.id)!.toFixed(2)
          : minPriceByYacht.get(y.id) !== undefined
            ? minPriceByYacht.get(y.id)!.toFixed(2)
            : null,
    }));

    res.json({ yachts: normalized, total: countRow?.count ?? 0, page, limit });
  },
);

// ── Yacht Detail ────────────────────────────────────────────────────────────
router.get(
  "/yachts/:id",
  async (req: Request, res: Response): Promise<void> => {
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

    const [photos, pricingRows, approvedReviews, hostProfile] =
      await Promise.all([
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

    const minPrice = pricingRows.length
      ? Math.min(...pricingRows.map((p) => Number(p.priceEgp)))
      : null;

    // Flatten yacht fields to the top level (UI expects name/rating/basePriceEgp
    // alongside photos/pricing/reviews/host)
    res.json({
      ...yacht,
      name: yacht.title,
      rating: yacht.avgRating != null ? Number(yacht.avgRating) : null,
      basePriceEgp: minPrice != null ? minPrice.toFixed(2) : null,
      photos,
      pricing: pricingRows,
      reviews: approvedReviews,
      host: hostProfile[0] ?? null,
    });
  },
);

// ── GET /yachts/:id/slots ────────────────────────────────────────────────────
// Path-param based availability lookup (complement to /yachts/availability).
const slotsQuerySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  templateId: z.string().optional(),
});

router.get(
  "/yachts/:id/slots",
  validateQuery(slotsQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    const yachtId = String(req.params.id);
    const { from, to, templateId } = req.query as unknown as z.infer<
      typeof slotsQuerySchema
    >;

    const slots = await getPublicAvailabilitySlots(
      yachtId,
      from,
      to,
      templateId,
    );
    if (!slots) {
      res.status(404).json({ error: "Yacht not found" });
      return;
    }

    res.json({ slots });
  },
);

export default router;
