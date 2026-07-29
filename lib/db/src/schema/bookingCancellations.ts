import {
  check,
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";
import {
  cancellationPoliciesTable,
  cancellationPolicyRulesTable,
} from "./cancellationPolicies";
import { refundsTable } from "./refunds";
import { usersTable } from "./users";

export const bookingCancellationsTable = pgTable(
  "booking_cancellations",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookingsTable.id, { onDelete: "restrict" }),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    reason: text("reason"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    bookingStatusBeforeRequest: text("booking_status_before_request").notNull(),
    tripStartsAt: timestamp("trip_starts_at", { withTimezone: true }).notNull(),
    remainingMinutes: integer("remaining_minutes").notNull(),
    policyId: text("policy_id").references(() => cancellationPoliciesTable.id, {
      onDelete: "restrict",
    }),
    policyVersion: integer("policy_version"),
    matchedRuleId: text("matched_rule_id").references(
      () => cancellationPolicyRulesTable.id,
      { onDelete: "restrict" },
    ),
    feePercentage: decimal("fee_percentage", { precision: 5, scale: 2 }),
    originalAmountEgp: decimal("original_amount_egp", {
      precision: 12,
      scale: 2,
    }).notNull(),
    feeAmountEgp: decimal("fee_amount_egp", { precision: 12, scale: 2 }),
    refundAmountEgp: decimal("refund_amount_egp", { precision: 12, scale: 2 }),
    status: text("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => usersTable.id, {
      onDelete: "restrict",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
    refundId: text("refund_id")
      .unique()
      .references(() => refundsTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "chk_booking_cancellation_status",
      sql`${table.status} in ('pending', 'processing', 'approved', 'rejected', 'refund_failed')`,
    ),
    check(
      "chk_booking_cancellation_percentage",
      sql`${table.feePercentage} is null or (${table.feePercentage} >= 0 and ${table.feePercentage} <= 100)`,
    ),
    check(
      "chk_booking_cancellation_amounts",
      sql`${table.originalAmountEgp} >= 0 and (${table.feeAmountEgp} is null or ${table.feeAmountEgp} >= 0) and (${table.refundAmountEgp} is null or ${table.refundAmountEgp} >= 0)`,
    ),
    check(
      "chk_booking_cancellation_reconciles",
      sql`${table.feeAmountEgp} is null or ${table.refundAmountEgp} is null or ${table.feeAmountEgp} + ${table.refundAmountEgp} = ${table.originalAmountEgp}`,
    ),
    index("idx_booking_cancellations_booking_time").on(
      table.bookingId,
      table.requestedAt.desc(),
    ),
    index("idx_booking_cancellations_status_time").on(table.status, table.requestedAt),
    uniqueIndex("uq_booking_cancellations_open")
      .on(table.bookingId)
      .where(sql`${table.status} in ('pending', 'processing')`),
  ],
);

export const insertBookingCancellationSchema = createInsertSchema(
  bookingCancellationsTable,
).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertBookingCancellation = z.infer<typeof insertBookingCancellationSchema>;
export type BookingCancellation = typeof bookingCancellationsTable.$inferSelect;
