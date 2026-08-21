import { db, locationsTable } from "@workspace/db";
import { asc, desc, eq } from "drizzle-orm";

export type YachtLocationSelection = {
  locationId: string | null;
  customLocationName: string | null;
  location: string;
  city: string;
};

export async function resolveYachtLocation(input: {
  locationId?: string | null;
  customLocationName?: string | null;
  location?: string | null;
}): Promise<YachtLocationSelection | null> {
  const activeLocations = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.isActive, true))
    .orderBy(desc(locationsTable.isDefault), asc(locationsTable.sortOrder));

  if (input.locationId) {
    const managed = activeLocations.find(
      (location) => location.id === input.locationId,
    );
    if (!managed) return null;
    return {
      locationId: managed.id,
      customLocationName: null,
      location: managed.name,
      city: managed.city,
    };
  }

  const custom = input.customLocationName?.trim() || input.location?.trim();
  if (custom) {
    const managed = activeLocations.find(
      (location) =>
        location.name.toLocaleLowerCase() === custom.toLocaleLowerCase(),
    );
    if (managed) {
      return {
        locationId: managed.id,
        customLocationName: null,
        location: managed.name,
        city: managed.city,
      };
    }
    return {
      locationId: null,
      customLocationName: custom,
      location: custom,
      city: custom,
    };
  }

  const defaultLocation = activeLocations.find(
    (location) => location.isDefault,
  );
  if (!defaultLocation) return null;
  return {
    locationId: defaultLocation.id,
    customLocationName: null,
    location: defaultLocation.name,
    city: defaultLocation.city,
  };
}