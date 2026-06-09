import {
  pgTable,
  text,
  date,
  time,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const availabilitySlotsTable = pgTable(
  "availability_slots",
  {
    id: text("id").primaryKey(),
    yachtId: text("yacht_id").notNull(),
    templateId: text("template_id").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    startTime: time("start_time").notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_slot").on(t.yachtId, t.templateId, t.date, t.startTime)],
);

export const insertAvailabilitySlotSchema = createInsertSchema(availabilitySlotsTable).omit({
  createdAt: true,
});
export type InsertAvailabilitySlot = z.infer<typeof insertAvailabilitySlotSchema>;
export type AvailabilitySlot = typeof availabilitySlotsTable.$inferSelect;
