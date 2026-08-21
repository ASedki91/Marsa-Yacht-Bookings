import { Router, type IRouter, type Request, type Response } from "express";
import {
  availabilitySlotsTable,
  bookingsTable,
  db,
  locationsTable,
  yachtPhotosTable,
  yachtsTable,
  yachtTemplatePricingTable,
} from "@workspace/db";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

const router: IRouter = Router();
const RAIL_LIMIT = 10;

router.get("/discovery/home", async (_req: Request, res: Response): Promise<void> => {
  const locations = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.isActive, true))
    .orderBy(
      desc(locationsTable.isDefault),
      asc(locationsTable.sortOrder),
      asc(locationsTable.name),
    );

  if (locations.length === 0) {
    res.json({ defaultLocationId: null, rails: [] });
    return;
  }

  const liveYachts = await db
    .select()
    .from(yachtsTable)
    .where(
      and(
        eq(yachtsTable.status, "live"),
        inArray(
          yachtsTable.locationId,
          locations.map((location) => location.id),
        ),
      ),
    );

  const yachtIds = liveYachts.map((yacht) => yacht.id);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [photoRows, priceRows, bookingCountRows, slotPriceRows] = yachtIds.length
    ? await Promise.all([
        db
          .select({
            yachtId: yachtPhotosTable.yachtId,
            url: yachtPhotosTable.url,
          })
          .from(yachtPhotosTable)
          .where(inArray(yachtPhotosTable.yachtId, yachtIds))
          .orderBy(asc(yachtPhotosTable.sortOrder)),
        db
          .select({
            yachtId: yachtTemplatePricingTable.yachtId,
            price: yachtTemplatePricingTable.price,
          })
          .from(yachtTemplatePricingTable)
          .where(
            and(
              inArray(yachtTemplatePricingTable.yachtId, yachtIds),
              eq(yachtTemplatePricingTable.isActive, true),
            ),
          ),
        db
          .select({
            yachtId: bookingsTable.yachtId,
            count: sql<number>`count(*)::int`,
          })
          .from(bookingsTable)
          .where(
            and(
              inArray(bookingsTable.yachtId, yachtIds),
              gte(bookingsTable.createdAt, ninetyDaysAgo),
              inArray(bookingsTable.status, [
                "paid_under_review",
                "confirmed",
                "completed",
                "closed",
              ]),
            ),
          )
          .groupBy(bookingsTable.yachtId),
        db
          .select({
            yachtId: availabilitySlotsTable.yachtId,
            price: availabilitySlotsTable.priceOverrideEgp,
          })
          .from(availabilitySlotsTable)
          .where(
            and(
              inArray(availabilitySlotsTable.yachtId, yachtIds),
              eq(availabilitySlotsTable.isAvailable, true),
              gte(availabilitySlotsTable.date, new Date().toISOString().slice(0, 10)),
            ),
          ),
      ])
    : [[], [], [], []];

  const primaryPhoto = new Map<string, string>();
  for (const row of photoRows) {
    if (!primaryPhoto.has(row.yachtId)) primaryPhoto.set(row.yachtId, row.url);
  }

  const minimumPrice = new Map<string, number>();
  const recordPrice = (yachtId: string, rawPrice: string | null) => {
    if (rawPrice === null) return;
    const price = Number(rawPrice);
    const existing = minimumPrice.get(yachtId);
    if (Number.isFinite(price) && (existing === undefined || price < existing)) {
      minimumPrice.set(yachtId, price);
    }
  };
  for (const row of priceRows) recordPrice(row.yachtId, row.price);
  for (const row of slotPriceRows) recordPrice(row.yachtId, row.price);

  const bookingCounts = new Map(
    bookingCountRows.map((row) => [row.yachtId, row.count]),
  );
  const now = Date.now();
  const rails = locations
    .map((location) => {
      const listings = liveYachts
        .filter((yacht) => yacht.locationId === location.id)
        .sort((left, right) => {
          const leftFeatured =
            left.isFeatured &&
            (!left.featuredFrom || left.featuredFrom.getTime() <= now) &&
            (!left.featuredUntil || left.featuredUntil.getTime() >= now);
          const rightFeatured =
            right.isFeatured &&
            (!right.featuredFrom || right.featuredFrom.getTime() <= now) &&
            (!right.featuredUntil || right.featuredUntil.getTime() >= now);
          if (leftFeatured !== rightFeatured) return leftFeatured ? -1 : 1;
          if (leftFeatured && left.featuredSortOrder !== right.featuredSortOrder) {
            return left.featuredSortOrder - right.featuredSortOrder;
          }
          const bookingDifference =
            (bookingCounts.get(right.id) ?? 0) - (bookingCounts.get(left.id) ?? 0);
          if (bookingDifference) return bookingDifference;
          const ratingDifference = Number(right.avgRating) - Number(left.avgRating);
          if (ratingDifference) return ratingDifference;
          if (right.reviewCount !== left.reviewCount) {
            return right.reviewCount - left.reviewCount;
          }
          return right.createdAt.getTime() - left.createdAt.getTime();
        })
        .slice(0, RAIL_LIMIT)
        .map((yacht) => ({
          listingType: "rental_yacht",
          listingId: yacht.id,
          yachtId: yacht.id,
          title: yacht.title,
          location: location.name,
          primaryPhotoUrl: primaryPhoto.get(yacht.id) ?? null,
          capacity: yacht.capacity,
          rating: yacht.avgRating,
          reviewCount: yacht.reviewCount,
          fromPriceEgp:
            minimumPrice.get(yacht.id) !== undefined
              ? minimumPrice.get(yacht.id)!.toFixed(2)
              : null,
          isFeatured: yacht.isFeatured,
        }));
      return { location, listings };
    })
    .filter((rail) => rail.listings.length > 0);

  res.json({
    defaultLocationId: locations.find((location) => location.isDefault)?.id ?? null,
    rails,
  });
});

export default router;
