import { randomUUID } from "node:crypto";
import {
  addOnsTable,
  availabilitySlotsTable,
  bookingAddOnsTable,
  bookingCancellationTermsTable,
  bookingsTable,
  db,
  locationsTable,
  paymentsTable,
  yachtsTable,
  yachtTemplatePricingTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { getEgpUsdRate } from "../exchange";
import {
  addPiasters,
  egpToPiasters,
  percentageOfPiasters,
  piastersToEgp,
} from "../money";
import { getActiveCancellationPolicy } from "../cancellations/policy";
import { tripStartToUtc } from "../cancellations/time";
import {
  getConfiguredPaymentGateway,
  PaymentGatewayUnavailableError,
} from "../payments";
import { recordAdminEvent } from "../adminActivity";

const PLATFORM_FEE_PERCENTAGE = 20;

export interface CreateBookingInput {
  slotId?: string;
  yachtId?: string;
  templateId?: string;
  bookingDate?: string;
  startTime?: string;
  guestCount: number;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestNationality?: string;
  specialRequests?: string;
  addOnIds?: string[];
  acceptedCancellationPolicyId: string;
}

export class BookingCreationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "BookingCreationError";
  }
}

export async function createBookingForGuest(
  guestId: string,
  input: CreateBookingInput,
) {
  const [slot] = await db
    .select()
    .from(availabilitySlotsTable)
    .where(
      input.slotId
        ? and(
            eq(availabilitySlotsTable.id, input.slotId),
            eq(availabilitySlotsTable.isAvailable, true),
          )
        : and(
            eq(availabilitySlotsTable.yachtId, input.yachtId!),
            eq(availabilitySlotsTable.templateId, input.templateId!),
            eq(availabilitySlotsTable.date, input.bookingDate!),
            eq(availabilitySlotsTable.startTime, input.startTime!),
            eq(availabilitySlotsTable.isAvailable, true),
          ),
    )
    .limit(1);
  if (!slot) {
    throw new BookingCreationError(
      "Requested slot is no longer available",
      409,
    );
  }

  if (
    (input.yachtId && input.yachtId !== slot.yachtId) ||
    (input.templateId && input.templateId !== slot.templateId) ||
    (input.bookingDate && input.bookingDate !== slot.date) ||
    (input.startTime && input.startTime !== slot.startTime)
  ) {
    throw new BookingCreationError(
      "The selected slot details have changed",
      409,
    );
  }

  const [[yacht], [pricing], policy] = await Promise.all([
    db
      .select()
      .from(yachtsTable)
      .where(
        and(eq(yachtsTable.id, slot.yachtId), eq(yachtsTable.status, "live")),
      )
      .limit(1),
    db
      .select()
      .from(yachtTemplatePricingTable)
      .where(
        and(
          eq(yachtTemplatePricingTable.yachtId, slot.yachtId),
          eq(yachtTemplatePricingTable.templateId, slot.templateId),
          eq(yachtTemplatePricingTable.isActive, true),
        ),
      )
      .limit(1),
    getActiveCancellationPolicy(),
  ]);
  if (!yacht) {
    throw new BookingCreationError("Yacht not found or not available", 404);
  }
  if (input.guestCount > yacht.capacity) {
    throw new BookingCreationError(
      `Guest count exceeds yacht capacity of ${yacht.capacity}`,
      400,
    );
  }
  if (!pricing && !slot.priceOverrideEgp) {
    throw new BookingCreationError("Pricing is unavailable for this slot", 400);
  }
  if (!policy) {
    throw new BookingCreationError(
      "Booking is unavailable until a cancellation policy is active",
      503,
    );
  }
  if (input.acceptedCancellationPolicyId !== policy.id) {
    throw new BookingCreationError(
      "The cancellation policy changed. Review the latest terms and try again.",
      409,
    );
  }

  const requestedAddOnIds = [...new Set(input.addOnIds ?? [])];
  const addOns = requestedAddOnIds.length
    ? await db
        .select()
        .from(addOnsTable)
        .where(
          and(
            inArray(addOnsTable.id, requestedAddOnIds),
            eq(addOnsTable.isActive, true),
          ),
        )
    : [];
  if (
    addOns.length !== requestedAddOnIds.length ||
    addOns.some(
      (addOn) => addOn.templateId && addOn.templateId !== slot.templateId,
    )
  ) {
    throw new BookingCreationError(
      "One or more add-ons are unavailable for this booking",
      400,
    );
  }

  const basePiasters = egpToPiasters(slot.priceOverrideEgp ?? pricing!.price);
  const totalPiasters = addPiasters([
    piastersToEgp(basePiasters),
    ...addOns.map((addOn) => addOn.priceEgp),
  ]);
  const platformFeePiasters = percentageOfPiasters(
    totalPiasters,
    PLATFORM_FEE_PERCENTAGE,
  );
  const hostEarningsPiasters = totalPiasters - platformFeePiasters;
  const totalAmountEgp = piastersToEgp(totalPiasters);

  const gateway = getConfiguredPaymentGateway();
  if (gateway.name === "disabled") {
    throw new BookingCreationError("Checkout is currently unavailable", 503);
  }
  try {
    const publicConfig = await gateway.getPublicConfig();
    if (!publicConfig.checkoutEnabled) {
      throw new BookingCreationError("Checkout is currently unavailable", 503);
    }
  } catch (error) {
    if (error instanceof BookingCreationError) throw error;
    throw new BookingCreationError("Checkout is currently unavailable", 503);
  }

  let exchangeRate: number | null = null;
  let amountUsdCents: number | undefined;
  let amountUsd: string | null = null;
  if (gateway.name === "stripe") {
    const exchangeRateSnapshot = await getEgpUsdRate();
    exchangeRate = exchangeRateSnapshot.rate;
    amountUsdCents = Math.round(
      (totalPiasters / 100 / exchangeRateSnapshot.rate) * 100,
    );
    amountUsd = (amountUsdCents / 100).toFixed(2);
  }

  const [location] = yacht.locationId
    ? await db
        .select({ timeZone: locationsTable.timeZone })
        .from(locationsTable)
        .where(eq(locationsTable.id, yacht.locationId))
        .limit(1)
    : [];
  const timeZone =
    location?.timeZone ??
    process.env.DEFAULT_MARKET_TIME_ZONE ??
    "Africa/Cairo";
  let tripStartsAt: Date;
  try {
    tripStartsAt = tripStartToUtc(slot.date, slot.startTime, timeZone);
  } catch {
    throw new BookingCreationError("The selected trip time is invalid", 400);
  }
  if (tripStartsAt.getTime() <= Date.now()) {
    throw new BookingCreationError(
      "The selected trip time has already passed",
      409,
    );
  }

  const bookingId = randomUUID();
  const paymentId = randomUUID();
  const acceptedAt = new Date();
  const rulesSnapshot = policy.rules.map((rule) => ({
    id: rule.id,
    minimumMinutesBeforeTrip: rule.minimumMinutesBeforeTrip,
    feePercentage: rule.feePercentage,
  }));
  const holdExpiresAt =
    gateway.name === "stripe" ? new Date(Date.now() + 30 * 60_000) : null;

  let durableBooking: typeof bookingsTable.$inferSelect;
  try {
    durableBooking = await db.transaction(async (tx) => {
      const [stillLive] = await tx
        .select({ id: yachtsTable.id })
        .from(yachtsTable)
        .where(
          and(eq(yachtsTable.id, yacht.id), eq(yachtsTable.status, "live")),
        )
        .limit(1);
      if (!stillLive) throw new Error("YACHT_NO_LONGER_LIVE");

      const [claimedSlot] = await tx
        .update(availabilitySlotsTable)
        .set({ isAvailable: false, holdExpiresAt })
        .where(
          and(
            eq(availabilitySlotsTable.id, slot.id),
            eq(availabilitySlotsTable.yachtId, yacht.id),
            eq(availabilitySlotsTable.isAvailable, true),
          ),
        )
        .returning({ id: availabilitySlotsTable.id });
      if (!claimedSlot) throw new Error("SLOT_ALREADY_CLAIMED");

      const [createdBooking] = await tx
        .insert(bookingsTable)
        .values({
          id: bookingId,
          guestId,
          yachtId: yacht.id,
          templateId: slot.templateId,
          slotId: slot.id,
          bookingDate: slot.date,
          startTime: slot.startTime,
          guestCount: input.guestCount,
          guestName: input.guestName,
          guestPhone: input.guestPhone,
          guestEmail: input.guestEmail,
          guestNationality: input.guestNationality ?? null,
          specialRequests: input.specialRequests ?? null,
          baseAmountEgp: piastersToEgp(basePiasters),
          baseAmountUsd: amountUsd,
          exchangeRateUsed: exchangeRate?.toFixed(4) ?? null,
          platformFeeEgp: piastersToEgp(platformFeePiasters),
          hostEarningsEgp: piastersToEgp(hostEarningsPiasters),
          totalAmountEgp,
          status: "pending_payment",
        })
        .returning();

      await tx.insert(bookingCancellationTermsTable).values({
        id: randomUUID(),
        bookingId,
        policyId: policy.id,
        policyVersion: policy.version,
        policyName: policy.name,
        rulesSnapshot,
        tripStartsAt,
        timeZone,
        acceptedAt,
      });
      await tx.insert(paymentsTable).values({
        id: paymentId,
        bookingId,
        provider: gateway.name,
        amountEgp: totalAmountEgp,
        amountUsd,
        currency: "EGP",
        status: "created",
        isTest: gateway.name === "test",
      });
      if (addOns.length) {
        await tx.insert(bookingAddOnsTable).values(
          addOns.map((addOn) => ({
            id: randomUUID(),
            bookingId,
            addOnId: addOn.id,
            priceAtBookingEgp: addOn.priceEgp,
          })),
        );
      }
      return createdBooking;
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "SLOT_ALREADY_CLAIMED" ||
        error.message === "YACHT_NO_LONGER_LIVE")
    ) {
      throw new BookingCreationError(
        error.message === "SLOT_ALREADY_CLAIMED"
          ? "Requested slot is no longer available"
          : "Yacht is no longer available",
        409,
      );
    }
    throw error;
  }

  let checkout;
  try {
    checkout = await gateway.createCheckout({
      bookingId,
      amountEgp: totalAmountEgp,
      amountUsdCents,
      metadata: {
        yachtId: yacht.id,
        templateId: slot.templateId,
        guestId,
        egpAmount: totalAmountEgp,
      },
    });
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx
        .update(paymentsTable)
        .set({ status: "failed" })
        .where(eq(paymentsTable.id, paymentId));
      await tx
        .update(bookingsTable)
        .set({ status: "cancelled" })
        .where(eq(bookingsTable.id, bookingId));
      await tx
        .update(availabilitySlotsTable)
        .set({ isAvailable: true, holdExpiresAt: null })
        .where(eq(availabilitySlotsTable.id, slot.id));
    });
    throw new BookingCreationError(
      error instanceof PaymentGatewayUnavailableError
        ? error.message
        : "Payment service unavailable. Please try again.",
      error instanceof PaymentGatewayUnavailableError ? 503 : 502,
    );
  }

  const succeededAt = checkout.status === "succeeded" ? new Date() : null;
  const [finalBooking] = await db.transaction(async (tx) => {
    await tx
      .update(paymentsTable)
      .set({
        provider: checkout.provider,
        providerPaymentId: checkout.providerPaymentId,
        providerMetadata: checkout.providerMetadata ?? null,
        stripePaymentIntentId:
          checkout.provider === "stripe" ? checkout.providerPaymentId : null,
        amountUsd: checkout.amountUsd ?? amountUsd,
        status: checkout.status,
        isTest: checkout.isTest,
        succeededAt,
      })
      .where(eq(paymentsTable.id, paymentId));
    const [updatedBooking] = await tx
      .update(bookingsTable)
      .set({
        status:
          checkout.status === "succeeded"
            ? "paid_under_review"
            : "pending_payment",
      })
      .where(eq(bookingsTable.id, bookingId))
      .returning();
    if (checkout.status === "succeeded") {
      await tx
        .update(availabilitySlotsTable)
        .set({ holdExpiresAt: null })
        .where(eq(availabilitySlotsTable.id, slot.id));
    }
    return [updatedBooking];
  });

  void recordAdminEvent({
    sectionKey: "bookings",
    entityType: "booking",
    entityId: bookingId,
    eventType: "booking.created",
    metadata: { paymentProvider: checkout.provider },
  }).catch(() => {});

  return {
    booking: finalBooking ?? durableBooking,
    cancellationTerms: {
      policyName: policy.name,
      policyVersion: policy.version,
      tripStartsAt: tripStartsAt.toISOString(),
      timeZone,
      rules: rulesSnapshot,
    },
    payment: {
      gateway: checkout.provider,
      testMode: checkout.isTest,
      status: checkout.status,
      action: checkout.action,
      providerPaymentId: checkout.providerPaymentId,
    },
  };
}
