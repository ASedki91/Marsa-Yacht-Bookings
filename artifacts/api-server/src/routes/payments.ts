import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  paymentsTable,
  bookingsTable,
  hostProfilesTable,
  yachtsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth, validateBody } from "../middlewares/index";
import { stripe } from "../lib/stripe";

const router: IRouter = Router();

// ── GET /payments/:bookingId ──────────────────────────────────────────────────
/**
 * Fetch payment details for a booking.
 * Accessible by the guest who made the booking, the host, or an admin.
 */
router.get(
  "/payments/:bookingId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const bookingId = String(req.params.bookingId);

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    // Access control: guest, host, or admin
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

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.bookingId, bookingId))
      .limit(1);

    if (!payment) {
      res.status(404).json({ error: "Payment record not found" });
      return;
    }

    res.json({ payment });
  },
);

// ── POST /payments/intent ─────────────────────────────────────────────────────
/**
 * Retrieve the client secret for an existing booking's PaymentIntent.
 * Used when the client needs to resume a payment (e.g. app restart, retry).
 */
const paymentIntentBodySchema = z.object({
  bookingId: z.string().min(1),
});

router.post(
  "/payments/intent",
  requireAuth,
  validateBody(paymentIntentBodySchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const { bookingId } = req.body as z.infer<typeof paymentIntentBodySchema>;

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.guestId, user.id)))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    if (booking.status !== "pending_payment") {
      res.status(400).json({ error: "Payment is no longer pending for this booking" });
      return;
    }

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.bookingId, bookingId))
      .limit(1);

    if (!payment?.stripePaymentIntentId) {
      res.status(404).json({ error: "Payment intent not found" });
      return;
    }

    try {
      const pi = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId);
      res.json({
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        status: pi.status,
        amountUsd: (pi.amount / 100).toFixed(2),
      });
    } catch (err: any) {
      req.log.error({ err }, "Failed to retrieve PaymentIntent from Stripe");
      res.status(502).json({ error: "Payment service unavailable" });
    }
  },
);

export default router;
