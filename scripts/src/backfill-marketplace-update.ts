import { randomUUID } from "node:crypto";
import {
  db,
  locationsTable,
  paymentsTable,
  pool,
  refundsTable,
  yachtsTable,
} from "@workspace/db";
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";

async function backfillMarketplaceUpdate() {
  const result = await db.transaction(async (tx) => {
    const [existingDefault] = await tx
      .select({ id: locationsTable.id })
      .from(locationsTable)
      .where(eq(locationsTable.isDefault, true))
      .limit(1);

    const [gouna] = await tx
      .insert(locationsTable)
      .values({
        id: randomUUID(),
        name: "Gouna",
        city: "Gouna",
        country: "Egypt",
        timeZone: "Africa/Cairo",
        slug: "gouna-egypt",
        isActive: true,
        isDefault: !existingDefault,
        sortOrder: 0,
      })
      .onConflictDoUpdate({
        target: locationsTable.slug,
        set: {
          name: "Gouna",
          city: "Gouna",
          country: "Egypt",
          timeZone: "Africa/Cairo",
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning({ id: locationsTable.id });

    if (!gouna) {
      throw new Error("Gouna location upsert did not return a row");
    }

    const linkedYachts = await tx
      .update(yachtsTable)
      .set({ locationId: gouna.id })
      .where(
        and(
          isNull(yachtsTable.locationId),
          or(
            ilike(yachtsTable.city, "%gouna%"),
            ilike(yachtsTable.location, "%gouna%"),
            ilike(yachtsTable.city, "%el gouna%"),
            ilike(yachtsTable.location, "%el gouna%"),
          ),
        ),
      )
      .returning({ id: yachtsTable.id });

    const paymentRows = await tx
      .update(paymentsTable)
      .set({
        provider: "stripe",
        providerPaymentId: sql`coalesce(${paymentsTable.providerPaymentId}, ${paymentsTable.stripePaymentIntentId})`,
        isTest: false,
      })
      .where(eq(paymentsTable.provider, "stripe"))
      .returning({ id: paymentsTable.id });

    const refundRows = await tx
      .update(refundsTable)
      .set({
        provider: "stripe",
        providerRefundId: sql`coalesce(${refundsTable.providerRefundId}, ${refundsTable.stripeRefundId})`,
        isTest: false,
      })
      .where(eq(refundsTable.provider, "stripe"))
      .returning({ id: refundsTable.id });

    const defaultLocations = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(locationsTable)
      .where(eq(locationsTable.isDefault, true));

    if (defaultLocations[0]?.count !== 1) {
      throw new Error(
        `Expected exactly one default location, found ${defaultLocations[0]?.count ?? 0}`,
      );
    }

    return {
      yachtsLinkedToGouna: linkedYachts.length,
      stripePaymentsChecked: paymentRows.length,
      stripeRefundsChecked: refundRows.length,
      defaultLocationCount: defaultLocations[0].count,
    };
  });

  // This script intentionally reports only aggregate counts.
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

backfillMarketplaceUpdate()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown backfill failure";
    process.stderr.write(`Marketplace backfill failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
