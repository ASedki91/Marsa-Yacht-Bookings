import { pgTable, text, decimal, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { paymentsTable } from "./payments";
import { bookingsTable } from "./bookings";
import { usersTable } from "./users";

export const refundStatusEnum = pgEnum("refund_status", [
  "pending",
  "succeeded",
  "failed",
]);

export const refundsTable = pgTable("refunds", {
  id: text("id").primaryKey(),
  paymentId: text("payment_id")
    .notNull()
    .references(() => paymentsTable.id, { onDelete: "restrict" }),
  bookingId: text("booking_id")
    .notNull()
    .references(() => bookingsTable.id, { onDelete: "restrict" }),
  stripeRefundId: text("stripe_refund_id").unique(),
  amountEgp: decimal("amount_egp", { precision: 12, scale: 2 }).notNull(),
  reason: text("reason"),
  status: refundStatusEnum("status").notNull().default("pending"),
  initiatedBy: text("initiated_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRefundSchema = createInsertSchema(refundsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type Refund = typeof refundsTable.$inferSelect;
