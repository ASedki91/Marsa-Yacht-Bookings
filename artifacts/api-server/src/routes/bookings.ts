import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  db,
  bookingsTable,
  yachtsTable,
  yachtTemplatePricingTable,
  addOnsTable,
  bookingAddOnsTable,
  paymentsTable,
  refundsTable,
  earningsLedgerTable,
  hostProfilesTable,
  availabilitySlotsTable,
  auditLogsTable,
} from "@workspace/db";
import { and, eq, sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, requireRole, validateBody, validateQuery } from "../middlewares/index";
import { stripe } from "../lib/stripe";
import { egpToUsdCents, getEgpUsdRate } from "../lib/exchange";
import { notify } from "../lib/notify";

const router: IRouter = Router();

const PLATFORM_FEE_PCT = 0.15;

// ── Create Booking ──────────────────────────────────────────────────────────
const bookingInputSchema = z.object({
  yachtId: z.string().min(1),
  templateId: z.string().min(1),
  bookingDate: z.string().min(1),
  startTime: z.string().min(1),
  guestCount: z.number().int().min(1),
  guestName: z.string().min(2).max(200),
  guestPhone: z.string().min(6).max(30),
  guestEmail: z.string().email(),
  guestNationality: z.string().max(100).optional(),
  specialRequests: z.string().max(1000).optional(),
  addOnIds: z.array(z.string()).optional(),
});

router.post(
  "/bookings",
  requireAuth,
  validateBody(bookingInputSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const body = req.body as z.infer<typeof bookingInputSchema>;

    // Verify yacht is live
    const [yacht] = await db
      .select()
      .from(yachtsTable)
      .where(and(eq(yachtsTable.id, body.yachtId), eq(yachtsTable.status, "live")))
      .limit(1);

    if (!yacht) {
      res.status(404).json({ error: "Yacht not found or not available" });
      return;
    }

    if (body.guestCount > yacht.capacity) {
      res.status(400).json({ error: `Guest count exceeds yacht capacity of ${yacht.capacity}` });
      return;
    }

    // Verify pricing
    const [pricing] = await db
      .select()
      .from(yachtTemplatePricingTable)
      .where(
        and(
          eq(yachtTemplatePricingTable.yachtId, body.yachtId),
          eq(yachtTemplatePricingTable.templateId, body.templateId),
          eq(yachtTemplatePricingTable.isActive, true),
        ),
      )
      .limit(1);

    if (!pricing) {
      res.status(400).json({ error: "Pricing not available for this template" });
      return;
    }

    // Check slot availability
    const [slot] = await db
      .select()
      .from(availabilitySlotsTable)
      .where(
        and(
          eq(availabilitySlotsTable.yachtId, body.yachtId),
          eq(availabilitySlotsTable.templateId, body.templateId),
          eq(availabilitySlotsTable.date, body.bookingDate),
          eq(availabilitySlotsTable.startTime, body.startTime),
          eq(availabilitySlotsTable.isAvailable, true),
        ),
      )
      .limit(1);

    if (!slot) {
      res.status(400).json({ error: "Requested slot is not available" });
      return;
    }

    // Calculate add-on totals
    let addOnTotal = 0;
    const addOns =
      body.addOnIds?.length
        ? await db
            .select()
            .from(addOnsTable)
            .where(sql`${addOnsTable.id} = ANY(${body.addOnIds})`)
        : [];
    for (const addOn of addOns) addOnTotal += parseFloat(addOn.priceEgp);

    const baseAmount = parseFloat(pricing.price);
    const totalAmount = baseAmount + addOnTotal;
    const platformFee = parseFloat((totalAmount * PLATFORM_FEE_PCT).toFixed(2));
    const hostEarnings = parseFloat((totalAmount - platformFee).toFixed(2));

    const amountUsdCents = await egpToUsdCents(totalAmount);
    const { rate: exchangeRate } = await getEgpUsdRate();

    // Create Stripe PaymentIntent
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountUsdCents,
        currency: "usd",
        metadata: {
          yachtId: body.yachtId,
          templateId: body.templateId,
          guestId: user.id,
          egpAmount: String(totalAmount),
        },
        automatic_payment_methods: { enabled: true },
      });
    } catch (err: any) {
      req.log.error({ err }, "Stripe PaymentIntent creation failed");
      res.status(502).json({ error: "Payment service unavailable. Please try again." });
      return;
    }

    const bookingId = randomUUID();
    const [booking] = await db
      .insert(bookingsTable)
      .values({
        id: bookingId,
        guestId: user.id,
        yachtId: body.yachtId,
        templateId: body.templateId,
        slotId: slot.id,
        bookingDate: body.bookingDate,
        startTime: body.startTime,
        guestCount: body.guestCount,
        guestName: body.guestName,
        guestPhone: body.guestPhone,
        guestEmail: body.guestEmail,
        guestNationality: body.guestNationality ?? null,
        specialRequests: body.specialRequests ?? null,
        baseAmountEgp: String(baseAmount),
        baseAmountUsd: String((amountUsdCents / 100).toFixed(2)),
        exchangeRateUsed: String(exchangeRate),
        platformFeeEgp: String(platformFee),
        hostEarningsEgp: String(hostEarnings),
        totalAmountEgp: String(totalAmount),
        status: "pending_payment",
      })
      .returning();

    // Create payment record
    await db.insert(paymentsTable).values({
      id: randomUUID(),
      bookingId,
      stripePaymentIntentId: paymentIntent.id,
      amountEgp: String(totalAmount),
      amountUsd: String((amountUsdCents / 100).toFixed(2)),
      currency: "EGP",
      status: "created",
    });

    // Add-on line items
    if (addOns.length > 0) {
      await db.insert(bookingAddOnsTable).values(
        addOns.map((a) => ({
          id: randomUUID(),
          bookingId,
          addOnId: a.id,
          priceAtBookingEgp: a.priceEgp,
        })),
      );
    }

    // Reserve the slot
    await db
      .update(availabilitySlotsTable)
      .set({ isAvailable: false })
      .where(eq(availabilitySlotsTable.id, slot.id));

    req.log.info({ bookingId, guestId: user.id }, "Booking created");

    res.status(201).json({
      booking,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
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
    const { status, page } = req.query as unknown as z.infer<typeof meBookingsQuery>;
    const limit = 20;
    const offset = (page - 1) * limit;

    const where = status
      ? and(eq(bookingsTable.guestId, user.id), eq(bookingsTable.status, status as any))
      : eq(bookingsTable.guestId, user.id);

    const [bookings, [countRow]] = await Promise.all([
      db
        .select()
        .from(bookingsTable)
        .where(where)
        .orderBy(desc(bookingsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(bookingsTable).where(where),
    ]);

    res.json({ bookings, total: countRow?.count ?? 0, page });
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
    const { role, status, page } = req.query as unknown as z.infer<typeof listBookingsQuery>;
    const limit = 20;
    const offset = (page - 1) * limit;

    let whereClause: any;

    if (role === "all") {
      // Return both guest bookings and host (incoming) bookings merged
      const guestWhere = status
        ? and(eq(bookingsTable.guestId, user.id), eq(bookingsTable.status, status as any))
        : eq(bookingsTable.guestId, user.id);

      const [profile] = await db
        .select()
        .from(hostProfilesTable)
        .where(eq(hostProfilesTable.userId, user.id))
        .limit(1);

      const hostYachts = profile
        ? await db.select({ id: yachtsTable.id }).from(yachtsTable).where(eq(yachtsTable.hostId, profile.id))
        : [];
      const yachtIds = hostYachts.map((y) => y.id);

      let allBookings: (typeof bookingsTable.$inferSelect)[];

      if (yachtIds.length > 0) {
        const hostWhere = status
          ? and(sql`${bookingsTable.yachtId} = ANY(${yachtIds})`, eq(bookingsTable.status, status as any))
          : sql`${bookingsTable.yachtId} = ANY(${yachtIds})`;

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

      allBookings.sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime());
      const total = allBookings.length;
      const bookings = allBookings.slice(offset, offset + limit);
      res.json({ bookings, total, page });
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
        ? and(sql`${bookingsTable.yachtId} = ANY(${yachtIds})`, eq(bookingsTable.status, status as any))
        : sql`${bookingsTable.yachtId} = ANY(${yachtIds})`;
    } else {
      whereClause = status
        ? and(eq(bookingsTable.guestId, user.id), eq(bookingsTable.status, status as any))
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

    res.json({ bookings, total: countRow?.count ?? 0, page });
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
            .where(and(eq(yachtsTable.id, booking.yachtId), eq(yachtsTable.hostId, profile.id)))
            .limit(1)
        : [];
      if (!ownedYacht) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    res.json(booking);
  },
);

// ── Cancel Booking ──────────────────────────────────────────────────────────
const cancellationSchema = z.object({
  reason: z.string().max(500).optional(),
});

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
    if (!["pending_payment", "paid_under_review", "confirmed"].includes(booking.status)) {
      res.status(400).json({ error: "Booking cannot be cancelled in its current status" });
      return;
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: "cancel_requested" })
      .where(eq(bookingsTable.id, id))
      .returning();

    if (booking.slotId) {
      await db
        .update(availabilitySlotsTable)
        .set({ isAvailable: true })
        .where(eq(availabilitySlotsTable.id, booking.slotId));
    }

    await db
      .insert(auditLogsTable)
      .values({
        id: randomUUID(),
        userId: user.id,
        action: "booking.cancel_requested",
        entityType: "booking",
        entityId: id,
        newValue: { reason: (req.body as any).reason ?? null },
        ipAddress: req.ip,
      })
      .catch(() => {});

    res.json(updated);
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
            .where(and(eq(yachtsTable.id, booking.yachtId), eq(yachtsTable.hostId, profile.id)))
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

    // Create earnings ledger (3-day hold)
    const eligibleAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
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
            .where(and(eq(yachtsTable.id, booking.yachtId), eq(yachtsTable.hostId, profile.id)))
            .limit(1)
        : [];
      if (!ownedYacht) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    if (!["paid_under_review", "cancel_requested"].includes(booking.status)) {
      res.status(400).json({ error: "Cannot reject booking in current status" });
      return;
    }

    // Stripe refund if payment succeeded.
    // IMPORTANT: we must only transition to rejected_refunded AFTER the refund
    // is successfully created. If Stripe fails, return 502 and leave the booking
    // in its current status so the operation can be safely retried.
    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(and(eq(paymentsTable.bookingId, id), eq(paymentsTable.status, "succeeded")))
      .limit(1);

    if (payment?.stripePaymentIntentId) {
      try {
        const stripeRefund = await stripe.refunds.create({
          payment_intent: payment.stripePaymentIntentId,
        });
        await db
          .insert(refundsTable)
          .values({
            id: randomUUID(),
            paymentId: payment.id,
            bookingId: id,
            stripeRefundId: stripeRefund.id,
            amountEgp: booking.totalAmountEgp,
            reason: (req.body as any).reason ?? "Booking rejected",
            status: "pending",
            initiatedBy: user.id,
          })
          .catch(() => {});
      } catch (err) {
        // Refund creation failed — do NOT change booking status; let caller retry.
        req.log.error({ err }, "Stripe refund failed during booking rejection");
        res.status(502).json({
          error: "Refund could not be initiated with Stripe. Booking status unchanged — please retry.",
        });
        return;
      }
    }

    const [updated] = await db
      .update(bookingsTable)
      .set({ status: "rejected_refunded" })
      .where(eq(bookingsTable.id, id))
      .returning();

    if (booking.slotId) {
      await db
        .update(availabilitySlotsTable)
        .set({ isAvailable: true })
        .where(eq(availabilitySlotsTable.id, booking.slotId));
    }

    notify({
      userId: booking.guestId,
      type: "booking.rejected",
      title: "Booking rejected",
      message:
        (req.body as any).reason ??
        "Your booking has been rejected and a refund has been initiated.",
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
        newValue: { reason: (req.body as any).reason ?? null },
        ipAddress: req.ip,
      })
      .catch(() => {});

    res.json(updated);
  },
);

export default router;
