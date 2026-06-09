import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  db,
  reviewsTable,
  bookingsTable,
  yachtsTable,
  hostProfilesTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, validateBody } from "../middlewares/index";
import { notify } from "../lib/notify";

const router: IRouter = Router();

const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  type: z.enum(["guest_to_host", "host_to_guest"]),
});

/**
 * POST /bookings/:id/review
 * Submit a review for a completed booking.
 */
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

    // Validate reviewer matches the review type
    if (type === "guest_to_host" && booking.guestId !== user.id) {
      res.status(403).json({ error: "Only the guest can submit a guest_to_host review" });
      return;
    }

    if (type === "host_to_guest") {
      const [hostProfile] = await db
        .select()
        .from(hostProfilesTable)
        .where(eq(hostProfilesTable.userId, user.id))
        .limit(1);

      const [yacht] = await db
        .select()
        .from(yachtsTable)
        .where(eq(yachtsTable.id, booking.yachtId))
        .limit(1);

      if (!hostProfile || !yacht || yacht.hostId !== hostProfile.id) {
        res.status(403).json({ error: "Only the host can submit a host_to_guest review" });
        return;
      }
    }

    // Determine reviewee
    let revieweeId = booking.guestId; // default for host_to_guest
    if (type === "guest_to_host") {
      const [yacht] = await db
        .select()
        .from(yachtsTable)
        .where(eq(yachtsTable.id, booking.yachtId))
        .limit(1);
      const [hostProfile] = await db
        .select()
        .from(hostProfilesTable)
        .where(eq(hostProfilesTable.id, yacht?.hostId ?? ""))
        .limit(1);
      revieweeId = hostProfile?.userId ?? booking.guestId;
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

    res.status(201).json(review);
  },
);

export default router;
