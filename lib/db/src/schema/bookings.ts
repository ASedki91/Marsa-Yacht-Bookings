import {
  pgTable,
  text,
  integer,
  decimal,
  date,
  time,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending_payment",
  "paid_under_review",
  "confirmed",
  "rejected_refunded",
  "cancel_requested",
  "cancelled",
  "completed",
  "closed",
]);

export const bookingsTable = pgTable("bookings", {
  id: text("id").primaryKey(),
  guestId: text("guest_id").notNull(),
  yachtId: text("yacht_id").notNull(),
  templateId: text("template_id").notNull(),
  slotId: text("slot_id"),
  bookingDate: date("booking_date", { mode: "string" }).notNull(),
  startTime: time("start_time").notNull(),
  guestCount: integer("guest_count").notNull(),
  specialRequests: text("special_requests"),
  guestName: text("guest_name").notNull(),
  guestPhone: text("guest_phone").notNull(),
  guestEmail: text("guest_email").notNull(),
  guestNationality: text("guest_nationality"),
  baseAmountEgp: decimal("base_amount_egp", { precision: 12, scale: 2 }).notNull(),
  baseAmountUsd: decimal("base_amount_usd", { precision: 12, scale: 2 }),
  exchangeRateUsed: decimal("exchange_rate_used", { precision: 10, scale: 4 }),
  platformFeeEgp: decimal("platform_fee_egp", { precision: 12, scale: 2 }).notNull(),
  hostEarningsEgp: decimal("host_earnings_egp", { precision: 12, scale: 2 }).notNull(),
  totalAmountEgp: decimal("total_amount_egp", { precision: 12, scale: 2 }).notNull(),
  status: bookingStatusEnum("status").notNull().default("pending_payment"),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
