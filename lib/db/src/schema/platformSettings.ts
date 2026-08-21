import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Singleton marketplace settings. The fixed ID keeps future marketplace-wide
 * controls in one durable record without tying them to an individual admin.
 */
export const platformSettingsTable = pgTable("platform_settings", {
  id: text("id").primaryKey(),
  whatsappSupportNumber: text("whatsapp_support_number").notNull(),
  updatedBy: text("updated_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});