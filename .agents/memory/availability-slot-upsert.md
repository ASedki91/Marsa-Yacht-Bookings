---
name: Availability slot upsert
description: Partial unique index on availability_slots cannot be used with Drizzle onConflictDoUpdate; must use manual find+update/insert.
---

## The constraint

`availability_slots` has a partial unique index:
```
UNIQUE (yachtId, templateId, date, startTime) WHERE isAvailable = true
```

## Why onConflictDoUpdate fails

Drizzle's `onConflictDoUpdate({ target: [...columns] })` generates `ON CONFLICT (col1, col2, ...) DO UPDATE`. PostgreSQL requires the conflict target to match a full unique constraint or index — partial indexes (with a WHERE clause) cannot be referenced by column list alone. They can only be referenced by constraint name, and only if declared as a UNIQUE CONSTRAINT (not a `uniqueIndex`).

## Correct approach

Manual upsert per slot — find the existing row, update if found, insert if not:

```ts
const [existing] = await db.select().from(availabilitySlotsTable)
  .where(and(eq(...yachtId), eq(...templateId), eq(...date), eq(...startTime)))
  .limit(1);

if (existing) {
  await db.update(availabilitySlotsTable).set({ isAvailable: slot.isAvailable })
    .where(eq(availabilitySlotsTable.id, existing.id));
} else {
  await db.insert(availabilitySlotsTable).values({ id: randomUUID(), ...slot });
}
```

**Why:** The partial index only covers `isAvailable = true` rows, so a new `false` row doesn't conflict with it — yet the intent is still to upsert based on the composite key regardless of `isAvailable`.

**How to apply:** `host.ts` POST `/host/yachts/:id/availability` batch endpoint.
