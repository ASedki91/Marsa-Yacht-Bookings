import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bookingTemplatesTable = pgTable(
  "booking_templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    durationHours: integer("duration_hours").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_booking_templates_name_duration").on(
      table.name,
      table.durationHours,
    ),
  ],
);

export const insertBookingTemplateSchema = createInsertSchema(bookingTemplatesTable).omit({
  createdAt: true,
});
export type InsertBookingTemplate = z.infer<typeof insertBookingTemplateSchema>;
export type BookingTemplate = typeof bookingTemplatesTable.$inferSelect;
