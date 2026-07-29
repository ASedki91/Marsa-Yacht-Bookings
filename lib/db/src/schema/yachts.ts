import {
  pgTable,
  text,
  integer,
  boolean,
  decimal,
  timestamp,
  jsonb,
  pgEnum,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { hostProfilesTable } from "./hostProfiles";
import { categoriesTable } from "./categories";
import { locationsTable } from "./locations";

export const yachtStatusEnum = pgEnum("yacht_status", [
  "draft",
  "pending_review",
  "changes_requested",
  "approved",
  "live",
  "rejected",
  "suspended",
]);

export const yachtsTable = pgTable(
  "yachts",
  {
    id: text("id").primaryKey(),
    hostId: text("host_id")
      .notNull()
      .references(() => hostProfilesTable.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => categoriesTable.id, {
      onDelete: "set null",
    }),
    locationId: text("location_id").references(() => locationsTable.id, {
      onDelete: "set null",
    }),
    customLocationName: text("custom_location_name"),
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
    isFeatured: boolean("is_featured").notNull().default(false),
    featuredSortOrder: integer("featured_sort_order").notNull().default(0),
    featuredFrom: timestamp("featured_from", { withTimezone: true }),
    featuredUntil: timestamp("featured_until", { withTimezone: true }),
    avgRating: decimal("avg_rating", { precision: 3, scale: 2 })
      .notNull()
      .default("0"),
    reviewCount: integer("review_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_yachts_status_location").on(table.status, table.locationId),
    index("idx_yachts_featured").on(
      table.isFeatured,
      table.featuredSortOrder,
      table.featuredFrom,
      table.featuredUntil,
    ),
    check(
      "chk_yachts_featured_window",
      sql`${table.featuredFrom} is null or ${table.featuredUntil} is null or ${table.featuredFrom} <= ${table.featuredUntil}`,
    ),
  ],
);

export const insertYachtSchema = createInsertSchema(yachtsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertYacht = z.infer<typeof insertYachtSchema>;
export type Yacht = typeof yachtsTable.$inferSelect;
