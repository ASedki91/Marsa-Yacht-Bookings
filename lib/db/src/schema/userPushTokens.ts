import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userPushTokensTable = pgTable(
  "user_push_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expoPushToken: text("expo_push_token").notNull().unique(),
    deviceId: text("device_id"),
    platform: text("platform").notNull(),
    appVersion: text("app_version"),
    isActive: boolean("is_active").notNull().default(true),
    lastRegisteredAt: timestamp("last_registered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("chk_push_token_platform", sql`${table.platform} in ('ios', 'android')`),
    uniqueIndex("uq_push_token_user_device")
      .on(table.userId, table.deviceId)
      .where(sql`${table.deviceId} is not null`),
    index("idx_push_tokens_user_active").on(table.userId, table.isActive),
  ],
);

export const insertUserPushTokenSchema = createInsertSchema(userPushTokensTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertUserPushToken = z.infer<typeof insertUserPushTokenSchema>;
export type UserPushToken = typeof userPushTokensTable.$inferSelect;
