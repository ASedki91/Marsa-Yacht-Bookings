import { pgTable, text, decimal, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const yachtTemplatePricingTable = pgTable(
  "yacht_template_pricing",
  {
    id: text("id").primaryKey(),
    yachtId: text("yacht_id").notNull(),
    templateId: text("template_id").notNull(),
    price: decimal("price", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("EGP"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("uq_yacht_template").on(t.yachtId, t.templateId)],
);

export const insertYachtTemplatePricingSchema = createInsertSchema(yachtTemplatePricingTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertYachtTemplatePricing = z.infer<typeof insertYachtTemplatePricingSchema>;
export type YachtTemplatePricing = typeof yachtTemplatePricingTable.$inferSelect;
