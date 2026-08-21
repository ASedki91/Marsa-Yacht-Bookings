import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  wishlistItemsTable,
  yachtPhotosTable,
  yachtsTable,
  yachtTemplatePricingTable,
} from "@workspace/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares";

const router: IRouter = Router();

router.get(
  "/wishlist",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const rows = await db
      .select({ yacht: yachtsTable })
      .from(wishlistItemsTable)
      .innerJoin(
        yachtsTable,
        and(
          eq(wishlistItemsTable.yachtId, yachtsTable.id),
          eq(yachtsTable.status, "live"),
        ),
      )
      .where(eq(wishlistItemsTable.userId, user.id))
      .orderBy(desc(wishlistItemsTable.createdAt));

    const yachts = rows.map((row) => row.yacht);
    const yachtIds = yachts.map((yacht) => yacht.id);
    const [photos, prices] = yachtIds.length
      ? await Promise.all([
          db
            .select()
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
        ])
      : [[], []];

    const photosByYacht = new Map<string, typeof photos>();
    for (const photo of photos) {
      const yachtPhotos = photosByYacht.get(photo.yachtId) ?? [];
      yachtPhotos.push(photo);
      photosByYacht.set(photo.yachtId, yachtPhotos);
    }
    const minimumPriceByYacht = new Map<string, number>();
    for (const row of prices) {
      const price = Number(row.price);
      const current = minimumPriceByYacht.get(row.yachtId);
      if (
        Number.isFinite(price) &&
        (current === undefined || price < current)
      ) {
        minimumPriceByYacht.set(row.yachtId, price);
      }
    }

    res.json({
      yachts: yachts.map((yacht) => ({
        ...yacht,
        name: yacht.title,
        rating: yacht.avgRating != null ? Number(yacht.avgRating) : null,
        photos: photosByYacht.get(yacht.id) ?? [],
        basePriceEgp:
          minimumPriceByYacht.get(yacht.id) !== undefined
            ? minimumPriceByYacht.get(yacht.id)!.toFixed(2)
            : null,
      })),
    });
  },
);

router.get(
  "/wishlist/ids",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const rows = await db
      .select({ yachtId: wishlistItemsTable.yachtId })
      .from(wishlistItemsTable)
      .innerJoin(
        yachtsTable,
        and(
          eq(wishlistItemsTable.yachtId, yachtsTable.id),
          eq(yachtsTable.status, "live"),
        ),
      )
      .where(eq(wishlistItemsTable.userId, user.id));
    res.json({ yachtIds: rows.map((row) => row.yachtId) });
  },
);

router.post(
  "/wishlist/:yachtId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const yachtId = String(req.params.yachtId);
    const [yacht] = await db
      .select({ id: yachtsTable.id })
      .from(yachtsTable)
      .where(and(eq(yachtsTable.id, yachtId), eq(yachtsTable.status, "live")))
      .limit(1);
    if (!yacht) {
      res.status(404).json({ error: "Yacht not found" });
      return;
    }

    await db
      .insert(wishlistItemsTable)
      .values({ id: randomUUID(), userId: user.id, yachtId })
      .onConflictDoNothing({
        target: [wishlistItemsTable.userId, wishlistItemsTable.yachtId],
      });
    res.status(201).json({ yachtId, wishlisted: true });
  },
);

router.delete(
  "/wishlist/:yachtId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = (req as any).localUser;
    const yachtId = String(req.params.yachtId);
    await db
      .delete(wishlistItemsTable)
      .where(
        and(
          eq(wishlistItemsTable.userId, user.id),
          eq(wishlistItemsTable.yachtId, yachtId),
        ),
      );
    res.json({ yachtId, wishlisted: false });
  },
);

export default router;
