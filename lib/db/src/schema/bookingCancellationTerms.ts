import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";
import { cancellationPoliciesTable } from "./cancellationPolicies";

export interface CancellationRuleSnapshot {
  id: string;
  minimumMinutesBeforeTrip: number;
  feePercentage: string;
}

export const bookingCancellationTermsTable = pgTable(
  "booking_cancellation_terms",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookingsTable.id, { onDelete: "restrict" }),
    policyId: text("policy_id")
      .notNull()
      .references(() => cancellationPoliciesTable.id, { onDelete: "restrict" }),
    policyVersion: integer("policy_version").notNull(),
    policyName: text("policy_name").notNull(),
    rulesSnapshot: jsonb("rules_snapshot").$type<CancellationRuleSnapshot[]>().notNull(),
    tripStartsAt: timestamp("trip_starts_at", { withTimezone: true }).notNull(),
    timeZone: text("time_zone").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("uq_booking_cancellation_terms_booking").on(table.bookingId)],
);

export const insertBookingCancellationTermsSchema = createInsertSchema(
  bookingCancellationTermsTable,
).omit({
  createdAt: true,
});
export type InsertBookingCancellationTerms = z.infer<
  typeof insertBookingCancellationTermsSchema
>;
export type BookingCancellationTerms = typeof bookingCancellationTermsTable.$inferSelect;
