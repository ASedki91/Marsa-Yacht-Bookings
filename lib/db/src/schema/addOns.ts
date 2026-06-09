import { pgTable, text, decimal, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingTemplatesTable } from "./bookingTemplates";
import { bookingsTable } from "./bookings";

export const addOnsTable = pgTable("add_ons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  priceEgp: decimal("price_egp", { precision: 12, scale: 2 }).notNull(),
  templateId: text("template_id")
    .references(() => bookingTemplatesTable.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookingAddOnsTable = pgTable("booking_add_ons", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id")
    .notNull()
    .references(() => bookingsTable.id, { onDelete: "cascade" }),
  addOnId: text("add_on_id")
    .notNull()
    .references(() => addOnsTable.id, { onDelete: "restrict" }),
  priceAtBookingEgp: decimal("price_at_booking_egp", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAddOnSchema = createInsertSchema(addOnsTable).omit({ createdAt: true });
export type InsertAddOn = z.infer<typeof insertAddOnSchema>;
export type AddOn = typeof addOnsTable.$inferSelect;

export const insertBookingAddOnSchema = createInsertSchema(bookingAddOnsTable).omit({ createdAt: true });
export type InsertBookingAddOn = z.infer<typeof insertBookingAddOnSchema>;
export type BookingAddOn = typeof bookingAddOnsTable.$inferSelect;
