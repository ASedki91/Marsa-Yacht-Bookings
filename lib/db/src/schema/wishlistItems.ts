import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { yachtsTable } from "./yachts";

export const wishlistItemsTable = pgTable(
  "wishlist_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    yachtId: text("yacht_id")
      .notNull()
      .references(() => yachtsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_wishlist_user_yacht").on(table.userId, table.yachtId),
    index("idx_wishlist_user").on(table.userId),
    index("idx_wishlist_yacht").on(table.yachtId),
  ],
);

export const insertWishlistItemSchema = createInsertSchema(wishlistItemsTable).omit({
  createdAt: true,
});
export type InsertWishlistItem = z.infer<typeof insertWishlistItemSchema>;
export type WishlistItem = typeof wishlistItemsTable.$inferSelect;
