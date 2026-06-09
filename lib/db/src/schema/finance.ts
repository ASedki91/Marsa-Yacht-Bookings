import { pgTable, text, decimal, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { hostProfilesTable } from "./hostProfiles";
import { bookingsTable } from "./bookings";
import { usersTable } from "./users";

export const withdrawalStatusEnum = pgEnum("withdrawal_status", [
  "not_eligible",
  "eligible",
  "withdrawal_requested",
  "under_review",
  "paid",
  "rejected",
]);

export const earningsTypeEnum = pgEnum("earnings_type", [
  "earning",
  "payout",
  "adjustment",
]);

export const earningsStatusEnum = pgEnum("earnings_status", [
  "pending",
  "available",
  "withdrawn",
  "adjustment",
]);

export const withdrawalRequestsTable = pgTable("withdrawal_requests", {
  id: text("id").primaryKey(),
  hostId: text("host_id")
    .notNull()
    .references(() => hostProfilesTable.id, { onDelete: "restrict" }),
  amountEgp: decimal("amount_egp", { precision: 12, scale: 2 }).notNull(),
  status: withdrawalStatusEnum("status").notNull().default("not_eligible"),
  eligibleAt: timestamp("eligible_at", { withTimezone: true }),
  requestedAt: timestamp("requested_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  payoutMethod: text("payout_method"),
  payoutReference: text("payout_reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const earningsLedgerTable = pgTable("earnings_ledger", {
  id: text("id").primaryKey(),
  hostId: text("host_id")
    .notNull()
    .references(() => hostProfilesTable.id, { onDelete: "restrict" }),
  bookingId: text("booking_id")
    .notNull()
    .references(() => bookingsTable.id, { onDelete: "restrict" }),
  amountEgp: decimal("amount_egp", { precision: 12, scale: 2 }).notNull(),
  type: earningsTypeEnum("type").notNull(),
  status: earningsStatusEnum("status").notNull().default("pending"),
  eligibleAt: timestamp("eligible_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWithdrawalRequestSchema = createInsertSchema(withdrawalRequestsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertWithdrawalRequest = z.infer<typeof insertWithdrawalRequestSchema>;
export type WithdrawalRequest = typeof withdrawalRequestsTable.$inferSelect;

export const insertEarningsLedgerSchema = createInsertSchema(earningsLedgerTable).omit({
  createdAt: true,
});
export type InsertEarningsLedger = z.infer<typeof insertEarningsLedgerSchema>;
export type EarningsLedger = typeof earningsLedgerTable.$inferSelect;
