import {
  pgTable,
  text,
  integer,
  decimal,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const yachtStatusEnum = pgEnum("yacht_status", [
  "draft",
  "pending_review",
  "changes_requested",
  "approved",
  "live",
  "rejected",
  "suspended",
]);

export const yachtsTable = pgTable("yachts", {
  id: text("id").primaryKey(),
  hostId: text("host_id").notNull(),
  categoryId: text("category_id"),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location").notNull(),
  city: text("city").notNull().default("Gouna"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  capacity: integer("capacity").notNull(),
  lengthFt: decimal("length_ft", { precision: 6, scale: 2 }),
  yearBuilt: integer("year_built"),
  manufacturer: text("manufacturer"),
  features: jsonb("features").$type<string[]>().default([]),
  status: yachtStatusEnum("status").notNull().default("draft"),
  avgRating: decimal("avg_rating", { precision: 3, scale: 2 }).notNull().default("0"),
  reviewCount: integer("review_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertYachtSchema = createInsertSchema(yachtsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertYacht = z.infer<typeof insertYachtSchema>;
export type Yacht = typeof yachtsTable.$inferSelect;
