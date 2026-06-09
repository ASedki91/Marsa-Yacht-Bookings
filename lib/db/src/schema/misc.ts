import { pgTable, text, integer, boolean, decimal, date, time, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const photographerRequestStatusEnum = pgEnum("photographer_request_status", [
  "pending",
  "contacted",
  "scheduled",
  "completed",
  "cancelled",
]);

export const photographerRequestsTable = pgTable("photographer_requests", {
  id: text("id").primaryKey(),
  hostId: text("host_id").notNull(),
  yachtId: text("yacht_id"),
  preferredDate: date("preferred_date", { mode: "string" }),
  preferredTime: time("preferred_time"),
  notes: text("notes"),
  status: photographerRequestStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const referralCodesTable = pgTable("referral_codes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  code: text("code").notNull().unique(),
  referredBy: text("referred_by"),
  usesCount: integer("uses_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exampleYachtPhotosTable = pgTable("example_yacht_photos", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  caption: text("caption"),
  category: text("category"), // 'exterior', 'interior', 'deck', 'sunset', 'group'
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exchangeRatesTable = pgTable("exchange_rates", {
  id: text("id").primaryKey(),
  currencyPair: text("currency_pair").notNull().unique(), // e.g. "USD_EGP"
  rate: decimal("rate", { precision: 12, scale: 6 }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPhotographerRequestSchema = createInsertSchema(photographerRequestsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPhotographerRequest = z.infer<typeof insertPhotographerRequestSchema>;
export type PhotographerRequest = typeof photographerRequestsTable.$inferSelect;

export const insertReferralCodeSchema = createInsertSchema(referralCodesTable).omit({ createdAt: true });
export type InsertReferralCode = z.infer<typeof insertReferralCodeSchema>;
export type ReferralCode = typeof referralCodesTable.$inferSelect;

export const insertExampleYachtPhotoSchema = createInsertSchema(exampleYachtPhotosTable).omit({ createdAt: true });
export type InsertExampleYachtPhoto = z.infer<typeof insertExampleYachtPhotoSchema>;
export type ExampleYachtPhoto = typeof exampleYachtPhotosTable.$inferSelect;

export const insertExchangeRateSchema = createInsertSchema(exchangeRatesTable).omit({ fetchedAt: true });
export type InsertExchangeRate = z.infer<typeof insertExchangeRateSchema>;
export type ExchangeRate = typeof exchangeRatesTable.$inferSelect;
