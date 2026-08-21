import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  db,
  hostProfilesTable,
  hostDocumentsTable,
  yachtsTable,
  yachtPhotosTable,
  yachtTemplatePricingTable,
  bookingTemplatesTable,
  availabilitySlotsTable,
  bookingsTable,
  earningsLedgerTable,
  withdrawalRequestsTable,
  photographerRequestsTable,
  auditLogsTable,
} from "@workspace/db";
import { and, eq, sql, desc, asc, inArray, gte, lte } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  requireAuth,
  requireRole,
  validateBody,
  validateQuery,
} from "../middlewares/index";
import { recordAdminEvent } from "../lib/adminActivity";
import { resolveYachtLocation } from "../lib/yachtLocation";

const router: IRouter = Router();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/);
const IMMUTABLE_SLOT_BOOKING_STATUSES = [
  "pending_payment",
  "paid_under_review",
  "confirmed",
  "cancel_requested",
  "completed",
  "closed",
] as const;
const TERMINAL_SLOT_BOOKING_STATUSES = new Set([
  "rejected_refunded",
  "cancelled",
]);
const priceSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0, "Price must be greater than zero");

function slotDateTime(date: string, startTime: string): Date {
  return new Date(`${date}T${startTime}`);
}

// Require authentication for all /host/* paths only.
// A path-less router.use(requireAuth) would intercept ALL requests passing
// through the main router, including public routes in later routers.
router.use("/host", requireAuth);

// ── Host Application ─────────────────────────────────────────────────────────
const hostApplySchema = z.object({
  bio: z.string().min(10).max(2000),
});

router.post(
  "/host/apply",
  validateBody(hostApplySchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;

    const [existing] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);

    if (existing) {
      res
        .status(409)
        .json({ error: "Host application already exists", profile: existing });
      return;
    }

    const [profile] = await db
      .insert(hostProfilesTable)
      .values({
        id: randomUUID(),
        userId: user.id,
        bio: req.body.bio,
        verificationStatus: "pending",
      })
      .returning();

    await db
      .insert(auditLogsTable)
      .values({
        id: randomUUID(),
        userId: user.id,
        action: "host.apply",
        entityType: "host_profile",
        entityId: profile.id,
        ipAddress: req.ip,
      })
      .catch(() => {});

    void recordAdminEvent({
      sectionKey: "hosts",
      entityType: "host_profile",
      entityId: profile.id,
      eventType: "host.applied",
    }).catch(() => {});
    res.status(201).json(profile);
  },
);

// ── Host Profile ─────────────────────────────────────────────────────────────
// NOTE: No requireRole here — pending applicants (still role=guest) need access
// during onboarding to check their verification status and update their bio.
router.get(
  "/host/profile",
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res
        .status(404)
        .json({
          error: "No host application found. Submit one via POST /host/apply",
        });
      return;
    }
    res.json(profile);
  },
);

const hostProfileUpdateSchema = z.object({
  bio: z.string().min(10).max(2000).optional(),
});

router.patch(
  "/host/profile",
  validateBody(hostProfileUpdateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .update(hostProfilesTable)
      .set({ bio: req.body.bio })
      .where(eq(hostProfilesTable.userId, user.id))
      .returning();
    if (!profile) {
      res
        .status(404)
        .json({
          error: "No host application found. Submit one via POST /host/apply",
        });
      return;
    }
    res.json(profile);
  },
);

// ── Host Documents ────────────────────────────────────────────────────────────
// NOTE: No requireRole — applicants must be able to upload docs before approval.
router.get(
  "/host/documents",
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res
        .status(404)
        .json({
          error: "No host application found. Submit one via POST /host/apply",
        });
      return;
    }
    const documents = await db
      .select()
      .from(hostDocumentsTable)
      .where(eq(hostDocumentsTable.hostId, profile.id))
      .orderBy(asc(hostDocumentsTable.createdAt));
    res.json({ documents });
  },
);
const documentSchema = z.object({
  documentType: z.enum([
    "national_id",
    "yacht_ownership",
    "yacht_license",
    "insurance",
  ]),
  fileUrl: z.string().url(),
});

router.post(
  "/host/documents",
  validateBody(documentSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res
        .status(404)
        .json({
          error: "No host application found. Submit one via POST /host/apply",
        });
      return;
    }

    const [doc] = await db
      .insert(hostDocumentsTable)
      .values({
        id: randomUUID(),
        hostId: profile.id,
        documentType: req.body.documentType,
        fileUrl: req.body.fileUrl,
        status: "pending",
      })
      .returning();
    void recordAdminEvent({
      sectionKey: "documents",
      entityType: "host_document",
      entityId: doc.id,
      eventType: "document.submitted",
    }).catch(() => {});
    res.status(201).json(doc);
  },
);

// ── Photographer Request ──────────────────────────────────────────────────────
// NOTE: No requireRole — available to applicants who want photography during onboarding.
const photographerSchema = z.object({
  yachtId: z.string().optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

// Both paths registered: `/host/photographer-request` is the canonical spec path;
// `/host/photographer` is the backward-compatible alias for pre-spec consumers.
router.post(
  ["/host/photographer-request", "/host/photographer"],
  validateBody(photographerSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res
        .status(404)
        .json({
          error: "No host application found. Submit one via POST /host/apply",
        });
      return;
    }

    const [request] = await db
      .insert(photographerRequestsTable)
      .values({
        id: randomUUID(),
        hostId: profile.id,
        yachtId: req.body.yachtId ?? null,
        preferredDate: req.body.preferredDate ?? null,
        preferredTime: req.body.preferredTime ?? null,
        notes: req.body.notes ?? null,
        status: "pending",
      })
      .returning();
    void recordAdminEvent({
      sectionKey: "photographer_requests",
      entityType: "photographer_request",
      entityId: request.id,
      eventType: "photographer_request.created",
    }).catch(() => {});
    res.status(201).json(request);
  },
);

// ── Host Yachts (requires verified host role) ─────────────────────────────────
router.get(
  "/host/yachts",
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Host profile not found" });
      return;
    }

    const yachts = await db
      .select()
      .from(yachtsTable)
      .where(eq(yachtsTable.hostId, profile.id))
      .orderBy(desc(yachtsTable.createdAt));

    // Normalize response: attach photos + min pricing so YachtCard renders fully
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
        minPriceByYacht.get(y.id) !== undefined
          ? minPriceByYacht.get(y.id)!.toFixed(2)
          : null,
    }));

    res.json({
      yachts: normalized,
      total: normalized.length,
      page: 1,
      limit: 100,
    });
  },
);

router.get(
  "/host/yachts/:id",
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const yachtId = String(req.params.id);
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Host profile not found" });
      return;
    }

    const [yacht] = await db
      .select()
      .from(yachtsTable)
      .where(
        and(eq(yachtsTable.id, yachtId), eq(yachtsTable.hostId, profile.id)),
      )
      .limit(1);
    if (!yacht) {
      res.status(404).json({ error: "Yacht not found" });
      return;
    }

    const [photos, pricing] = await Promise.all([
      db
        .select()
        .from(yachtPhotosTable)
        .where(eq(yachtPhotosTable.yachtId, yachtId))
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
        .where(eq(yachtTemplatePricingTable.yachtId, yachtId)),
    ]);
    const prices = pricing.map((item) => Number(item.priceEgp));

    res.json({
      ...yacht,
      name: yacht.title,
      rating: yacht.avgRating != null ? Number(yacht.avgRating) : null,
      basePriceEgp: prices.length ? Math.min(...prices).toFixed(2) : null,
      photos,
      pricing,
      reviews: [],
      host: null,
    });
  },
);

const yachtInputSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  location: z.string().min(2).max(200).optional(),
  locationId: z.string().min(1).optional(),
  customLocationName: z.string().min(2).max(200).optional(),
  categoryId: z.string().optional(),
  capacity: z.number().int().min(1).max(200),
  lengthFt: z.number().positive().optional(),
  yearBuilt: z.number().int().optional(),
  manufacturer: z.string().max(100).optional(),
  features: z.array(z.string()).optional(),
});

router.post(
  "/host/yachts",
  requireRole("host", "admin"),
  validateBody(yachtInputSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Host profile not found" });
      return;
    }

    const body = req.body as z.infer<typeof yachtInputSchema>;
    const location = await resolveYachtLocation(body);
    if (!location) {
      res.status(400).json({
        error: "Choose an active location or enter a custom location",
      });
      return;
    }
    const [yacht] = await db
      .insert(yachtsTable)
      .values({
        id: randomUUID(),
        hostId: profile.id,
        title: body.title,
        description: body.description ?? null,
        ...location,
        categoryId: body.categoryId ?? null,
        capacity: body.capacity,
        lengthFt: body.lengthFt ? String(body.lengthFt) : null,
        yearBuilt: body.yearBuilt ?? null,
        manufacturer: body.manufacturer ?? null,
        features: body.features ?? [],
        status: "draft",
      })
      .returning();
    res.status(201).json(yacht);
  },
);

const yachtUpdateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).optional(),
  location: z.string().min(2).max(200).optional(),
  locationId: z.string().min(1).nullable().optional(),
  customLocationName: z.string().min(2).max(200).nullable().optional(),
  categoryId: z.string().optional(),
  capacity: z.number().int().min(1).max(200).optional(),
  features: z.array(z.string()).optional(),
});

router.patch(
  "/host/yachts/:id",
  requireRole("host", "admin"),
  validateBody(yachtUpdateSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const id = String(req.params.id);

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Host profile not found" });
      return;
    }

    const [yacht] = await db
      .select()
      .from(yachtsTable)
      .where(and(eq(yachtsTable.id, id), eq(yachtsTable.hostId, profile.id)))
      .limit(1);
    if (!yacht) {
      res.status(404).json({ error: "Yacht not found" });
      return;
    }

    if (!["draft", "changes_requested"].includes(yacht.status)) {
      res
        .status(400)
        .json({ error: "Yacht cannot be edited in its current status" });
      return;
    }

    const body = req.body as z.infer<typeof yachtUpdateSchema>;
    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (
      body.location !== undefined ||
      body.locationId !== undefined ||
      body.customLocationName !== undefined
    ) {
      const location = await resolveYachtLocation({
        location: body.location,
        locationId: body.locationId,
        customLocationName: body.customLocationName,
      });
      if (!location) {
        res.status(400).json({
          error: "Choose an active location or enter a custom location",
        });
        return;
      }
      Object.assign(updates, location);
    }
    if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
    if (body.capacity !== undefined) updates.capacity = body.capacity;
    if (body.features !== undefined) updates.features = body.features;

    const [updated] = await db
      .update(yachtsTable)
      .set(updates as any)
      .where(eq(yachtsTable.id, id))
      .returning();
    res.json(updated);
  },
);

// ── Delete Yacht ──────────────────────────────────────────────────────────────
// Only draft or changes_requested yachts can be deleted — any live or
// pending_review yacht has potential or actual payment history and must
// be suspended or rejected by an admin instead.
router.delete(
  "/host/yachts/:id",
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const id = String(req.params.id);

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Host profile not found" });
      return;
    }

    const [yacht] = await db
      .select()
      .from(yachtsTable)
      .where(and(eq(yachtsTable.id, id), eq(yachtsTable.hostId, profile.id)))
      .limit(1);
    if (!yacht) {
      res.status(404).json({ error: "Yacht not found" });
      return;
    }

    if (!["draft", "changes_requested"].includes(yacht.status)) {
      res.status(400).json({
        error:
          "Only draft or changes_requested yachts can be deleted. " +
          "Contact support to remove a listing that is live or under review.",
      });
      return;
    }

    await db.delete(yachtsTable).where(eq(yachtsTable.id, id));
    res.json({ deleted: true });
  },
);

// ── Yacht Photos ──────────────────────────────────────────────────────────────

const photoSchema = z.object({
  url: z.string().url(),
  isPrimary: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});

router.post(
  "/host/yachts/:id/photos",
  requireRole("host", "admin"),
  validateBody(photoSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const yachtId = String(req.params.id);

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);

    const [yacht] = profile
      ? await db
          .select()
          .from(yachtsTable)
          .where(
            and(
              eq(yachtsTable.id, yachtId),
              eq(yachtsTable.hostId, profile.id),
            ),
          )
          .limit(1)
      : [];

    if (!yacht) {
      res.status(404).json({ error: "Yacht not found" });
      return;
    }

    const body = req.body as z.infer<typeof photoSchema>;

    // If new photo is primary, clear existing primary
    if (body.isPrimary) {
      await db
        .update(yachtPhotosTable)
        .set({ isPrimary: false })
        .where(
          and(
            eq(yachtPhotosTable.yachtId, yachtId),
            eq(yachtPhotosTable.isPrimary, true),
          ),
        );
    }

    const [photo] = await db
      .insert(yachtPhotosTable)
      .values({
        id: randomUUID(),
        yachtId,
        url: body.url,
        isPrimary: body.isPrimary,
        sortOrder: body.sortOrder,
      })
      .returning();

    res.status(201).json(photo);
  },
);

router.delete(
  "/host/yachts/:id/photos/:photoId",
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const yachtId = String(req.params.id);
    const photoId = String(req.params.photoId);

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);

    const [yacht] = profile
      ? await db
          .select()
          .from(yachtsTable)
          .where(
            and(
              eq(yachtsTable.id, yachtId),
              eq(yachtsTable.hostId, profile.id),
            ),
          )
          .limit(1)
      : [];

    if (!yacht) {
      res.status(404).json({ error: "Yacht not found" });
      return;
    }

    const [deleted] = await db
      .delete(yachtPhotosTable)
      .where(
        and(
          eq(yachtPhotosTable.id, photoId),
          eq(yachtPhotosTable.yachtId, yachtId),
        ),
      )
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    res.json({ deleted: true });
  },
);

// ── Availability Slots ────────────────────────────────────────────────────────
const hostAvailabilityQuerySchema = z.object({
  yachtId: z.string().min(1),
  from: dateSchema,
  to: dateSchema,
});

router.get(
  "/host/yacht-availability",
  requireRole("host", "admin"),
  validateQuery(hostAvailabilityQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const { yachtId, from, to } = req.query as unknown as z.infer<
      typeof hostAvailabilityQuerySchema
    >;
    const fromTime = Date.parse(`${from}T00:00:00Z`);
    const toTime = Date.parse(`${to}T00:00:00Z`);
    if (
      !Number.isFinite(fromTime) ||
      !Number.isFinite(toTime) ||
      toTime < fromTime
    ) {
      res.status(400).json({ error: "Invalid availability date range" });
      return;
    }
    if ((toTime - fromTime) / 86_400_000 > 62) {
      res
        .status(400)
        .json({ error: "Availability ranges cannot exceed 62 days" });
      return;
    }

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    const [yacht] = profile
      ? await db
          .select({ id: yachtsTable.id })
          .from(yachtsTable)
          .where(
            and(
              eq(yachtsTable.id, yachtId),
              eq(yachtsTable.hostId, profile.id),
            ),
          )
          .limit(1)
      : [];
    if (!yacht) {
      res.status(404).json({ error: "Yacht not found" });
      return;
    }

    const slots = await db
      .select()
      .from(availabilitySlotsTable)
      .where(
        and(
          eq(availabilitySlotsTable.yachtId, yachtId),
          gte(availabilitySlotsTable.date, from),
          lte(availabilitySlotsTable.date, to),
        ),
      )
      .orderBy(
        asc(availabilitySlotsTable.date),
        asc(availabilitySlotsTable.startTime),
      );
    const slotIds = slots.map((slot) => slot.id);
    const templateIds = [...new Set(slots.map((slot) => slot.templateId))];
    const [bookings, pricing] = await Promise.all([
      slotIds.length
        ? db
            .select({
              id: bookingsTable.id,
              slotId: bookingsTable.slotId,
              status: bookingsTable.status,
            })
            .from(bookingsTable)
            .where(inArray(bookingsTable.slotId, slotIds))
            .orderBy(desc(bookingsTable.createdAt))
        : [],
      templateIds.length
        ? db
            .select({
              templateId: yachtTemplatePricingTable.templateId,
              price: yachtTemplatePricingTable.price,
            })
            .from(yachtTemplatePricingTable)
            .where(
              and(
                eq(yachtTemplatePricingTable.yachtId, yachtId),
                inArray(yachtTemplatePricingTable.templateId, templateIds),
                eq(yachtTemplatePricingTable.isActive, true),
              ),
            )
        : [],
    ]);
    const bookingBySlot = new Map<string, (typeof bookings)[number]>();
    for (const booking of bookings) {
      if (!booking.slotId) continue;
      const current = bookingBySlot.get(booking.slotId);
      const currentIsTerminal =
        current && TERMINAL_SLOT_BOOKING_STATUSES.has(current.status);
      const nextIsTerminal = TERMINAL_SLOT_BOOKING_STATUSES.has(booking.status);
      if (!current || (currentIsTerminal && !nextIsTerminal)) {
        bookingBySlot.set(booking.slotId, booking);
      }
    }
    const priceByTemplate = new Map(
      pricing.map((item) => [item.templateId, item.price]),
    );
    const now = new Date();

    res.json({
      slots: slots
        .filter((slot) => {
          const booking = bookingBySlot.get(slot.id);
          return !(
            booking &&
            TERMINAL_SLOT_BOOKING_STATUSES.has(booking.status) &&
            !slot.isAvailable
          );
        })
        .map((slot) => {
          const linkedBooking = bookingBySlot.get(slot.id);
          const bookingId =
            linkedBooking &&
            !TERMINAL_SLOT_BOOKING_STATUSES.has(linkedBooking.status)
              ? linkedBooking.id
              : null;
          const isPast =
            slotDateTime(slot.date, slot.startTime).getTime() < now.getTime();
          const isHeld =
            !slot.isAvailable &&
            !bookingId &&
            Boolean(
              slot.holdExpiresAt &&
              slot.holdExpiresAt.getTime() > now.getTime(),
            );
          const displayStatus = isPast
            ? "past"
            : bookingId
              ? "booked"
              : isHeld
                ? "held"
                : slot.isAvailable
                  ? "available"
                  : "blocked";
          return {
            ...slot,
            effectivePriceEgp:
              slot.priceOverrideEgp ??
              priceByTemplate.get(slot.templateId) ??
              null,
            displayStatus,
            editable: !isPast && !bookingId && !isHeld,
            bookingId,
          };
        }),
    });
  },
);

const availabilityMutationSchema = z.object({
  id: z.string().min(1).optional(),
  templateId: z.string().min(1),
  date: dateSchema,
  startTime: timeSchema,
  isAvailable: z.boolean(),
  priceOverrideEgp: priceSchema.nullable().optional(),
});

const availabilityBatchSchema = z
  .object({
    slots: z.array(availabilityMutationSchema.omit({ id: true })).optional(),
    upsert: z.array(availabilityMutationSchema).optional(),
    deleteIds: z.array(z.string().min(1)).optional(),
  })
  .superRefine((value, context) => {
    const mutations: Array<z.infer<typeof availabilityMutationSchema>> = [
      ...(value.slots ?? []),
      ...(value.upsert ?? []),
    ];
    if (mutations.length === 0 && (value.deleteIds?.length ?? 0) === 0) {
      context.addIssue({
        code: "custom",
        message: "Provide at least one slot to upsert or delete",
      });
    }
    const keys = new Set<string>();
    for (const slot of mutations) {
      const key =
        slot.id ?? `${slot.templateId}|${slot.date}|${slot.startTime}`;
      if (keys.has(key)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate slot mutation: ${key}`,
        });
      }
      keys.add(key);
    }
    for (const id of value.deleteIds ?? []) {
      if (keys.has(id)) {
        context.addIssue({
          code: "custom",
          message: `A slot cannot be updated and deleted in the same request: ${id}`,
        });
      }
    }
  });

class AvailabilityConflictError extends Error {}

router.post(
  "/host/yachts/:id/availability",
  requireRole("host", "admin"),
  validateBody(availabilityBatchSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const yachtId = String(req.params.id);

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);

    const [yacht] = profile
      ? await db
          .select()
          .from(yachtsTable)
          .where(
            and(
              eq(yachtsTable.id, yachtId),
              eq(yachtsTable.hostId, profile.id),
            ),
          )
          .limit(1)
      : [];

    if (!yacht) {
      res.status(404).json({ error: "Yacht not found" });
      return;
    }

    const body = req.body as z.infer<typeof availabilityBatchSchema>;
    const mutations: Array<z.infer<typeof availabilityMutationSchema>> = [
      ...(body.slots ?? []),
      ...(body.upsert ?? []),
    ];
    const deleteIds = [...new Set(body.deleteIds ?? [])];
    const templateIds = [...new Set(mutations.map((slot) => slot.templateId))];
    const templates = templateIds.length
      ? await db
          .select({ id: bookingTemplatesTable.id })
          .from(bookingTemplatesTable)
          .where(
            and(
              inArray(bookingTemplatesTable.id, templateIds),
              eq(bookingTemplatesTable.isActive, true),
            ),
          )
      : [];
    if (templates.length !== templateIds.length) {
      res
        .status(400)
        .json({
          error: "One or more booking templates are invalid or inactive",
        });
      return;
    }

    const referencedIds = [
      ...deleteIds,
      ...mutations.flatMap((slot) => (slot.id ? [slot.id] : [])),
    ];
    if (referencedIds.length) {
      const ownedSlots = await db
        .select({ id: availabilitySlotsTable.id })
        .from(availabilitySlotsTable)
        .where(
          and(
            eq(availabilitySlotsTable.yachtId, yachtId),
            inArray(availabilitySlotsTable.id, referencedIds),
          ),
        );
      if (ownedSlots.length !== new Set(referencedIds).size) {
        res
          .status(404)
          .json({ error: "One or more availability slots were not found" });
        return;
      }
      const [linkedBooking] = await db
        .select({ id: bookingsTable.id })
        .from(bookingsTable)
        .where(
          and(
            inArray(bookingsTable.slotId, referencedIds),
            inArray(bookingsTable.status, [...IMMUTABLE_SLOT_BOOKING_STATUSES]),
          ),
        )
        .limit(1);
      if (linkedBooking) {
        res.status(409).json({
          error: "Booked slots are immutable. Create a new slot instead.",
        });
        return;
      }
    }

    try {
      const results = await db.transaction(async (tx) => {
        if (deleteIds.length) {
          await tx
            .delete(availabilitySlotsTable)
            .where(
              and(
                eq(availabilitySlotsTable.yachtId, yachtId),
                inArray(availabilitySlotsTable.id, deleteIds),
              ),
            );
        }

        const saved: Array<typeof availabilitySlotsTable.$inferSelect> = [];
        for (const slot of mutations) {
          let existingId = slot.id;
          if (!existingId) {
            const [existing] = await tx
              .select({ id: availabilitySlotsTable.id })
              .from(availabilitySlotsTable)
              .where(
                and(
                  eq(availabilitySlotsTable.yachtId, yachtId),
                  eq(availabilitySlotsTable.templateId, slot.templateId),
                  eq(availabilitySlotsTable.date, slot.date),
                  eq(availabilitySlotsTable.startTime, slot.startTime),
                  eq(availabilitySlotsTable.isAvailable, true),
                ),
              )
              .limit(1);
            existingId = existing?.id;
          }

          if (existingId) {
            const [linkedBooking] = await tx
              .select({ id: bookingsTable.id })
              .from(bookingsTable)
              .where(
                and(
                  eq(bookingsTable.slotId, existingId),
                  inArray(bookingsTable.status, [
                    ...IMMUTABLE_SLOT_BOOKING_STATUSES,
                  ]),
                ),
              )
              .limit(1);
            if (linkedBooking) {
              throw new AvailabilityConflictError(
                "Booked slots are immutable. Create a new slot instead.",
              );
            }
            const [updated] = await tx
              .update(availabilitySlotsTable)
              .set({
                templateId: slot.templateId,
                date: slot.date,
                startTime: slot.startTime,
                isAvailable: slot.isAvailable,
                priceOverrideEgp: slot.priceOverrideEgp ?? null,
                holdExpiresAt: null,
              })
              .where(
                and(
                  eq(availabilitySlotsTable.id, existingId),
                  eq(availabilitySlotsTable.yachtId, yachtId),
                ),
              )
              .returning();
            if (!updated)
              throw new AvailabilityConflictError("Availability slot changed");
            saved.push(updated);
          } else {
            const [inserted] = await tx
              .insert(availabilitySlotsTable)
              .values({
                id: randomUUID(),
                yachtId,
                templateId: slot.templateId,
                date: slot.date,
                startTime: slot.startTime,
                isAvailable: slot.isAvailable,
                priceOverrideEgp: slot.priceOverrideEgp ?? null,
              })
              .returning();
            saved.push(inserted);
          }
        }
        return saved;
      });

      const pricing = templateIds.length
        ? await db
            .select({
              templateId: yachtTemplatePricingTable.templateId,
              price: yachtTemplatePricingTable.price,
            })
            .from(yachtTemplatePricingTable)
            .where(
              and(
                eq(yachtTemplatePricingTable.yachtId, yachtId),
                inArray(yachtTemplatePricingTable.templateId, templateIds),
                eq(yachtTemplatePricingTable.isActive, true),
              ),
            )
        : [];
      const priceByTemplate = new Map(
        pricing.map((item) => [item.templateId, item.price]),
      );
      const now = Date.now();
      res.json({
        slots: results.map((slot) => {
          const isPast =
            slotDateTime(slot.date, slot.startTime).getTime() < now;
          return {
            ...slot,
            effectivePriceEgp:
              slot.priceOverrideEgp ??
              priceByTemplate.get(slot.templateId) ??
              null,
            displayStatus: isPast
              ? "past"
              : slot.isAvailable
                ? "available"
                : "blocked",
            editable: !isPast,
            bookingId: null,
          };
        }),
      });
    } catch (error) {
      if (error instanceof AvailabilityConflictError) {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
  },
);

// ── Pricing (batch upsert) ────────────────────────────────────────────────────
const pricingBatchSchema = z.object({
  pricing: z.array(
    z.object({
      templateId: z.string(),
      priceEgp: z.string().regex(/^\d+(\.\d{1,2})?$/),
    }),
  ),
});

router.put(
  "/host/yachts/:id/pricing",
  requireRole("host", "admin"),
  validateBody(pricingBatchSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const yachtId = String(req.params.id);

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);

    const [yacht] = profile
      ? await db
          .select()
          .from(yachtsTable)
          .where(
            and(
              eq(yachtsTable.id, yachtId),
              eq(yachtsTable.hostId, profile.id),
            ),
          )
          .limit(1)
      : [];

    if (!yacht) {
      res.status(404).json({ error: "Yacht not found" });
      return;
    }

    const pricing = req.body.pricing as z.infer<
      typeof pricingBatchSchema
    >["pricing"];

    const upserted = await Promise.all(
      pricing.map((item) =>
        db
          .insert(yachtTemplatePricingTable)
          .values({
            id: randomUUID(),
            yachtId,
            templateId: item.templateId,
            price: item.priceEgp,
            currency: "EGP",
            isActive: true,
          })
          .onConflictDoUpdate({
            target: [
              yachtTemplatePricingTable.yachtId,
              yachtTemplatePricingTable.templateId,
            ],
            set: { price: item.priceEgp, isActive: true },
          })
          .returning(),
      ),
    );

    const templateIds = upserted.flat().map((r) => r.templateId);
    const templates = templateIds.length
      ? await db
          .select()
          .from(bookingTemplatesTable)
          .where(inArray(bookingTemplatesTable.id, templateIds))
      : [];

    const result = upserted.flat().map((p) => {
      const tmpl = templates.find((t) => t.id === p.templateId);
      return {
        templateId: p.templateId,
        templateName: tmpl?.name ?? "",
        durationHours: tmpl?.durationHours ?? 0,
        priceEgp: p.price,
      };
    });

    res.json({ pricing: result });
  },
);

// ── Submit for Review ─────────────────────────────────────────────────────────
router.post(
  "/host/yachts/:id/submit",
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const id = String(req.params.id);

    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);

    const [yacht] = profile
      ? await db
          .select()
          .from(yachtsTable)
          .where(
            and(eq(yachtsTable.id, id), eq(yachtsTable.hostId, profile.id)),
          )
          .limit(1)
      : [];

    if (!yacht) {
      res.status(404).json({ error: "Yacht not found" });
      return;
    }

    if (!["draft", "changes_requested"].includes(yacht.status)) {
      res.status(400).json({ error: "Yacht is already submitted or approved" });
      return;
    }

    const [updated] = await db
      .update(yachtsTable)
      .set({ status: "pending_review" })
      .where(eq(yachtsTable.id, id))
      .returning();

    await db
      .insert(auditLogsTable)
      .values({
        id: randomUUID(),
        userId: user.id,
        action: "yacht.submit_for_review",
        entityType: "yacht",
        entityId: id,
        ipAddress: req.ip,
      })
      .catch(() => {});

    void recordAdminEvent({
      sectionKey: "yachts",
      entityType: "yacht",
      entityId: id,
      eventType: "yacht.submitted",
    }).catch(() => {});
    res.json(updated);
  },
);

// ── Earnings ──────────────────────────────────────────────────────────────────
router.get(
  "/host/earnings",
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Host profile not found" });
      return;
    }

    // Auto-release earnings past their eligibility date
    await db
      .update(earningsLedgerTable)
      .set({ status: "available" })
      .where(
        and(
          eq(earningsLedgerTable.hostId, profile.id),
          eq(earningsLedgerTable.status, "pending"),
          sql`${earningsLedgerTable.eligibleAt} <= NOW()`,
        ),
      )
      .catch(() => {});

    const ledger = await db
      .select()
      .from(earningsLedgerTable)
      .where(eq(earningsLedgerTable.hostId, profile.id))
      .orderBy(desc(earningsLedgerTable.createdAt))
      .limit(100);

    const totals = await db
      .select({
        status: earningsLedgerTable.status,
        total: sql<string>`COALESCE(SUM(${earningsLedgerTable.amountEgp}), 0)::text`,
      })
      .from(earningsLedgerTable)
      .where(
        and(
          eq(earningsLedgerTable.hostId, profile.id),
          eq(earningsLedgerTable.type, "earning"),
        ),
      )
      .groupBy(earningsLedgerTable.status);

    const byStatus: Record<string, string> = {};
    for (const row of totals) byStatus[row.status] = row.total;

    res.json({
      totalEarnedEgp: String(
        (
          parseFloat(byStatus["available"] ?? "0") +
          parseFloat(byStatus["pending"] ?? "0") +
          parseFloat(byStatus["withdrawn"] ?? "0")
        ).toFixed(2),
      ),
      availableEgp: byStatus["available"] ?? "0",
      pendingEgp: byStatus["pending"] ?? "0",
      withdrawnEgp: byStatus["withdrawn"] ?? "0",
      ledger,
    });
  },
);

const withdrawalInputSchema = z.object({
  amountEgp: z.string().regex(/^\d+(\.\d{1,2})?$/),
  payoutMethod: z.string().min(1),
});

// ── GET /host/earnings/ledger ─────────────────────────────────────────────────
// Dedicated ledger endpoint (spec: GET /host/earnings/ledger).
// Must be registered BEFORE the parameterised /host/earnings/:anything routes.
router.get(
  "/host/earnings/ledger",
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Host profile not found" });
      return;
    }

    const ledger = await db
      .select()
      .from(earningsLedgerTable)
      .where(eq(earningsLedgerTable.hostId, profile.id))
      .orderBy(desc(earningsLedgerTable.createdAt))
      .limit(200);

    res.json({ ledger, total: ledger.length });
  },
);

// ── POST /host/earnings/withdraw ──────────────────────────────────────────────
// Spec-aligned alias for POST /host/withdrawals.
router.post(
  "/host/earnings/withdraw",
  requireRole("host", "admin"),
  validateBody(withdrawalInputSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Host profile not found" });
      return;
    }

    const body = req.body as z.infer<typeof withdrawalInputSchema>;

    const [available] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${earningsLedgerTable.amountEgp}), 0)::text`,
      })
      .from(earningsLedgerTable)
      .where(
        and(
          eq(earningsLedgerTable.hostId, profile.id),
          eq(earningsLedgerTable.status, "available"),
        ),
      );

    const availableAmount = parseFloat(available?.total ?? "0");
    const requestedAmount = parseFloat(body.amountEgp);

    if (requestedAmount > availableAmount) {
      res.status(400).json({
        error: `Requested amount (${body.amountEgp} EGP) exceeds available balance (${available?.total ?? "0"} EGP)`,
      });
      return;
    }

    const [withdrawal] = await db
      .insert(withdrawalRequestsTable)
      .values({
        id: randomUUID(),
        hostId: profile.id,
        amountEgp: body.amountEgp,
        payoutMethod: body.payoutMethod,
        status: "withdrawal_requested",
        requestedAt: new Date(),
      })
      .returning();

    void recordAdminEvent({
      sectionKey: "withdrawals",
      entityType: "withdrawal_request",
      entityId: withdrawal.id,
      eventType: "withdrawal.requested",
    }).catch(() => {});
    res.status(201).json(withdrawal);
  },
);

// ── Withdrawals ───────────────────────────────────────────────────────────────
router.get(
  "/host/withdrawals",
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Host profile not found" });
      return;
    }

    const withdrawals = await db
      .select()
      .from(withdrawalRequestsTable)
      .where(eq(withdrawalRequestsTable.hostId, profile.id))
      .orderBy(desc(withdrawalRequestsTable.createdAt));
    res.json({ withdrawals, total: withdrawals.length });
  },
);

router.post(
  "/host/withdrawals",
  requireRole("host", "admin"),
  validateBody(withdrawalInputSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const [profile] = await db
      .select()
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "Host profile not found" });
      return;
    }

    const [available] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${earningsLedgerTable.amountEgp}), 0)::text`,
      })
      .from(earningsLedgerTable)
      .where(
        and(
          eq(earningsLedgerTable.hostId, profile.id),
          eq(earningsLedgerTable.status, "available"),
        ),
      );

    const availableAmount = parseFloat(available?.total ?? "0");
    const requestedAmount = parseFloat(req.body.amountEgp);

    if (requestedAmount > availableAmount) {
      res.status(400).json({
        error: "Insufficient available balance",
        available: availableAmount.toFixed(2),
      });
      return;
    }

    const [withdrawal] = await db
      .insert(withdrawalRequestsTable)
      .values({
        id: randomUUID(),
        hostId: profile.id,
        amountEgp: req.body.amountEgp,
        status: "withdrawal_requested",
        requestedAt: new Date(),
        payoutMethod: req.body.payoutMethod,
      })
      .returning();
    void recordAdminEvent({
      sectionKey: "withdrawals",
      entityType: "withdrawal_request",
      entityId: withdrawal.id,
      eventType: "withdrawal.requested",
    }).catch(() => {});
    res.status(201).json(withdrawal);
  },
);

export default router;
