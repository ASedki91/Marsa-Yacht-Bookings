import { randomUUID } from "node:crypto";
import { availabilitySlotsTable, bookingsTable, db } from "@workspace/db";
import { and, eq, inArray, ne } from "drizzle-orm";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ACTIVE_BOOKING_STATUSES = [
  "pending_payment",
  "paid_under_review",
  "confirmed",
  "cancel_requested",
] as const;

interface ReopenAvailabilityInput {
  bookingId: string;
  slotId: string | null;
  tripStartsAt: Date;
}

/**
 * Reopens a cancelled booking's calendar time without reusing its historical
 * slot row. Each completed booking keeps its original slot reference, while a
 * new available row represents the bookable time.
 */
export async function reopenAvailabilityAfterCancellation(
  tx: DatabaseTransaction,
  input: ReopenAvailabilityInput,
): Promise<boolean> {
  if (!input.slotId || input.tripStartsAt.getTime() <= Date.now()) return false;

  const [activeReference] = await tx
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.slotId, input.slotId),
        ne(bookingsTable.id, input.bookingId),
        inArray(bookingsTable.status, [...ACTIVE_BOOKING_STATUSES]),
      ),
    )
    .limit(1);
  if (activeReference) return false;

  const [historicalSlot] = await tx
    .select()
    .from(availabilitySlotsTable)
    .where(eq(availabilitySlotsTable.id, input.slotId))
    .limit(1);
  if (!historicalSlot) return false;

  await tx
    .update(availabilitySlotsTable)
    .set({ holdExpiresAt: null })
    .where(eq(availabilitySlotsTable.id, historicalSlot.id));

  const [created] = await tx
    .insert(availabilitySlotsTable)
    .values({
      id: randomUUID(),
      yachtId: historicalSlot.yachtId,
      templateId: historicalSlot.templateId,
      date: historicalSlot.date,
      startTime: historicalSlot.startTime,
      isAvailable: true,
      priceOverrideEgp: historicalSlot.priceOverrideEgp,
    })
    .onConflictDoNothing()
    .returning({ id: availabilitySlotsTable.id });

  return Boolean(created);
}
