/**
 * Demo seed — inserts realistic test data for MARSA.
 *
 * Run:  pnpm --filter @workspace/api-server tsx src/seed.ts
 *
 * Safe to re-run: checks for existing data before inserting.
 * The "demo host" user has clerkId "seed_host_demo" — not usable for real login.
 * To test as a real signed-in user, use the /api/dev/become-host endpoint instead.
 */

import { randomUUID } from "crypto";
import {
  db,
  usersTable,
  hostProfilesTable,
  yachtsTable,
  yachtPhotosTable,
  yachtTemplatePricingTable,
  bookingsTable,
  bookingTemplatesTable,
  categoriesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const log = (msg: string) => process.stdout.write(`[seed] ${msg}\n`);

async function seed() {
  log("Starting seed…");

  // ── Booking templates ──────────────────────────────────────────────────────
  const existingTemplates = await db.select().from(bookingTemplatesTable);
  let templateHalf: string;
  let templateFull: string;
  let templateSunset: string;

  if (existingTemplates.length === 0) {
    log("Creating booking templates…");
    const [t1] = await db
      .insert(bookingTemplatesTable)
      .values({ id: randomUUID(), name: "Half Day (4 hrs)", durationHours: 4, sortOrder: 1 })
      .returning();
    const [t2] = await db
      .insert(bookingTemplatesTable)
      .values({ id: randomUUID(), name: "Full Day (8 hrs)", durationHours: 8, sortOrder: 2 })
      .returning();
    const [t3] = await db
      .insert(bookingTemplatesTable)
      .values({ id: randomUUID(), name: "Sunset Cruise (3 hrs)", durationHours: 3, sortOrder: 3 })
      .returning();
    templateHalf = t1.id;
    templateFull = t2.id;
    templateSunset = t3.id;
    log(`Created 3 templates`);
  } else {
    templateHalf = existingTemplates[0].id;
    templateFull = existingTemplates[1]?.id ?? existingTemplates[0].id;
    templateSunset = existingTemplates[2]?.id ?? existingTemplates[0].id;
    log(`Templates already exist (${existingTemplates.length}), skipping`);
  }

  // ── Categories ─────────────────────────────────────────────────────────────
  const existingCats = await db.select().from(categoriesTable);
  let catSailId: string | null = null;
  let catMotorId: string | null = null;

  if (existingCats.length === 0) {
    log("Creating categories…");
    const [c1] = await db
      .insert(categoriesTable)
      .values({ id: randomUUID(), name: "Sailboat", slug: "sailboat", sortOrder: 1 })
      .returning();
    const [c2] = await db
      .insert(categoriesTable)
      .values({ id: randomUUID(), name: "Motor Yacht", slug: "motor-yacht", sortOrder: 2 })
      .returning();
    const [c3] = await db
      .insert(categoriesTable)
      .values({ id: randomUUID(), name: "Catamaran", slug: "catamaran", sortOrder: 3 })
      .returning();
    const [c4] = await db
      .insert(categoriesTable)
      .values({ id: randomUUID(), name: "Speedboat", slug: "speedboat", sortOrder: 4 })
      .returning();
    catSailId = c1.id;
    catMotorId = c2.id;
    log(`Created 4 categories`);
  } else {
    catSailId = existingCats[0].id;
    catMotorId = existingCats[1]?.id ?? null;
    log(`Categories already exist (${existingCats.length}), skipping`);
  }

  // ── Demo host user ─────────────────────────────────────────────────────────
  const DEMO_CLERK_ID = "seed_host_demo";
  let hostUserId: string;

  const [existingHost] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, DEMO_CLERK_ID))
    .limit(1);

  if (existingHost) {
    hostUserId = existingHost.id;
    log(`Demo host user already exists (${hostUserId}), skipping`);
  } else {
    const [hostUser] = await db
      .insert(usersTable)
      .values({
        id: randomUUID(),
        clerkId: DEMO_CLERK_ID,
        email: "captain.ahmed@marsa.test",
        fullName: "Captain Ahmed Al-Rashid",
        role: "host",
      })
      .returning();
    hostUserId = hostUser.id;
    log(`Created demo host user: ${hostUserId}`);
  }

  // ── Demo guest user ────────────────────────────────────────────────────────
  const GUEST_CLERK_ID = "seed_guest_demo";
  let guestUserId: string;

  const [existingGuest] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, GUEST_CLERK_ID))
    .limit(1);

  if (existingGuest) {
    guestUserId = existingGuest.id;
    log(`Demo guest user already exists (${guestUserId}), skipping`);
  } else {
    const [guestUser] = await db
      .insert(usersTable)
      .values({
        id: randomUUID(),
        clerkId: GUEST_CLERK_ID,
        email: "sara.elgouna@marsa.test",
        fullName: "Sara El-Gouna",
        role: "guest",
      })
      .returning();
    guestUserId = guestUser.id;
    log(`Created demo guest user: ${guestUserId}`);
  }

  // ── Host profile ───────────────────────────────────────────────────────────
  const [existingProfile] = await db
    .select()
    .from(hostProfilesTable)
    .where(eq(hostProfilesTable.userId, hostUserId))
    .limit(1);

  let hostProfileId: string;

  if (existingProfile) {
    hostProfileId = existingProfile.id;
    log(`Host profile already exists (${hostProfileId}), skipping`);
  } else {
    const [hp] = await db
      .insert(hostProfilesTable)
      .values({
        id: randomUUID(),
        userId: hostUserId,
        bio: "Professional yacht captain with 15 years of experience in the Red Sea. I offer unforgettable sailing experiences around El Gouna and beyond.",
        verificationStatus: "verified",
      })
      .returning();
    hostProfileId = hp.id;
    log(`Created host profile: ${hostProfileId}`);
  }

  // ── Pricing backfill helper ──────────────────────────────────────────────
  // Inserts per-template pricing for each yacht. Idempotent via the
  // uq_yacht_template unique constraint, so it's safe to run on existing yachts.
  const ensurePricing = async (
    yachts: { id: string; capacity: number | null }[],
  ): Promise<void> => {
    // Price scales with capacity and trip duration so longer trips always cost
    // more, regardless of how the templates are ordered.
    const templates = await db.select().from(bookingTemplatesTable);
    const rows = [];
    for (const y of yachts) {
      const cap = y.capacity ?? 10;
      for (const t of templates) {
        const hours = t.durationHours ?? 1;
        const price = Math.round((cap * hours * 250) / 100) * 100;
        rows.push({ id: randomUUID(), yachtId: y.id, templateId: t.id, price: String(price) });
      }
    }
    if (rows.length > 0) {
      await db
        .insert(yachtTemplatePricingTable)
        .values(rows)
        .onConflictDoNothing({ target: [yachtTemplatePricingTable.yachtId, yachtTemplatePricingTable.templateId] });
    }
  };

  // ── Yachts ─────────────────────────────────────────────────────────────────
  const existingYachts = await db
    .select()
    .from(yachtsTable)
    .where(eq(yachtsTable.hostId, hostProfileId));

  if (existingYachts.length > 0) {
    log(`Yachts already exist (${existingYachts.length}), backfilling pricing…`);
    await ensurePricing(existingYachts);
    log("Pricing backfill complete ✓");
    log("Seed complete ✓");
    process.exit(0);
  }

  log("Creating yachts…");

  const yachtsData = [
    {
      id: randomUUID(),
      hostId: hostProfileId,
      categoryId: catMotorId,
      title: "Blue Horizon — Luxury Motor Yacht",
      description:
        "Experience the Red Sea in style aboard Blue Horizon, a stunning 52-foot motor yacht. Perfect for day trips to the coral reefs, snorkeling excursions, or sunset cruises around El Gouna's lagoons. Features a spacious sun deck, air-conditioned cabin, and fully stocked bar.",
      location: "El Gouna Marina, Red Sea, Egypt",
      city: "El Gouna",
      latitude: "27.3875",
      longitude: "33.6780",
      capacity: 12,
      lengthFt: "52",
      yearBuilt: 2019,
      manufacturer: "Azimut",
      features: ["Air Conditioning", "Sun Deck", "Snorkeling Gear", "BBQ", "Bar", "WiFi", "Bluetooth Sound System"],
      status: "live" as const,
      avgRating: "4.92",
      reviewCount: 47,
    },
    {
      id: randomUUID(),
      hostId: hostProfileId,
      categoryId: catSailId,
      title: "Desert Wind — Sailing Catamaran",
      description:
        "Desert Wind is a magnificent 44-foot catamaran built for adventure and comfort. Sail the crystal-clear waters of the Red Sea with the wind in your hair. Ideal for overnight trips to Mahmya Island or full-day reef explorations. Certified for up to 10 guests.",
      location: "Hurghada Marina, Red Sea, Egypt",
      city: "El Gouna",
      latitude: "27.2579",
      longitude: "33.8116",
      capacity: 10,
      lengthFt: "44",
      yearBuilt: 2021,
      manufacturer: "Lagoon",
      features: ["Snorkeling Gear", "Paddleboard", "Kayak", "Outdoor Shower", "Sound System", "Life Jackets"],
      status: "live" as const,
      avgRating: "4.85",
      reviewCount: 31,
    },
    {
      id: randomUUID(),
      hostId: hostProfileId,
      categoryId: catMotorId,
      title: "Pearl of the Nile — Day Charter",
      description:
        "A sleek and fast 38-foot speedboat perfect for island hopping and watersports. Take a thrilling ride to Giftun Island, enjoy snorkeling in pristine coral gardens, or simply relax on the water. Includes professional captain and crew.",
      location: "El Gouna South Marina",
      city: "El Gouna",
      latitude: "27.3800",
      longitude: "33.6750",
      capacity: 8,
      lengthFt: "38",
      yearBuilt: 2020,
      manufacturer: "Sea Ray",
      features: ["Captain Included", "Snorkeling Gear", "Towels", "Cooler", "Sound System", "First Aid Kit"],
      status: "live" as const,
      avgRating: "4.78",
      reviewCount: 23,
    },
  ];

  const createdYachts = [];
  for (const y of yachtsData) {
    const [yacht] = await db.insert(yachtsTable).values(y).returning();
    createdYachts.push(yacht);
    log(`Created yacht: "${yacht.title}" (${yacht.id})`);
  }

  // ── Yacht photos ───────────────────────────────────────────────────────────
  const photoSets = [
    [
      "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=800",
      "https://images.unsplash.com/photo-1540946485063-a40da27545f8?w=800",
      "https://images.unsplash.com/photo-1605281317010-fe5ffe798166?w=800",
    ],
    [
      "https://images.unsplash.com/photo-1504851149312-7a075b496cc7?w=800",
      "https://images.unsplash.com/photo-1569263979104-865ab7cd8d13?w=800",
      "https://images.unsplash.com/photo-1535262412227-85541e910204?w=800",
    ],
    [
      "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800",
      "https://images.unsplash.com/photo-1591823743484-64de81fc3e41?w=800",
      "https://images.unsplash.com/photo-1512455555710-c7d51cf4fe3e?w=800",
    ],
  ];

  for (let i = 0; i < createdYachts.length; i++) {
    const photos = photoSets[i] ?? photoSets[0];
    for (let j = 0; j < photos.length; j++) {
      await db.insert(yachtPhotosTable).values({
        id: randomUUID(),
        yachtId: createdYachts[i].id,
        url: photos[j],
        isPrimary: j === 0,
        sortOrder: j,
      });
    }
  }
  log("Created yacht photos");

  // ── Yacht pricing ──────────────────────────────────────────────────────────
  await ensurePricing(createdYachts);
  log("Created yacht pricing");

  // ── Bookings ───────────────────────────────────────────────────────────────
  const bookingsData = [
    {
      id: randomUUID(),
      guestId: guestUserId,
      yachtId: createdYachts[0].id,
      templateId: templateFull,
      bookingDate: "2026-06-15",
      startTime: "09:00:00",
      guestCount: 6,
      guestName: "Sara El-Gouna",
      guestPhone: "+20 100 555 0011",
      guestEmail: "sara.elgouna@marsa.test",
      guestNationality: "Egyptian",
      baseAmountEgp: "8500.00",
      platformFeeEgp: "1275.00",
      hostEarningsEgp: "7225.00",
      totalAmountEgp: "8500.00",
      status: "confirmed" as const,
      specialRequests: "Please have snorkeling gear for 6 people.",
    },
    {
      id: randomUUID(),
      guestId: guestUserId,
      yachtId: createdYachts[1].id,
      templateId: templateHalf,
      bookingDate: "2026-06-20",
      startTime: "14:00:00",
      guestCount: 4,
      guestName: "Sara El-Gouna",
      guestPhone: "+20 100 555 0011",
      guestEmail: "sara.elgouna@marsa.test",
      baseAmountEgp: "4200.00",
      platformFeeEgp: "630.00",
      hostEarningsEgp: "3570.00",
      totalAmountEgp: "4200.00",
      status: "pending_payment" as const,
    },
    {
      id: randomUUID(),
      guestId: guestUserId,
      yachtId: createdYachts[2].id,
      templateId: templateSunset,
      bookingDate: "2026-05-28",
      startTime: "17:30:00",
      guestCount: 3,
      guestName: "Sara El-Gouna",
      guestPhone: "+20 100 555 0011",
      guestEmail: "sara.elgouna@marsa.test",
      baseAmountEgp: "2800.00",
      platformFeeEgp: "420.00",
      hostEarningsEgp: "2380.00",
      totalAmountEgp: "2800.00",
      status: "completed" as const,
    },
  ];

  for (const b of bookingsData) {
    await db.insert(bookingsTable).values(b);
  }
  log(`Created ${bookingsData.length} bookings`);

  log("Seed complete ✓");
  process.exit(0);
}

seed().catch((err) => {
  console.error("[seed] Error:", err);
  process.exit(1);
});
