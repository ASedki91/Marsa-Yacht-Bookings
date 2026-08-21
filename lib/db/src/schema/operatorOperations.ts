import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const operatorOperationsTable = pgTable(
  "operator_operations",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    action: text("action").notNull(),
    inputHash: text("input_hash").notNull(),
    status: text("status").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("uq_operator_operations_request").on(table.requestId)],
);