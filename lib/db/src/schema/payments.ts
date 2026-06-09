import { pgTable, text, decimal, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";

export const paymentStatusEnum = pgEnum("payment_status", [
  "created",
  "succeeded",
  "refund_pending",
  "refunded",
  "failed",
]);

export const paymentsTable = pgTable("payments", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id")
    .notNull()
    .references(() => bookingsTable.id, { onDelete: "restrict" }),
  stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
  amountEgp: decimal("amount_egp", { precision: 12, scale: 2 }).notNull(),
  amountUsd: decimal("amount_usd", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("EGP"),
  status: paymentStatusEnum("status").notNull().default("created"),
  stripeChargeId: text("stripe_charge_id"),
  receiptUrl: text("receipt_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
