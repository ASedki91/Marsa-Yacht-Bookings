import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { yachtsTable } from "./yachts";

export const yachtPhotosTable = pgTable("yacht_photos", {
  id: text("id").primaryKey(),
  yachtId: text("yacht_id")
    .notNull()
    .references(() => yachtsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertYachtPhotoSchema = createInsertSchema(yachtPhotosTable).omit({
  uploadedAt: true,
});
export type InsertYachtPhoto = z.infer<typeof insertYachtPhotoSchema>;
export type YachtPhoto = typeof yachtPhotosTable.$inferSelect;
