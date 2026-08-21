import {
  boolean,
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

export const locationsTable = pgTable(
  "locations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    country: text("country").notNull(),
    timeZone: text("time_zone").notNull(),
    slug: text("slug").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_locations_active_sort").on(table.isActive, table.sortOrder),
    uniqueIndex("uq_locations_one_default")
      .on(table.isDefault)
      .where(sql`${table.isDefault} = true`),
  ],
);

export const insertLocationSchema = createInsertSchema(locationsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locationsTable.$inferSelect;
