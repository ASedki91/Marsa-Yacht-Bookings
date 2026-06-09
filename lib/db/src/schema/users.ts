import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["guest", "host", "admin"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(), // uuid as text
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  phone: text("phone"),
  fullName: text("full_name"),
  nationality: text("nationality"),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").notNull().default("guest"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
