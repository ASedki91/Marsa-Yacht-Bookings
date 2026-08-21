import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const operatorOperationsTable = pgTable(
  "operator_operations",
  {
    id: text("id").primaryKey(),
    resourceKey: text("resource_key").notNull(),
    actionHash: text("action_hash").notNull(),
    action: jsonb("action").$type<Record<string, unknown>>().notNull(),
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("planned"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    invitationId: text("invitation_id"),
    outcome: jsonb("outcome").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_operator_operations_resource_key").on(table.resourceKey),
    index("idx_operator_operations_status_expiry").on(
      table.status,
      table.expiresAt,
    ),
    check(
      "chk_operator_operations_status",
      sql`${table.status} in ('planned', 'executing', 'completed', 'stale', 'expired')`,
    ),
  ],
);

export type OperatorOperation = typeof operatorOperationsTable.$inferSelect;