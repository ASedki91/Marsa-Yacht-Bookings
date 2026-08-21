import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  db,
  bookingsTable,
  yachtsTable,
  yachtPhotosTable,
  bookingTemplatesTable,
  yachtTemplatePricingTable,
  addOnsTable,
  bookingAddOnsTable,
  paymentsTable,
  refundsTable,
  earningsLedgerTable,
  hostProfilesTable,
  availabilitySlotsTable,
  auditLogsTable,
  bookingCancellationTermsTable,
  bookingCancellationsTable,
  locationsTable,
} from "@workspace/db";
import { and, eq, sql, desc, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  requireAuth,
  requireRole,
  validateBody,
  validateQuery,
} from "../middlewares/index";
import { getEgpUsdRate } from "../lib/exchange";
import { notify } from "../lib/notify";
import {
  getConfiguredPaymentGateway,
  getPaymentGatewayForStoredProvider,
  PaymentGatewayUnavailableError,
  type RefundResult,
} from "../lib/payments";
import {
  addPiasters,
  egpToPiasters,
  percentageOfPiasters,
  piastersToEgp,
} from "../lib/money";
import { getActiveCancellationPolicy } from "../lib/cancellations/policy";
import { calculateCancellationQuote } from "../lib/cancellations/quote";
import { tripStartToUtc } from "../lib/cancellations/time";
import { recordAdminEvent } from "../lib/adminActivity";
import {
  BookingCreationError,
  createBookingForGuest,
} from "../lib/bookings/createBooking";

const router: IRouter = Router();

const PLATFORM_FEE_PERCENTAGE = 20;

// ── Enrich bookings with yacht + template display data ───────────────────────
async function enrichBookings(bookings: (typeof bookingsTable.$inferSelect)[]) {
  if (!bookings.length) return [];
  const yachtIds = [...new Set(bookings.map((b) => b.yachtId))];
  const templateIds = [...new Set(bookings.map((b) => b.templateId))];

  const [yachts, photos, templates] = await Promise.all([
    db
      .select({ id: yachtsTable.id, name: yachtsTable.title })
      .from(yachtsTable)
      .where(inArray(yachtsTable.id, yachtIds)),
    db
      .select({ yachtId: yachtPhotosTable.yachtId, url: yachtPhotosTable.url })
      .from(yachtPhotosTable)
      .where(inArray(yachtPhotosTable.yachtId, yachtIds)),
    db
      .select({
        id: bookingTemplatesTable.id,
        name: bookingTemplatesTable.name,
        durationHours: bookingTemplatesTable.durationHours,
      })
      .from(bookingTemplatesTable)
      .where(inArray(bookingTemplatesTable.id, templateIds)),
  ]);

  const yachtMap = new Map(yachts.map((y) => [y.id, y]));
  const photoMap = new Map<string, { url: string }[]>();
  for (const p of photos) {
    if (!photoMap.has(p.yachtId)) photoMap.set(p.yachtId, []);
    photoMap.get(p.yachtId)!.push({ url: p.url });
  }
  const templateMap = new Map(templates.map((t) => [t.id, t]));

  return bookings.map((b) => ({
    ...b,
    yacht: yachtMap.has(b.yachtId)
      ? {
          name: yachtMap.get(b.yachtId)!.name,
          photos: (photoMap.get(b.yachtId) ?? []).slice(0, 1),
        }
      : undefined,
    template: templateMap.has(b.templateId)
      ? {
          name: templateMap.get(b.templateId)!.name,
          durationHours: templateMap.get(b.templateId)!.durationHours,
        }
      : undefined,
  }));
}

// ── Create Booking ──────────────────────────────────────────────────────────
const bookingInputSchema = z
  .object({
    slotId: z.string().min(1).optional(),
    yachtId: z.string().min(1).optional(),
    templateId: z.string().min(1).optional(),
    bookingDate: z.string().min(1).optional(),
    startTime: z.string().min(1).optional(),
    guestCount: z.number().int().min(1),
    guestName: z.string().min(2).max(200),
    guestPhone: z.string().min(6).max(30),
    guestEmail: z.string().email(),
    guestNationality: z.string().max(100).optional(),
    specialRequests: z.string().max(1000).optional(),
    addOnIds: z.array(z.string()).optional(),
    acceptedCancellationPolicyId: z.string().min(1),
  })
  .superRefine((value, context) => {
    if (
      !value.slotId &&
      !(
        value.yachtId &&
        value.templateId &&
        value.bookingDate &&
        value.startTime
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "slotId is required",
        path: ["slotId"],
      });
    }
  });

router.post(
  "/bookings",
  requireAuth,
  validateBody(bookingInputSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const body = req.body as z.infer<typeof bookingInputSchema>;
    try {
      const result = await createBookingForGuest(user.id, body);
      req.log.info(
        { bookingId: result.booking.id, guestId: user.id },
        "Booking created",
      );
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof BookingCreationError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      throw error;
    }
  },
);

// ── GET /bookings/me — dedicated guest-centric alias ────────────────────────
// Must be registered BEFORE /bookings/:id so "me" isn't treated as a booking ID.
const meBookingsQuery = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
});

router.get(
  "/bookings/me",
  requireAuth,
  validateQuery(meBookingsQuery),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const { status, page } = req.query as unknown as z.infer<
      typeof meBookingsQuery
    >;
    const limit = 20;
    const offset = (page - 1) * limit;

    const where = status
      ? and(
          eq(bookingsTable.guestId, user.id),
          eq(bookingsTable.status, status as any),
        )
      : eq(bookingsTable.guestId, user.id);

    const [bookings, [countRow]] = await Promise.all([
      db
        .select()
        .from(bookingsTable)
        .where(where)
        .orderBy(desc(bookingsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookingsTable)
        .where(where),
    ]);

    res.json({
      bookings: await enrichBookings(bookings),
      total: countRow?.count ?? 0,
      page,
    });
  },
);

// ── List My Bookings ────────────────────────────────────────────────────────
const listBookingsQuery = z.object({
  role: z.enum(["guest", "host", "all"]).optional().default("guest"),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
});

router.get(
  "/bookings",
  requireAuth,
  validateQuery(listBookingsQuery),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const { role, status, page } = req.query as unknown as z.infer<
      typeof listBookingsQuery
    >;
    const limit = 20;
    const offset = (page - 1) * limit;

    let whereClause: any;

    if (role === "all") {
      // Return both guest bookings and host (incoming) bookings merged
      const guestWhere = status
        ? and(
            eq(bookingsTable.guestId, user.id),
            eq(bookingsTable.status, status as any),
          )
        : eq(bookingsTable.guestId, user.id);

      const [profile] = await db
        .select()
        .from(hostProfilesTable)
        .where(eq(hostProfilesTable.userId, user.id))
        .limit(1);

      const hostYachts = profile
        ? await db
            .select({ id: yachtsTable.id })
            .from(yachtsTable)
            .where(eq(yachtsTable.hostId, profile.id))
        : [];
      const yachtIds = hostYachts.map((y) => y.id);

      let allBookings: (typeof bookingsTable.$inferSelect)[];

      if (yachtIds.length > 0) {
        const hostWhere = status
          ? and(
              inArray(bookingsTable.yachtId, yachtIds),
              eq(bookingsTable.status, status as any),
            )
          : inArray(bookingsTable.yachtId, yachtIds);

        const [guestBookings, hostBookings] = await Promise.all([
          db.select().from(bookingsTable).where(guestWhere),
          db.select().from(bookingsTable).where(hostWhere),
        ]);

        // Merge, deduplicating by booking id (e.g. a host booked their own yacht)
        const seen = new Set<string>();
        allBookings = [];
        for (const b of [...guestBookings, ...hostBookings]) {
          if (!seen.has(b.id)) {
            seen.add(b.id);
            allBookings.push(b);
          }
        }
      } else {
        allBookings = await db.select().from(bookingsTable).where(guestWhere);
      }

      allBookings.sort(
        (a, b) =>
          new Date(String(b.createdAt)).getTime() -
          new Date(String(a.createdAt)).getTime(),
      );
      const total = allBookings.length;
      const bookings = allBookings.slice(offset, offset + limit);
      res.json({ bookings: await enrichBookings(bookings), total, page });
      return;
    } else if (role === "host") {
      const [profile] = await db
        .select()
        .from(hostProfilesTable)
        .where(eq(hostProfilesTable.userId, user.id))
        .limit(1);

      if (!profile) {
        res.json({ bookings: [], total: 0, page });
        return;
      }

      const hostYachts = await db
        .select({ id: yachtsTable.id })
        .from(yachtsTable)
        .where(eq(yachtsTable.hostId, profile.id));

      if (hostYachts.length === 0) {
        res.json({ bookings: [], total: 0, page });
        return;
      }

      const yachtIds = hostYachts.map((y) => y.id);
      whereClause = status
        ? and(
            inArray(bookingsTable.yachtId, yachtIds),
            eq(bookingsTable.status, status as any),
          )
        : inArray(bookingsTable.yachtId, yachtIds);
    } else {
      whereClause = status
        ? and(
            eq(bookingsTable.guestId, user.id),
            eq(bookingsTable.status, status as any),
          )
        : eq(bookingsTable.guestId, user.id);
    }

    const [bookings, [countRow]] = await Promise.all([
      db
        .select()
        .from(bookingsTable)
        .where(whereClause)
        .orderBy(desc(bookingsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookingsTable)
        .where(whereClause),
    ]);

    res.json({
      bookings: await enrichBookings(bookings),
      total: countRow?.count ?? 0,
      page,
    });
  },
);

// ── Get Booking ─────────────────────────────────────────────────────────────
router.get(
  "/bookings/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const id = String(req.params.id);

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if (user.role !== "admin" && booking.guestId !== user.id) {
      const [profile] = await db
        .select()
        .from(hostProfilesTable)
        .where(eq(hostProfilesTable.userId, user.id))
        .limit(1);
      const [ownedYacht] = profile
        ? await db
            .select()
            .from(yachtsTable)
            .where(
              and(
                eq(yachtsTable.id, booking.yachtId),
                eq(yachtsTable.hostId, profile.id),
              ),
            )
            .limit(1)
        : [];
      if (!ownedYacht) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    // Fetch add-ons and payment info in parallel for receipt display
    const [bookingAddOnRows, payment, template, cancellationTerms] =
      await Promise.all([
        db
          .select({
            id: addOnsTable.id,
            name: addOnsTable.name,
            priceEgp: addOnsTable.priceEgp,
          })
          .from(bookingAddOnsTable)
          .innerJoin(
            addOnsTable,
            eq(bookingAddOnsTable.addOnId, addOnsTable.id),
          )
          .where(eq(bookingAddOnsTable.bookingId, id)),
        db
          .select({
            provider: paymentsTable.provider,
            providerPaymentId: paymentsTable.providerPaymentId,
            isTest: paymentsTable.isTest,
            stripePaymentIntentId: paymentsTable.stripePaymentIntentId,
            status: paymentsTable.status,
            amountEgp: paymentsTable.amountEgp,
            amountUsd: paymentsTable.amountUsd,
            receiptUrl: paymentsTable.receiptUrl,
          })
          .from(paymentsTable)
          .where(eq(paymentsTable.bookingId, id))
          .limit(1),
        db
          .select({
            name: bookingTemplatesTable.name,
            durationHours: bookingTemplatesTable.durationHours,
          })
          .from(bookingTemplatesTable)
          .where(eq(bookingTemplatesTable.id, booking.templateId))
          .limit(1),
        db
          .select()
          .from(bookingCancellationTermsTable)
          .where(eq(bookingCancellationTermsTable.bookingId, id))
          .limit(1),
      ]);

    res.json({
      ...booking,
      addOns: bookingAddOnRows,
      paymentStatus: payment[0]?.status ?? null,
      paymentProvider: payment[0]?.provider ?? null,
      providerPaymentId: payment[0]?.providerPaymentId ?? null,
      isTestPayment: payment[0]?.isTest ?? false,
      stripePaymentIntentId: payment[0]?.stripePaymentIntentId ?? null,
      receiptUrl: payment[0]?.receiptUrl ?? null,
      totalAmountUsd: payment[0]?.amountUsd ?? null,
      templateName: template[0]?.name ?? null,
      cancellationTerms: cancellationTerms[0]
        ? {
            policyName: cancellationTerms[0].policyName,
            policyVersion: cancellationTerms[0].policyVersion,
            tripStartsAt: cancellationTerms[0].tripStartsAt,
            timeZone: cancellationTerms[0].timeZone,
            rules: cancellationTerms[0].rulesSnapshot,
          }
        : null,
    });
  },
);

// ── Cancel Booking ──────────────────────────────────────────────────────────
const cancellationSchema = z.object({
  reason: z.string().max(500).optional(),
  acceptedRuleId: z.string().optional(),
  acceptedFeeAmountEgp: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
});

function cancellationResponse(
  cancellation: typeof bookingCancellationsTable.$inferSelect,
) {
  return {
    ...cancellation,
    manualReviewRequired:
      cancellation.policyId === null ||
      cancellation.feeAmountEgp === null ||
      cancellation.refundAmountEgp === null,
  };
}

router.get(
  "/bookings/:id/cancellation-quote",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const bookingId = String(req.params.id);
    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId))
      .limit(1);
    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (booking.guestId !== user.id && user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (
      !["pending_payment", "paid_under_review", "confirmed"].includes(
        booking.status,
      )
    ) {
      res
        .status(409)
        .json({ error: "Booking cannot be cancelled in its current status" });
      return;
    }
    const [terms] = await db
      .select()
      .from(bookingCancellationTermsTable)
      .where(eq(bookingCancellationTermsTable.bookingId, bookingId))
      .limit(1);
    try {
      res.json(calculateCancellationQuote(booking, terms ?? null));
    } catch (error) {
      res.status(409).json({
        error:
          error instanceof Error
            ? error.message
            : "Booking can no longer be cancelled",
      });
    }
  },
);

router.post(
  "/bookings/:id/cancel",
  requireAuth,
  validateBody(cancellationSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const id = String(req.params.id);

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (booking.guestId !== user.id && user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (
      !["pending_payment", "paid_under_review", "confirmed"].includes(
        booking.status,
      )
    ) {
      const [existing] = await db
        .select()
        .from(bookingCancellationsTable)
        .where(
          and(
            eq(bookingCancellationsTable.bookingId, id),
            inArray(bookingCancellationsTable.status, [
              "pending",
              "processing",
            ]),
          ),
        )
        .limit(1);
      if (existing) {
        res.json(cancellationResponse(existing));
        return;
      }
      res
        .status(409)
        .json({ error: "Booking cannot be cancelled in its current status" });
      return;
    }

    const [terms] = await db
      .select()
      .from(bookingCancellationTermsTable)
      .where(eq(bookingCancellationTermsTable.bookingId, id))
      .limit(1);
    let quote;
    try {
      quote = calculateCancellationQuote(booking, terms ?? null);
    } catch (error) {
      res.status(409).json({
        error:
          error instanceof Error
            ? error.message
            : "Booking can no longer be cancelled",
      });
      return;
    }
    const body = req.body as z.infer<typeof cancellationSchema>;
    const quoteAcceptanceMissing =
      !quote.manualReviewRequired &&
      (body.acceptedRuleId === undefined ||
        body.acceptedFeeAmountEgp === undefined);
    const acceptedQuoteChanged =
      quoteAcceptanceMissing ||
      (body.acceptedRuleId !== undefined &&
        body.acceptedRuleId !== (quote.matchedRuleId ?? undefined)) ||
      (body.acceptedFeeAmountEgp !== undefined &&
        quote.feeAmountEgp !== null &&
        egpToPiasters(body.acceptedFeeAmountEgp) !==
          egpToPiasters(quote.feeAmountEgp));
    if (acceptedQuoteChanged) {
      res.status(409).json({
        error: "Cancellation terms changed. Review the latest quote.",
        quote,
      });
      return;
    }

    const cancellationId = randomUUID();
    try {
      const cancellation = await db.transaction(async (tx) => {
        const [updatedBooking] = await tx
          .update(bookingsTable)
          .set({ status: "cancel_requested" })
          .where(
            and(
              eq(bookingsTable.id, id),
              inArray(bookingsTable.status, [
                "pending_payment",
                "paid_under_review",
                "confirmed",
              ]),
            ),
          )
          .returning({ id: bookingsTable.id });
        if (!updatedBooking) throw new Error("BOOKING_STATUS_CHANGED");

        const [created] = await tx
          .insert(bookingCancellationsTable)
          .values({
            id: cancellationId,
            bookingId: id,
            requestedBy: user.id,
            reason: body.reason ?? null,
            requestedAt: new Date(quote.requestedAt),
            bookingStatusBeforeRequest: booking.status,
            tripStartsAt: new Date(quote.tripStartsAt),
            remainingMinutes: quote.remainingMinutes,
            policyId: terms?.policyId ?? null,
            policyVersion: terms?.policyVersion ?? null,
            matchedRuleId: quote.matchedRuleId,
            feePercentage: quote.feePercentage,
            originalAmountEgp: quote.originalAmountEgp,
            feeAmountEgp: quote.feeAmountEgp,
            refundAmountEgp: quote.refundAmountEgp,
            status: "pending",
          })
          .returning();
        await tx.insert(auditLogsTable).values({
          id: randomUUID(),
          userId: user.id,
          action: "booking.cancel_requested",
          entityType: "booking",
          entityId: id,
          newValue: {
            cancellationId,
            reason: body.reason ?? null,
            feePercentage: quote.feePercentage,
          },
          ipAddress: req.ip,
        });
        return created;
      });
      void recordAdminEvent({
        sectionKey: "cancellations",
        entityType: "booking_cancellation",
        entityId: cancellation.id,
        eventType: "cancellation.requested",
      }).catch(() => {});
      res.json(cancellationResponse(cancellation));
    } catch (error) {
      const [existing] = await db
        .select()
        .from(bookingCancellationsTable)
        .where(
          and(
            eq(bookingCancellationsTable.bookingId, id),
            inArray(bookingCancellationsTable.status, [
              "pending",
              "processing",
            ]),
          ),
        )
        .limit(1);
      if (existing) {
        res.json(cancellationResponse(existing));
        return;
      }
      if (
        error instanceof Error &&
        error.message === "BOOKING_STATUS_CHANGED"
      ) {
        res
          .status(409)
          .json({ error: "Booking status changed; refresh and try again" });
        return;
      }
      throw error;
    }
  },
);

// ── Host: Confirm Booking ───────────────────────────────────────────────────
router.post(
  "/bookings/:id/confirm",
  requireAuth,
  requireRole("host", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const id = String(req.params.id);

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if (user.role !== "admin") {
      const [profile] = await db
        .select()
        .from(hostProfilesTable)
        .where(eq(hostProfilesTable.userId, user.id))
        .limit(1);
      const [ownedYacht] = profile
        ? await db
            .select()
            .from(yachtsTable)
            .where(
              and(
                eq(yachtsTable.id, booking.yachtId),
                eq(yachtsTable.hostId, profile.id),
              ),
            )
            .limit(1)
        : [];
      if (!ownedYacht) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    if (booking.status !== "paid_under_review") {
      res.status(400).json({ error: "Only paid bookings can be confirmed" });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(bookingsTable)
      .set({ status: "confirmed", confirmedBy: user.id, confirmedAt: now })
      .where(eq(bookingsTable.id, id))
      .returning();

    // Create earnings ledger: hold releases 3 days after the booking date
    // (not 3 days from confirmation — ensures trip has occurred before funds release).
    const tripDate = new Date(booking.bookingDate);
    const eligibleAt = new Date(tripDate.getTime() + 3 * 24 * 60 * 60 * 1000);
    const [yacht] = await db
      .select()
      .from(yachtsTable)
      .where(eq(yachtsTable.id, booking.yachtId))
      .limit(1);

    if (yacht) {
      await db
        .insert(earningsLedgerTable)
        .values({
          id: randomUUID(),
          hostId: yacht.hostId,
          bookingId: id,
          amountEgp: booking.hostEarningsEgp,
          type: "earning",
          status: "pending",
          eligibleAt,
        })
        .catch(() => {});
    }

    notify({
      userId: booking.guestId,
      type: "booking.confirmed",
      title: "Booking confirmed!",
      message: `Your booking on ${booking.bookingDate} has been confirmed.`,
      relatedEntityType: "booking",
      relatedEntityId: id,
    });

    await db
      .insert(auditLogsTable)
      .values({
        id: randomUUID(),
        userId: user.id,
        action: "booking.confirmed",
        entityType: "booking",
        entityId: id,
        ipAddress: req.ip,
      })
      .catch(() => {});

    res.json(updated);
  },
);

// ── Host: Reject Booking ────────────────────────────────────────────────────
const rejectionSchema = z.object({
  reason: z.string().max(500).optional(),
});

router.post(
  "/bookings/:id/reject",
  requireAuth,
  requireRole("host", "admin"),
  validateBody(rejectionSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const id = String(req.params.id);

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, id))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if (user.role !== "admin") {
      const [profile] = await db
        .select()
        .from(hostProfilesTable)
        .where(eq(hostProfilesTable.userId, user.id))
        .limit(1);
      const [ownedYacht] = profile
        ? await db
            .select()
            .from(yachtsTable)
            .where(
              and(
                eq(yachtsTable.id, booking.yachtId),
                eq(yachtsTable.hostId, profile.id),
              ),
            )
            .limit(1)
        : [];
      if (!ownedYacht) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    if (booking.status !== "paid_under_review") {
      res.status(409).json({
        error:
          booking.status === "cancel_requested"
            ? "Cancellation requests must be processed by an admin"
            : "Cannot reject booking in current status",
      });
      return;
    }

    // Stripe refund if payment succeeded.
    // IMPORTANT: we must only transition to rejected_refunded AFTER the refund
    // is successfully created. If Stripe fails, return 502 and leave the booking
    // in its current status so the operation can be safely retried.
    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.bookingId, id),
          eq(paymentsTable.status, "succeeded"),
        ),
      )
      .limit(1);

    const providerPaymentId =
      payment?.providerPaymentId ?? payment?.stripePaymentIntentId ?? null;
    if (!payment || !providerPaymentId) {
      res.status(409).json({ error: "A succeeded payment could not be found" });
      return;
    }

    const reason =
      (req.body as z.infer<typeof rejectionSchema>).reason ??
      "Booking rejected";
    let providerRefund: RefundResult | undefined;
    if (providerPaymentId) {
      try {
        const gateway = getPaymentGatewayForStoredProvider(payment.provider);
        const refundResult = await gateway.refund({
          providerPaymentId,
          amountEgp: booking.totalAmountEgp,
          idempotencyKey: `booking-rejection:${id}`,
          reason,
        });
        providerRefund = refundResult;
        await db
          .insert(refundsTable)
          .values({
            id: randomUUID(),
            paymentId: payment.id,
            bookingId: id,
            provider: refundResult.provider,
            providerRefundId: refundResult.providerRefundId,
            stripeRefundId:
              refundResult.provider === "stripe"
                ? refundResult.providerRefundId
                : null,
            isTest: refundResult.isTest,
            amountEgp: booking.totalAmountEgp,
            reason,
            status: refundResult.status,
            initiatedBy: user.id,
          })
          .then(async () => {
            await db
              .update(paymentsTable)
              .set({
                status:
                  refundResult.status === "succeeded"
                    ? "refunded"
                    : "refund_pending",
              })
              .where(eq(paymentsTable.id, payment.id));
          });
      } catch (err) {
        // Refund creation failed — do NOT change booking status; let caller retry.
        req.log.error(
          { err, provider: payment.provider },
          "Payment refund failed during booking rejection",
        );
        res.status(502).json({
          error:
            "Refund could not be initiated. Booking status is unchanged; please retry.",
        });
        return;
      }
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: "rejected_refunded" })
      .where(
        and(
          eq(bookingsTable.id, id),
          eq(bookingsTable.status, "paid_under_review"),
        ),
      )
      .returning();
    if (!updated) {
      res
        .status(409)
        .json({ error: "Booking status changed; refresh and try again" });
      return;
    }

    if (booking.slotId) {
      const [oldSlot] = await db
        .update(availabilitySlotsTable)
        .set({ holdExpiresAt: null })
        .where(eq(availabilitySlotsTable.id, booking.slotId))
        .returning();
      if (oldSlot && providerRefund?.status === "succeeded") {
        await db
          .insert(availabilitySlotsTable)
          .values({
            id: randomUUID(),
            yachtId: oldSlot.yachtId,
            templateId: oldSlot.templateId,
            date: oldSlot.date,
            startTime: oldSlot.startTime,
            isAvailable: true,
            priceOverrideEgp: oldSlot.priceOverrideEgp,
          })
          .onConflictDoNothing();
      }
    }

    notify({
      userId: booking.guestId,
      type: "booking.rejected",
      title: "Booking rejected",
      message: `${reason}. Your refund has been ${
        providerRefund?.status === "succeeded" ? "completed" : "initiated"
      }.`,
      relatedEntityType: "booking",
      relatedEntityId: id,
    });

    await db
      .insert(auditLogsTable)
      .values({
        id: randomUUID(),
        userId: user.id,
        action: "booking.rejected",
        entityType: "booking",
        entityId: id,
        newValue: {
          reason,
          refundStatus: providerRefund?.status ?? "pending",
          provider: payment.provider,
        },
        ipAddress: req.ip,
      })
      .catch(() => {});

    res.json(updated);
  },
);

export default router;
