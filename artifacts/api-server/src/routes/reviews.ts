import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  db,
  reviewsTable,
  bookingsTable,
  yachtsTable,
  hostProfilesTable,
} from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, validateBody } from "../middlewares/index";
import { notify } from "../lib/notify";
import { recordAdminEvent } from "../lib/adminActivity";

const router: IRouter = Router();

const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  type: z.enum(["guest_to_host", "host_to_guest"]),
});

// ── Helper: get revieweeId and validate reviewer role ────────────────────────
async function resolveReview(
  booking: { id: string; guestId: string; yachtId: string },
  userId: string,
  type: "guest_to_host" | "host_to_guest",
): Promise<{ revieweeId: string | null; error?: string }> {
  if (type === "guest_to_host") {
    if (booking.guestId !== userId) {
      return { revieweeId: null, error: "Only the guest can submit a guest_to_host review" };
    }
    const [yacht] = await db
      .select()
      .from(yachtsTable)
      .where(eq(yachtsTable.id, booking.yachtId))
      .limit(1);
    const [hostProfile] = yacht
      ? await db
          .select()
          .from(hostProfilesTable)
          .where(eq(hostProfilesTable.id, yacht.hostId))
          .limit(1)
      : [];
    return { revieweeId: hostProfile?.userId ?? null };
  }

  // host_to_guest
  const [hostProfile] = await db
    .select()
    .from(hostProfilesTable)
    .where(eq(hostProfilesTable.userId, userId))
    .limit(1);

  const [yacht] = await db
    .select()
    .from(yachtsTable)
    .where(eq(yachtsTable.id, booking.yachtId))
    .limit(1);

  if (!hostProfile || !yacht || yacht.hostId !== hostProfile.id) {
    return { revieweeId: null, error: "Only the host of this yacht can submit a host_to_guest review" };
  }

  return { revieweeId: booking.guestId };
}

// ── POST /reviews  (standalone — provide bookingId in body) ──────────────────
const standaloneReviewSchema = reviewInputSchema.extend({
  bookingId: z.string().min(1),
});

router.post(
  "/reviews",
  requireAuth,
  validateBody(standaloneReviewSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const { bookingId, rating, comment, type } = req.body as z.infer<typeof standaloneReviewSchema>;

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (booking.status !== "completed") {
      res.status(400).json({ error: "Reviews can only be submitted for completed bookings" });
      return;
    }

    const { revieweeId, error } = await resolveReview(booking, user.id, type);
    if (error || !revieweeId) {
      res.status(403).json({ error: error ?? "Cannot determine reviewee" });
      return;
    }

    const reviewId = randomUUID();
    const [review] = await db
      .insert(reviewsTable)
      .values({
        id: reviewId,
        bookingId,
        reviewerId: user.id,
        revieweeId,
        yachtId: booking.yachtId,
        rating,
        comment: comment ?? null,
        type,
        status: "pending",
      })
      .returning();

    notify({
      userId: revieweeId,
      type: "review.submitted",
      title: "New review received",
      message: "A new review has been submitted and is pending moderation.",
      relatedEntityType: "review",
      relatedEntityId: reviewId,
    });
    void recordAdminEvent({
      sectionKey: "reviews",
      entityType: "review",
      entityId: reviewId,
      eventType: "review.submitted",
    }).catch(() => {});

    res.status(201).json(review);
  },
);

// ── POST /bookings/:id/review  (convenience — bookingId from path) ────────────
router.post(
  "/bookings/:id/review",
  requireAuth,
  validateBody(reviewInputSchema),
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const bookingId = String(req.params.id);
    const { rating, comment, type } = req.body as z.infer<typeof reviewInputSchema>;

    const [booking] = await db
      .select()
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId))
      .limit(1);

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (booking.status !== "completed") {
      res.status(400).json({ error: "Reviews can only be submitted for completed bookings" });
      return;
    }

    const { revieweeId, error } = await resolveReview(booking, user.id, type);
    if (error || !revieweeId) {
      res.status(403).json({ error: error ?? "Cannot determine reviewee" });
      return;
    }

    const reviewId = randomUUID();
    const [review] = await db
      .insert(reviewsTable)
      .values({
        id: reviewId,
        bookingId,
        reviewerId: user.id,
        revieweeId,
        yachtId: booking.yachtId,
        rating,
        comment: comment ?? null,
        type,
        status: "pending",
      })
      .returning();

    notify({
      userId: revieweeId,
      type: "review.submitted",
      title: "New review received",
      message: "A new review has been submitted and is pending moderation.",
      relatedEntityType: "review",
      relatedEntityId: reviewId,
    });
    void recordAdminEvent({
      sectionKey: "reviews",
      entityType: "review",
      entityId: reviewId,
      eventType: "review.submitted",
    }).catch(() => {});

    res.status(201).json(review);
  },
);

// ── GET /reviews/me  (reviews involving the current user) ────────────────────
router.get("/reviews/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).localUser;

  const [asReviewer, asReviewee] = await Promise.all([
    db
      .select()
      .from(reviewsTable)
      .where(eq(reviewsTable.reviewerId, user.id))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(50),
    db
      .select()
      .from(reviewsTable)
      .where(eq(reviewsTable.revieweeId, user.id))
      .orderBy(desc(reviewsTable.createdAt))
      .limit(50),
  ]);

  res.json({ asReviewer, asReviewee });
});

// ── GET /yachts/:id/reviews  (approved guest_to_host reviews for a yacht) ────
router.get(
  "/yachts/:id/reviews",
  async (req: Request, res: Response): Promise<void> => {
    const yachtId = String(req.params.id);

    const reviews = await db
      .select()
      .from(reviewsTable)
      .where(
        and(
          eq(reviewsTable.yachtId, yachtId),
          eq(reviewsTable.type, "guest_to_host"),
          eq(reviewsTable.status, "approved"),
        ),
      )
      .orderBy(desc(reviewsTable.createdAt))
      .limit(50);

    res.json({ reviews, total: reviews.length });
  },
);

export default router;
