import { index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const adminEventsTable = pgTable(
  "admin_events",
  {
    id: text("id").primaryKey(),
    sectionKey: text("section_key").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_admin_events_section_time").on(table.sectionKey, table.occurredAt),
    index("idx_admin_events_entity").on(table.entityType, table.entityId),
  ],
);

export const adminSectionViewsTable = pgTable(
  "admin_section_views",
  {
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sectionKey: text("section_key").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "pk_admin_section_views",
      columns: [table.adminUserId, table.sectionKey],
    }),
  ],
);

export const insertAdminEventSchema = createInsertSchema(adminEventsTable).omit({
  occurredAt: true,
});
export type InsertAdminEvent = z.infer<typeof insertAdminEventSchema>;
export type AdminEvent = typeof adminEventsTable.$inferSelect;
export type AdminSectionView = typeof adminSectionViewsTable.$inferSelect;
