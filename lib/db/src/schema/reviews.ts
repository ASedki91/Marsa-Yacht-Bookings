import { pgTable, text, integer, timestamp, pgEnum, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reviewTypeEnum = pgEnum("review_type", [
  "guest_to_host",
  "host_to_guest",
]);

export const reviewModerationStatusEnum = pgEnum("review_moderation_status", [
  "pending",
  "approved",
  "rejected",
  "hidden",
]);

export const reviewsTable = pgTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id").notNull().unique(),
    reviewerId: text("reviewer_id").notNull(),
    revieweeId: text("reviewee_id").notNull(),
    yachtId: text("yacht_id"),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    type: reviewTypeEnum("type").notNull(),
    status: reviewModerationStatusEnum("status").notNull().default("pending"),
    moderatedBy: text("moderated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("rating_range", sql`${t.rating} >= 1 AND ${t.rating} <= 5`),
  ],
);

export const insertReviewSchema = createInsertSchema(reviewsTable).omit({
  createdAt: true,
});
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviewsTable.$inferSelect;
