import {
  pgTable,
  text,
  date,
  time,
  boolean,
  decimal,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { yachtsTable } from "./yachts";
import { bookingTemplatesTable } from "./bookingTemplates";

export const availabilitySlotsTable = pgTable(
  "availability_slots",
  {
    id: text("id").primaryKey(),
    yachtId: text("yacht_id")
      .notNull()
      .references(() => yachtsTable.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => bookingTemplatesTable.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    startTime: time("start_time").notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    priceOverrideEgp: decimal("price_override_egp", {
      precision: 12,
      scale: 2,
    }),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Partial unique index: only ONE available slot per yacht/template/date/time.
    // Allows re-use of a time slot after a cancellation (is_available reverts to false).
    uniqueIndex("uq_slot_available")
      .on(t.yachtId, t.templateId, t.date, t.startTime)
      .where(sql`${t.isAvailable} = true`),
    index("idx_availability_hold_expiry")
      .on(t.holdExpiresAt)
      .where(sql`${t.holdExpiresAt} is not null`),
    check(
      "chk_availability_price_override",
      sql`${t.priceOverrideEgp} is null or ${t.priceOverrideEgp} > 0`,
    ),
  ],
);

export const insertAvailabilitySlotSchema = createInsertSchema(availabilitySlotsTable).omit({
  createdAt: true,
});
export type InsertAvailabilitySlot = z.infer<typeof insertAvailabilitySlotSchema>;
export type AvailabilitySlot = typeof availabilitySlotsTable.$inferSelect;
