import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  decimal,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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

export const paymentsTable = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookingsTable.id, { onDelete: "restrict" }),
    provider: text("provider").notNull().default("stripe"),
    providerPaymentId: text("provider_payment_id"),
    providerMetadata: jsonb("provider_metadata").$type<Record<string, unknown>>(),
    isTest: boolean("is_test").notNull().default(false),
    succeededAt: timestamp("succeeded_at", { withTimezone: true }),
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
    amountEgp: decimal("amount_egp", { precision: 12, scale: 2 }).notNull(),
    amountUsd: decimal("amount_usd", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("EGP"),
    status: paymentStatusEnum("status").notNull().default("created"),
    stripeChargeId: text("stripe_charge_id"),
    receiptUrl: text("receipt_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_payments_booking").on(table.bookingId),
    uniqueIndex("uq_payments_provider_reference")
      .on(table.provider, table.providerPaymentId)
      .where(sql`${table.providerPaymentId} is not null`),
  ],
);

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
