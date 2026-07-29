import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  auditLogsTable,
  bookingCancellationsTable,
  bookingsTable,
  db,
  paymentsTable,
  refundsTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  requireAuth,
  requireRole,
  validateBody,
  validateQuery,
} from "../middlewares";
import {
  egpToPiasters,
  percentageOfPiasters,
  piastersToEgp,
} from "../lib/money";
import { reopenAvailabilityAfterCancellation } from "../lib/bookings/reopenAvailability";
import { getPaymentGatewayForStoredProvider } from "../lib/payments";
import { notify } from "../lib/notify";

const router: IRouter = Router();
const listQuerySchema = z.object({
  status: z
    .enum(["pending", "processing", "approved", "rejected", "refund_failed"])
    .optional(),
});
const processSchema = z
  .object({
    decision: z.enum(["approve", "reject"]).optional(),
    action: z.enum(["approve", "reject"]).optional(),
    notes: z.string().trim().max(2000).optional(),
    manualFeePercentage: z.number().min(0).max(100).optional(),
  })
  .refine((value) => Boolean(value.decision || value.action), {
    message: "A cancellation decision is required",
    path: ["decision"],
  })
  .transform((value) => ({
    ...value,
    decision: value.decision ?? value.action!,
  }));

router.use("/admin/cancellations", requireAuth, requireRole("admin"));

function responseFor(
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
  "/admin/cancellations",
  validateQuery(listQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    const { status } = req.query as z.infer<typeof listQuerySchema>;
    const cancellations = await db
      .select()
      .from(bookingCancellationsTable)
      .where(status ? eq(bookingCancellationsTable.status, status) : undefined)
      .orderBy(desc(bookingCancellationsTable.requestedAt));
    res.json({ cancellations: cancellations.map(responseFor) });
  },
);

async function findCancellationForRequest(
  cancellationId: string | undefined,
  bookingId: string | undefined,
) {
  if (cancellationId) {
    const [cancellation] = await db
      .select()
      .from(bookingCancellationsTable)
      .where(eq(bookingCancellationsTable.id, cancellationId))
      .limit(1);
    return cancellation;
  }
  if (!bookingId) return undefined;
  const [cancellation] = await db
    .select()
    .from(bookingCancellationsTable)
    .where(
      and(
        eq(bookingCancellationsTable.bookingId, bookingId),
        inArray(bookingCancellationsTable.status, [
          "pending",
          "processing",
          "refund_failed",
        ]),
      ),
    )
    .orderBy(desc(bookingCancellationsTable.requestedAt))
    .limit(1);
  return cancellation;
}

async function processCancellation(req: Request, res: Response): Promise<void> {
  const user = (req as any).localUser;
  const input = req.body as z.infer<typeof processSchema>;
  const cancellation = await findCancellationForRequest(
    req.params.id ? String(req.params.id) : undefined,
    req.params.bookingId ? String(req.params.bookingId) : undefined,
  );
  if (!cancellation) {
    res.status(404).json({ error: "Cancellation request not found" });
    return;
  }
  if (
    cancellation.status === "approved" ||
    cancellation.status === "rejected"
  ) {
    res.json(responseFor(cancellation));
    return;
  }
  if (cancellation.status === "processing") {
    res
      .status(409)
      .json({ error: "Cancellation refund is already processing" });
    return;
  }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, cancellation.bookingId))
    .limit(1);
  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  if (input.decision === "reject") {
    const previousStatus =
      cancellation.bookingStatusBeforeRequest as typeof bookingsTable.$inferSelect.status;
    const [rejected] = await db.transaction(async (tx) => {
      const [updatedCancellation] = await tx
        .update(bookingCancellationsTable)
        .set({
          status: "rejected",
          reviewedBy: user.id,
          reviewedAt: new Date(),
          reviewNotes: input.notes ?? null,
        })
        .where(
          and(
            eq(bookingCancellationsTable.id, cancellation.id),
            inArray(bookingCancellationsTable.status, [
              "pending",
              "refund_failed",
            ]),
          ),
        )
        .returning();
      if (!updatedCancellation) throw new Error("CANCELLATION_STATUS_CHANGED");
      await tx
        .update(bookingsTable)
        .set({ status: previousStatus })
        .where(
          and(
            eq(bookingsTable.id, booking.id),
            eq(bookingsTable.status, "cancel_requested"),
          ),
        );
      await tx.insert(auditLogsTable).values({
        id: randomUUID(),
        userId: user.id,
        action: "booking_cancellation.rejected",
        entityType: "booking_cancellation",
        entityId: cancellation.id,
        newValue: { notes: input.notes ?? null },
        ipAddress: req.ip,
      });
      return [updatedCancellation];
    });
    notify({
      userId: booking.guestId,
      type: "booking.cancellation_rejected",
      title: "Cancellation request reviewed",
      message: input.notes || "Your cancellation request was not approved.",
      relatedEntityType: "booking",
      relatedEntityId: booking.id,
    });
    res.json(responseFor(rejected));
    return;
  }

  let feeAmountEgp = cancellation.feeAmountEgp;
  let refundAmountEgp = cancellation.refundAmountEgp;
  let feePercentage = cancellation.feePercentage;
  const manualReviewRequired =
    cancellation.policyId === null ||
    feeAmountEgp === null ||
    refundAmountEgp === null;
  if (manualReviewRequired) {
    if (input.manualFeePercentage === undefined || !input.notes) {
      res.status(400).json({
        error:
          "Legacy cancellations require a manual fee percentage and review notes",
      });
      return;
    }
    const originalPiasters = egpToPiasters(cancellation.originalAmountEgp);
    const feePiasters = percentageOfPiasters(
      originalPiasters,
      input.manualFeePercentage,
    );
    feePercentage = input.manualFeePercentage.toFixed(2);
    feeAmountEgp = piastersToEgp(feePiasters);
    refundAmountEgp = piastersToEgp(originalPiasters - feePiasters);
  }

  const [claimed] = await db
    .update(bookingCancellationsTable)
    .set({
      status: "processing",
      reviewedBy: user.id,
      reviewedAt: null,
      reviewNotes: input.notes ?? null,
      feePercentage,
      feeAmountEgp,
      refundAmountEgp,
    })
    .where(
      and(
        eq(bookingCancellationsTable.id, cancellation.id),
        inArray(bookingCancellationsTable.status, ["pending", "refund_failed"]),
      ),
    )
    .returning();
  if (!claimed) {
    res
      .status(409)
      .json({ error: "Cancellation status changed; refresh and try again" });
    return;
  }

  const refundPiasters = egpToPiasters(refundAmountEgp!);
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.bookingId, booking.id))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(1);

  const finishWithoutProviderRefund =
    refundPiasters === 0 ||
    (booking.status === "cancel_requested" &&
      cancellation.bookingStatusBeforeRequest === "pending_payment" &&
      payment?.status !== "succeeded");

  if (finishWithoutProviderRefund) {
    const { approved, slotReopened } = await db.transaction(async (tx) => {
      const [updatedCancellation] = await tx
        .update(bookingCancellationsTable)
        .set({
          status: "approved",
          reviewedAt: new Date(),
        })
        .where(
          and(
            eq(bookingCancellationsTable.id, cancellation.id),
            eq(bookingCancellationsTable.status, "processing"),
          ),
        )
        .returning();
      await tx
        .update(bookingsTable)
        .set({ status: "cancelled" })
        .where(eq(bookingsTable.id, booking.id));
      const reopened = await reopenAvailabilityAfterCancellation(tx, {
        bookingId: booking.id,
        slotId: booking.slotId,
        tripStartsAt: cancellation.tripStartsAt,
      });
      await tx.insert(auditLogsTable).values({
        id: randomUUID(),
        userId: user.id,
        action: "booking_cancellation.approved",
        entityType: "booking_cancellation",
        entityId: cancellation.id,
        newValue: {
          feePercentage,
          feeAmountEgp,
          refundAmountEgp,
          refundStatus: "not_required",
          slotReopened: reopened,
        },
        ipAddress: req.ip,
      });
      return { approved: updatedCancellation, slotReopened: reopened };
    });
    notify({
      userId: booking.guestId,
      type: "booking.cancelled",
      title: "Cancellation approved",
      message: `Your booking was cancelled. Refund: ${refundAmountEgp} EGP.`,
      relatedEntityType: "booking",
      relatedEntityId: booking.id,
    });
    req.log.info(
      { cancellationId: cancellation.id, slotReopened },
      "Cancellation approved without a provider refund",
    );
    res.json(responseFor(approved));
    return;
  }

  const providerPaymentId =
    payment?.providerPaymentId ?? payment?.stripePaymentIntentId ?? null;
  if (!payment || payment.status !== "succeeded" || !providerPaymentId) {
    const [failed] = await db
      .update(bookingCancellationsTable)
      .set({
        status: "refund_failed",
        reviewNotes: [
          input.notes,
          "Succeeded payment reference is missing; finance review is required.",
        ]
          .filter(Boolean)
          .join("\n"),
      })
      .where(eq(bookingCancellationsTable.id, cancellation.id))
      .returning();
    res.status(409).json(responseFor(failed));
    return;
  }

  const originalPiasters = egpToPiasters(cancellation.originalAmountEgp);
  let amountProviderMinor: number | undefined;
  if (payment.provider === "stripe" && refundPiasters < originalPiasters) {
    const exchangeRate = Number(booking.exchangeRateUsed);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      const [failed] = await db
        .update(bookingCancellationsTable)
        .set({
          status: "refund_failed",
          reviewNotes: "The booking exchange-rate snapshot is invalid.",
        })
        .where(eq(bookingCancellationsTable.id, cancellation.id))
        .returning();
      res.status(409).json(responseFor(failed));
      return;
    }
    amountProviderMinor = Math.round(
      (refundPiasters / 100 / exchangeRate) * 100,
    );
  }

  let providerRefund;
  try {
    const gateway = getPaymentGatewayForStoredProvider(payment.provider);
    providerRefund = await gateway.refund({
      providerPaymentId,
      amountEgp: refundAmountEgp!,
      amountProviderMinor,
      idempotencyKey: cancellation.id,
      reason: cancellation.reason ?? "Guest cancellation",
    });
  } catch (error) {
    const [failed] = await db
      .update(bookingCancellationsTable)
      .set({
        status: "refund_failed",
        reviewNotes: [
          input.notes,
          error instanceof Error ? error.message : "Refund provider failed",
        ]
          .filter(Boolean)
          .join("\n"),
      })
      .where(eq(bookingCancellationsTable.id, cancellation.id))
      .returning();
    req.log.error(
      {
        err: error,
        cancellationId: cancellation.id,
        provider: payment.provider,
      },
      "Cancellation refund failed",
    );
    res.status(502).json(responseFor(failed));
    return;
  }

  const refundId = randomUUID();
  const finalStatus =
    providerRefund.status === "succeeded" ? "approved" : "processing";
  const [processed] = await db.transaction(async (tx) => {
    await tx.insert(refundsTable).values({
      id: refundId,
      paymentId: payment.id,
      bookingId: booking.id,
      provider: providerRefund.provider,
      providerRefundId: providerRefund.providerRefundId,
      stripeRefundId:
        providerRefund.provider === "stripe"
          ? providerRefund.providerRefundId
          : null,
      isTest: providerRefund.isTest,
      amountEgp: refundAmountEgp!,
      reason: cancellation.reason ?? "Guest cancellation",
      status: providerRefund.status,
      initiatedBy: user.id,
    });
    await tx
      .update(paymentsTable)
      .set({
        status:
          providerRefund.status === "succeeded" ? "refunded" : "refund_pending",
      })
      .where(eq(paymentsTable.id, payment.id));
    const [updatedCancellation] = await tx
      .update(bookingCancellationsTable)
      .set({
        status: finalStatus,
        refundId,
        reviewedAt: providerRefund.status === "succeeded" ? new Date() : null,
      })
      .where(
        and(
          eq(bookingCancellationsTable.id, cancellation.id),
          eq(bookingCancellationsTable.status, "processing"),
        ),
      )
      .returning();
    if (providerRefund.status === "succeeded") {
      await tx
        .update(bookingsTable)
        .set({ status: "cancelled" })
        .where(eq(bookingsTable.id, booking.id));
      await reopenAvailabilityAfterCancellation(tx, {
        bookingId: booking.id,
        slotId: booking.slotId,
        tripStartsAt: cancellation.tripStartsAt,
      });
    }
    await tx.insert(auditLogsTable).values({
      id: randomUUID(),
      userId: user.id,
      action: "booking_cancellation.approved",
      entityType: "booking_cancellation",
      entityId: cancellation.id,
      newValue: {
        feePercentage,
        feeAmountEgp,
        refundAmountEgp,
        refundStatus: providerRefund.status,
        provider: providerRefund.provider,
      },
      ipAddress: req.ip,
    });
    return [updatedCancellation];
  });

  if (providerRefund.status === "succeeded") {
    notify({
      userId: booking.guestId,
      type: "booking.cancelled",
      title: "Cancellation approved",
      message: `Your booking was cancelled. Refund: ${refundAmountEgp} EGP.`,
      relatedEntityType: "booking",
      relatedEntityId: booking.id,
    });
  }
  res.json(responseFor(processed));
}

router.post(
  "/admin/cancellations/:id/process",
  validateBody(processSchema),
  processCancellation,
);

// Backward-compatible alias for the previous admin endpoint. The new processor
// still uses the durable request and policy snapshot.
router.post(
  "/admin/bookings/:bookingId/process-cancellation",
  requireAuth,
  requireRole("admin"),
  validateBody(processSchema),
  processCancellation,
);

export default router;
