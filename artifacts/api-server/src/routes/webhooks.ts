import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  bookingsTable,
  paymentsTable,
  refundsTable,
  yachtsTable,
  hostProfilesTable,
  auditLogsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { stripe } from "../lib/stripe";
import { notify } from "../lib/notify";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * POST /webhooks/stripe
 * express.json() is configured in app.ts to save req.rawBody for this path.
 */
router.post("/webhooks/stripe", async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers["stripe-signature"] as string | undefined;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = (req as any).rawBody as string | undefined;

  let event;
  try {
    if (webhookSecret && sig && rawBody) {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      // Dev / no-secret fallback — use parsed JSON body
      event = req.body;
      if (!event?.type) {
        res.status(400).json({ error: "Missing event type" });
        return;
      }
      logger.warn(
        { hasSecret: !!webhookSecret, hasSig: !!sig },
        "Stripe webhook: signature validation skipped",
      );
    }
  } catch (err: any) {
    logger.error({ err }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: `Webhook error: ${err.message}` });
    return;
  }

  try {
    switch (event.type) {
      // ── Payment succeeded ──────────────────────────────────────────────────
      case "payment_intent.succeeded": {
        const pi = event.data.object as { id: string };

        const [[payment], _] = await Promise.all([
          db
            .update(paymentsTable)
            .set({ status: "succeeded" })
            .where(eq(paymentsTable.stripePaymentIntentId, pi.id))
            .returning(),
          Promise.resolve(), // placeholder
        ]);

        if (!payment) {
          logger.warn({ piId: pi.id }, "Webhook: no payment row for PI");
          break;
        }

        const [booking] = await db
          .update(bookingsTable)
          .set({ status: "paid_under_review" })
          .where(
            and(
              eq(bookingsTable.id, payment.bookingId),
              eq(bookingsTable.status, "pending_payment"),
            ),
          )
          .returning();

        if (booking) {
          notify({
            userId: booking.guestId,
            type: "payment.succeeded",
            title: "Payment received",
            message:
              "Your payment was successful. Your booking is under review by the host.",
            relatedEntityType: "booking",
            relatedEntityId: booking.id,
          });

          // Notify the yacht's host
          const [yacht] = await db
            .select()
            .from(yachtsTable)
            .where(eq(yachtsTable.id, booking.yachtId))
            .limit(1);

          if (yacht) {
            const [hostProfile] = await db
              .select()
              .from(hostProfilesTable)
              .where(eq(hostProfilesTable.id, yacht.hostId))
              .limit(1);

            if (hostProfile) {
              notify({
                userId: hostProfile.userId,
                type: "booking.new",
                title: "New booking to review",
                message: `New booking received for ${booking.bookingDate}. Please confirm or reject.`,
                relatedEntityType: "booking",
                relatedEntityId: booking.id,
              });
            }
          }

          await db
            .insert(auditLogsTable)
            .values({
              id: randomUUID(),
              action: "payment.succeeded",
              entityType: "booking",
              entityId: booking.id,
              newValue: { stripePaymentIntentId: pi.id },
            })
            .catch(() => {});
        }
        break;
      }

      // ── Payment failed ─────────────────────────────────────────────────────
      case "payment_intent.payment_failed": {
        const pi = event.data.object as { id: string };

        const [payment] = await db
          .select()
          .from(paymentsTable)
          .where(eq(paymentsTable.stripePaymentIntentId, pi.id))
          .limit(1);

        if (payment) {
          await db
            .update(paymentsTable)
            .set({ status: "failed" })
            .where(eq(paymentsTable.id, payment.id));

          const [booking] = await db
            .update(bookingsTable)
            .set({ status: "cancelled" })
            .where(eq(bookingsTable.id, payment.bookingId))
            .returning();

          if (booking) {
            notify({
              userId: booking.guestId,
              type: "payment.failed",
              title: "Payment failed",
              message: "Your payment could not be processed. Please try again.",
              relatedEntityType: "booking",
              relatedEntityId: booking.id,
            });
          }
        }
        break;
      }

      // ── Charge refunded ────────────────────────────────────────────────────
      case "charge.refunded": {
        const charge = event.data.object as {
          payment_intent?: string;
          refunds?: { data?: { id: string }[] };
        };
        const piId = charge.payment_intent;
        if (!piId) break;

        const stripeRefundId = charge.refunds?.data?.[0]?.id ?? null;

        const [payment] = await db
          .update(paymentsTable)
          .set({ status: "refunded" })
          .where(eq(paymentsTable.stripePaymentIntentId, piId))
          .returning();

        if (stripeRefundId) {
          await db
            .update(refundsTable)
            .set({ status: "succeeded" })
            .where(eq(refundsTable.stripeRefundId, stripeRefundId));
        }
        break;
      }

      default:
        logger.info({ eventType: event.type }, "Stripe webhook: unhandled event type");
    }
  } catch (err) {
    logger.error({ err, eventType: event.type }, "Error processing Stripe webhook event");
    // Still respond 200 so Stripe doesn't retry on our processing bugs
  }

  res.json({ received: true });
});

export default router;
