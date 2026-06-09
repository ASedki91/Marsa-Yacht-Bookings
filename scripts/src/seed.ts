import { db, bookingTemplatesTable, categoriesTable, addOnsTable, exampleYachtPhotosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

async function seed() {
  console.log("Seeding database...");

  // ── Booking Templates (5 canonical durations) ───────────────────────────
  const templates = [
    { name: "2-Hour Trip", durationHours: 2, description: "Perfect for a quick sunset cruise or a short spin around the bay.", sortOrder: 1 },
    { name: "4-Hour Trip", durationHours: 4, description: "Great for a half-day on the water with time to swim and snorkel.", sortOrder: 2 },
    { name: "6-Hour Trip", durationHours: 6, description: "Ideal for a full morning or afternoon adventure.", sortOrder: 3 },
    { name: "8-Hour Trip", durationHours: 8, description: "Spend most of the day at sea — great for fishing or island hopping.", sortOrder: 4 },
    { name: "Full Day", durationHours: 12, description: "The ultimate experience — sunrise to sunset on the Red Sea.", sortOrder: 5 },
  ];

  for (const t of templates) {
    const existing = await db.select().from(bookingTemplatesTable).where(eq(bookingTemplatesTable.durationHours, t.durationHours)).limit(1);
    if (existing.length === 0) {
      await db.insert(bookingTemplatesTable).values({ id: randomUUID(), ...t });
      console.log(`  ✓ Template: ${t.name}`);
    } else {
      console.log(`  – Template already exists: ${t.name}`);
    }
  }

  // ── Categories ────────────────────────────────────────────────────────────
  const categories = [
    { name: "Motor Yacht", slug: "motor-yacht", sortOrder: 1 },
    { name: "Sailing Yacht", slug: "sailing-yacht", sortOrder: 2 },
    { name: "Catamaran", slug: "catamaran", sortOrder: 3 },
    { name: "Speed Boat", slug: "speed-boat", sortOrder: 4 },
    { name: "Fishing Boat", slug: "fishing-boat", sortOrder: 5 },
    { name: "Luxury Mega Yacht", slug: "mega-yacht", sortOrder: 6 },
  ];

  for (const c of categories) {
    const existing = await db.select().from(categoriesTable).where(eq(categoriesTable.slug, c.slug)).limit(1);
    if (existing.length === 0) {
      await db.insert(categoriesTable).values({ id: randomUUID(), ...c });
      console.log(`  ✓ Category: ${c.name}`);
    } else {
      console.log(`  – Category already exists: ${c.name}`);
    }
  }

  // ── Add-Ons ───────────────────────────────────────────────────────────────
  const addOns = [
    { name: "Birthday Decoration Package", description: "Balloons, streamers, and a personalized banner to make the day special.", priceEgp: "800" },
    { name: "Fishing Equipment", description: "Full set of rods, tackle, bait, and life vests for up to 6 people.", priceEgp: "600" },
    { name: "Snorkeling Gear", description: "Masks, fins, and snorkels for up to 8 people.", priceEgp: "400" },
    { name: "Catering Basket", description: "Fresh sandwiches, snacks, soft drinks, and water for up to 10 people.", priceEgp: "1200" },
    { name: "Professional Photographer", description: "1 hour of in-water and on-deck photography. Digital delivery within 48h.", priceEgp: "2000" },
    { name: "Underwater Drone", description: "Capture the beauty beneath the surface. Includes operator.", priceEgp: "1500" },
    { name: "Diving Equipment", description: "Full scuba setup for 2 divers. Certification required.", priceEgp: "900" },
  ];

  for (const a of addOns) {
    const existing = await db.select().from(addOnsTable).where(eq(addOnsTable.name, a.name)).limit(1);
    if (existing.length === 0) {
      await db.insert(addOnsTable).values({ id: randomUUID(), ...a });
      console.log(`  ✓ Add-on: ${a.name}`);
    } else {
      console.log(`  – Add-on already exists: ${a.name}`);
    }
  }

  // ── Example Yacht Photos ────────────────────────────────────────────────
  const photos = [
    { url: "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=1200", caption: "Motor yacht on open sea", category: "exterior", sortOrder: 1 },
    { url: "https://images.unsplash.com/photo-1569263979104-865ab7cd8d13?w=1200", caption: "Sunset cruise", category: "sunset", sortOrder: 2 },
    { url: "https://images.unsplash.com/photo-1605281317010-fe5ffe798166?w=1200", caption: "Group on deck", category: "group", sortOrder: 3 },
    { url: "https://images.unsplash.com/photo-1530375552361-b8cd5a69f4b4?w=1200", caption: "Luxury interior lounge", category: "interior", sortOrder: 4 },
    { url: "https://images.unsplash.com/photo-1548574505-5e239809ee19?w=1200", caption: "Deck view", category: "deck", sortOrder: 5 },
    { url: "https://images.unsplash.com/photo-1551887196-72e32bfc7bf3?w=1200", caption: "Sailing catamaran", category: "exterior", sortOrder: 6 },
    { url: "https://images.unsplash.com/photo-1578894381163-e72c17f2d45f?w=1200", caption: "Snorkeling in the Red Sea", category: "group", sortOrder: 7 },
    { url: "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=1200", caption: "Evening on the water", category: "sunset", sortOrder: 8 },
  ];

  for (const p of photos) {
    const existing = await db.select().from(exampleYachtPhotosTable).where(eq(exampleYachtPhotosTable.url, p.url)).limit(1);
    if (existing.length === 0) {
      await db.insert(exampleYachtPhotosTable).values({ id: randomUUID(), ...p });
      console.log(`  ✓ Example photo: ${p.caption}`);
    } else {
      console.log(`  – Photo already exists: ${p.caption}`);
    }
  }

  console.log("\nSeed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
