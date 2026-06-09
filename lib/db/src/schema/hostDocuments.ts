import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentTypeEnum = pgEnum("document_type", [
  "national_id",
  "yacht_ownership",
  "yacht_license",
  "insurance",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "approved",
  "rejected",
]);

export const hostDocumentsTable = pgTable("host_documents", {
  id: text("id").primaryKey(),
  hostId: text("host_id").notNull(),
  documentType: documentTypeEnum("document_type").notNull(),
  fileUrl: text("file_url").notNull(),
  status: documentStatusEnum("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHostDocumentSchema = createInsertSchema(hostDocumentsTable).omit({
  createdAt: true,
});
export type InsertHostDocument = z.infer<typeof insertHostDocumentSchema>;
export type HostDocument = typeof hostDocumentsTable.$inferSelect;
