import {
  check,
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
import { notificationsTable } from "./notifications";
import { userPushTokensTable } from "./userPushTokens";
import { usersTable } from "./users";

export const notificationCampaignsTable = pgTable(
  "notification_campaigns",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    audience: text("audience").notNull().default("all"),
    status: text("status").notNull().default("queued"),
    createdBy: text("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    totalRecipients: integer("total_recipients").notNull().default(0),
    inAppSentCount: integer("in_app_sent_count").notNull().default(0),
    pushSentCount: integer("push_sent_count").notNull().default(0),
    pushFailedCount: integer("push_failed_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "chk_notification_campaign_status",
      sql`${table.status} in ('queued', 'sending', 'completed', 'partial_failed', 'failed')`,
    ),
    check(
      "chk_notification_campaign_counts",
      sql`${table.totalRecipients} >= 0 and ${table.inAppSentCount} >= 0 and ${table.pushSentCount} >= 0 and ${table.pushFailedCount} >= 0`,
    ),
    index("idx_notification_campaign_status_time").on(table.status, table.createdAt),
  ],
);

export const notificationDeliveriesTable = pgTable(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => notificationCampaignsTable.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    channel: text("channel").notNull(),
    pushTokenId: text("push_token_id").references(() => userPushTokensTable.id, {
      onDelete: "set null",
    }),
    notificationId: text("notification_id").references(() => notificationsTable.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    providerReference: text("provider_reference"),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "chk_notification_delivery_channel",
      sql`${table.channel} in ('in_app', 'push', 'email')`,
    ),
    check(
      "chk_notification_delivery_status",
      sql`${table.status} in ('pending', 'sent', 'failed', 'skipped')`,
    ),
    check("chk_notification_delivery_attempts", sql`${table.attemptCount} >= 0`),
    uniqueIndex("uq_notification_delivery_in_app")
      .on(table.campaignId, table.userId)
      .where(sql`${table.channel} = 'in_app'`),
    uniqueIndex("uq_notification_delivery_push")
      .on(table.campaignId, table.pushTokenId)
      .where(sql`${table.channel} = 'push' and ${table.pushTokenId} is not null`),
    uniqueIndex("uq_notification_delivery_email")
      .on(table.campaignId, table.userId)
      .where(sql`${table.channel} = 'email'`),
    index("idx_notification_delivery_campaign").on(table.campaignId),
    index("idx_notification_delivery_queue").on(table.status, table.nextAttemptAt),
  ],
);

export const insertNotificationCampaignSchema = createInsertSchema(
  notificationCampaignsTable,
).omit({
  createdAt: true,
});
export const insertNotificationDeliverySchema = createInsertSchema(
  notificationDeliveriesTable,
).omit({
  createdAt: true,
});
export type InsertNotificationCampaign = z.infer<typeof insertNotificationCampaignSchema>;
export type NotificationCampaign = typeof notificationCampaignsTable.$inferSelect;
export type InsertNotificationDelivery = z.infer<typeof insertNotificationDeliverySchema>;
export type NotificationDelivery = typeof notificationDeliveriesTable.$inferSelect;
