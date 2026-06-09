import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const verificationStatusEnum = pgEnum("verification_status", [
  "pending",
  "verified",
  "rejected",
]);

export const hostProfilesTable = pgTable("host_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  bio: text("bio"),
  verificationStatus: verificationStatusEnum("verification_status")
    .notNull()
    .default("pending"),
  stripeConnectId: text("stripe_connect_id"),
  bankInfoEncrypted: text("bank_info_encrypted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertHostProfileSchema = createInsertSchema(hostProfilesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertHostProfile = z.infer<typeof insertHostProfileSchema>;
export type HostProfile = typeof hostProfilesTable.$inferSelect;
