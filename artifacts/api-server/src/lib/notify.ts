import { db, notificationsTable } from "@workspace/db";
import { randomUUID } from "crypto";
import { logger } from "./logger";

interface NotifyParams {
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

/**
 * Fire-and-forget notification create. Never throws.
 */
export function notify(params: NotifyParams): void {
  db.insert(notificationsTable)
    .values({
      id: randomUUID(),
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      relatedEntityType: params.relatedEntityType ?? null,
      relatedEntityId: params.relatedEntityId ?? null,
    })
    .catch((err) => logger.error({ err, params }, "Failed to insert notification"));
}
