import {
  check,
  decimal,
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
import { usersTable } from "./users";

export const cancellationPoliciesTable = pgTable(
  "cancellation_policies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    version: integer("version").notNull().unique(),
    status: text("status").notNull().default("draft"),
    createdBy: text("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("chk_cancellation_policy_version", sql`${table.version} > 0`),
    check(
      "chk_cancellation_policy_status",
      sql`${table.status} in ('draft', 'active', 'retired')`,
    ),
    uniqueIndex("uq_cancellation_policy_active")
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
  ],
);

export const cancellationPolicyRulesTable = pgTable(
  "cancellation_policy_rules",
  {
    id: text("id").primaryKey(),
    policyId: text("policy_id")
      .notNull()
      .references(() => cancellationPoliciesTable.id, { onDelete: "cascade" }),
    minimumMinutesBeforeTrip: integer("minimum_minutes_before_trip").notNull(),
    feePercentage: decimal("fee_percentage", { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "chk_cancellation_rule_minutes",
      sql`${table.minimumMinutesBeforeTrip} >= 0`,
    ),
    check(
      "chk_cancellation_rule_percentage",
      sql`${table.feePercentage} >= 0 and ${table.feePercentage} <= 100`,
    ),
    uniqueIndex("uq_cancellation_rule_threshold").on(
      table.policyId,
      table.minimumMinutesBeforeTrip,
    ),
    index("idx_cancellation_rule_threshold_desc").on(
      table.policyId,
      table.minimumMinutesBeforeTrip.desc(),
    ),
  ],
);

export const insertCancellationPolicySchema = createInsertSchema(
  cancellationPoliciesTable,
).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertCancellationPolicyRuleSchema = createInsertSchema(
  cancellationPolicyRulesTable,
).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertCancellationPolicy = z.infer<typeof insertCancellationPolicySchema>;
export type CancellationPolicy = typeof cancellationPoliciesTable.$inferSelect;
export type InsertCancellationPolicyRule = z.infer<
  typeof insertCancellationPolicyRuleSchema
>;
export type CancellationPolicyRule = typeof cancellationPolicyRulesTable.$inferSelect;
