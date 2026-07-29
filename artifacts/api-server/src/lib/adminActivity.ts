import { randomUUID } from "node:crypto";
import { adminEventsTable, db } from "@workspace/db";

export const ADMIN_SECTION_KEYS = [
  "users",
  "hosts",
  "documents",
  "yachts",
  "bookings",
  "cancellations",
  "withdrawals",
  "reviews",
  "photographer_requests",
] as const;

export type AdminSectionKey = (typeof ADMIN_SECTION_KEYS)[number];

export async function recordAdminEvent(input: {
  sectionKey: AdminSectionKey;
  entityType: string;
  entityId: string;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(adminEventsTable).values({
    id: randomUUID(),
    ...input,
  });
}
