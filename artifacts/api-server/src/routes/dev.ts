/**
 * Dev-only routes — only mounted when NODE_ENV !== "production".
 * Provides shortcuts for testing the full host/guest experience locally.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import {
  db,
  usersTable,
  hostProfilesTable,
  yachtsTable,
  yachtPhotosTable,
  bookingsTable,
  bookingTemplatesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: IRouter = Router();

/**
 * POST /dev/become-host
 *
 * Upgrades the signed-in user to role=host, creates a verified host profile,
 * and seeds 2 demo yachts + 2 demo bookings linked to their account.
 * Idempotent — safe to call multiple times.
 */
router.post("/dev/become-host", async (req: Request, res: Response): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Sign in first" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, auth.userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found — call /api/auth/sync first" });
    return;
  }

  // Upgrade to host
  const [updatedUser] = await db
    .update(usersTable)
    .set({ role: "host" })
    .where(eq(usersTable.id, user.id))
    .returning();

  // Ensure host profile
  const [existingProfile] = await db
    .select()
    .from(hostProfilesTable)
    .where(eq(hostProfilesTable.userId, user.id))
    .limit(1);

  let hostProfileId: string;
  if (existingProfile) {
    hostProfileId = existingProfile.id;
  } else {
    const [hp] = await db
      .insert(hostProfilesTable)
      .values({
        id: randomUUID(),
        userId: user.id,
        bio: "Demo host — testing MARSA yacht booking marketplace.",
        verificationStatus: "verified",
      })
      .returning();
    hostProfileId = hp.id;
  }

  // Check existing yachts
  const existingYachts = await db
    .select()
    .from(yachtsTable)
    .where(eq(yachtsTable.hostId, hostProfileId));

  let yacht1Id: string;
  let yacht2Id: string;

  if (existingYachts.length >= 2) {
    yacht1Id = existingYachts[0].id;
    yacht2Id = existingYachts[1].id;
  } else {
    const [y1] = await db
      .insert(yachtsTable)
      .values({
        id: randomUUID(),
        hostId: hostProfileId,
        title: "Blue Horizon — Luxury Motor Yacht",
        description:
          "A stunning 52-foot motor yacht perfect for day trips to the coral reefs, snorkeling excursions, or sunset cruises around El Gouna's lagoons. Features a spacious sun deck, air-conditioned cabin, and a fully stocked bar.",
        location: "El Gouna Marina, Red Sea, Egypt",
        city: "El Gouna",
        latitude: "27.3875",
        longitude: "33.6780",
        capacity: 12,
        lengthFt: "52",
        yearBuilt: 2019,
        manufacturer: "Azimut",
        features: ["Air Conditioning", "Sun Deck", "Snorkeling Gear", "BBQ", "Bar", "WiFi"],
        status: "live",
        avgRating: "4.92",
        reviewCount: 47,
      })
      .returning();

    await db.insert(yachtPhotosTable).values([
      { id: randomUUID(), yachtId: y1.id, url: "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=800", isPrimary: true, sortOrder: 0 },
      { id: randomUUID(), yachtId: y1.id, url: "https://images.unsplash.com/photo-1540946485063-a40da27545f8?w=800", isPrimary: false, sortOrder: 1 },
    ]);

    const [y2] = await db
      .insert(yachtsTable)
      .values({
        id: randomUUID(),
        hostId: hostProfileId,
        title: "Desert Wind — Sailing Catamaran",
        description:
          "A magnificent 44-foot catamaran for adventure and comfort. Sail the crystal-clear Red Sea, ideal for overnight trips to Mahmya Island or full-day reef explorations.",
        location: "El Gouna South Marina",
        city: "El Gouna",
        latitude: "27.3800",
        longitude: "33.6750",
        capacity: 10,
        lengthFt: "44",
        yearBuilt: 2021,
        manufacturer: "Lagoon",
        features: ["Snorkeling Gear", "Paddleboard", "Kayak", "Outdoor Shower", "Sound System"],
        status: "live",
        avgRating: "4.85",
        reviewCount: 31,
      })
      .returning();

    await db.insert(yachtPhotosTable).values([
      { id: randomUUID(), yachtId: y2.id, url: "https://images.unsplash.com/photo-1504851149312-7a075b496cc7?w=800", isPrimary: true, sortOrder: 0 },
      { id: randomUUID(), yachtId: y2.id, url: "https://images.unsplash.com/photo-1569263979104-865ab7cd8d13?w=800", isPrimary: false, sortOrder: 1 },
    ]);

    yacht1Id = y1.id;
    yacht2Id = y2.id;
  }

  // Ensure at least one booking template
  const templates = await db.select().from(bookingTemplatesTable).limit(2);
  let templateId = templates[0]?.id;

  if (!templateId) {
    const [t] = await db
      .insert(bookingTemplatesTable)
      .values({ id: randomUUID(), name: "Full Day (8 hrs)", durationHours: 8, sortOrder: 1 })
      .returning();
    templateId = t.id;
  }

  const template2Id = templates[1]?.id ?? templateId;

  // Seed bookings (as guest on their own yachts for demo purposes)
  const existingBookings = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.guestId, user.id));

  if (existingBookings.length === 0) {
    await db.insert(bookingsTable).values([
      {
        id: randomUUID(),
        guestId: user.id,
        yachtId: yacht1Id,
        templateId,
        bookingDate: "2026-06-15",
        startTime: "09:00:00",
        guestCount: 6,
        guestName: updatedUser.fullName ?? user.email,
        guestPhone: "+20 100 555 0000",
        guestEmail: user.email,
        baseAmountEgp: "8500.00",
        platformFeeEgp: "1275.00",
        hostEarningsEgp: "7225.00",
        totalAmountEgp: "8500.00",
        status: "confirmed",
        specialRequests: "Demo booking — confirmed",
      },
      {
        id: randomUUID(),
        guestId: user.id,
        yachtId: yacht2Id,
        templateId: template2Id,
        bookingDate: "2026-07-04",
        startTime: "14:00:00",
        guestCount: 4,
        guestName: updatedUser.fullName ?? user.email,
        guestPhone: "+20 100 555 0000",
        guestEmail: user.email,
        baseAmountEgp: "4200.00",
        platformFeeEgp: "630.00",
        hostEarningsEgp: "3570.00",
        totalAmountEgp: "4200.00",
        status: "pending_payment",
        specialRequests: "Demo booking — pending",
      },
    ]);
  }

  res.json({
    ok: true,
    message: "You are now a host with demo data! Restart the app or pull-to-refresh to see changes.",
    userId: user.id,
    hostProfileId,
    yachts: [yacht1Id, yacht2Id],
  });
});

export default router;
