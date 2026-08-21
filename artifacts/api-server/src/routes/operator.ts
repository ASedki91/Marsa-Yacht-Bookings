import { randomUUID, timingSafeEqual } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { Router, type IRouter, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod/v4";
import {
  adminEventsTable,
  bookingTemplatesTable,
  categoriesTable,
  db,
  hostProfilesTable,
  locationsTable,
  operatorOperationsTable,
  usersTable,
  yachtsTable,
  yachtTemplatePricingTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { assertValidTimeZone } from "../lib/cancellations/time";
import { recordAdminEvent, type AdminSectionKey } from "../lib/adminActivity";
import {
  createConfirmationToken,
  fingerprintOperatorAction,
  verifyConfirmationToken,
} from "../lib/operatorProtocol";

const router: IRouter = Router();
const PLAN_TTL_MS = 5 * 60_000;
const EXECUTION_LEASE_MS = 60_000;

const userRoleSchema = z.enum(["guest", "host", "admin"]);
const userActionSchema = z
  .object({
    kind: z.literal("user"),
    email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
    role: userRoleSchema,
    fullName: z.string().trim().min(1).max(200).optional(),
    hostBio: z.string().trim().min(10).max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "host" && !value.hostBio) {
      ctx.addIssue({
        code: "custom",
        path: ["hostBio"],
        message: "hostBio is required when provisioning a host",
      });
    }
  });

const locationActionSchema = z.object({
  kind: z.literal("location"),
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  timeZone: z.string().trim().min(1).max(120),
  isDefault: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).max(10_000).optional().default(0),
});

const categoryActionSchema = z.object({
  kind: z.literal("category"),
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case")
    .max(100),
  iconUrl: z.string().url().max(2048).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional().default(0),
});

const bookingTemplateActionSchema = z.object({
  kind: z.literal("booking_template"),
  name: z.string().trim().min(1).max(120),
  durationHours: z.number().int().min(1).max(168),
  description: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(10_000).optional().default(0),
});

const yachtDraftActionSchema = z.object({
  kind: z.literal("yacht_draft"),
  hostEmail: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional(),
  locationId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  capacity: z.number().int().min(1).max(200),
  lengthFt: z.number().positive().max(10_000).optional(),
  yearBuilt: z.number().int().min(1800).max(new Date().getFullYear() + 1).optional(),
  manufacturer: z.string().trim().max(100).optional(),
  features: z.array(z.string().trim().min(1).max(100)).max(50).optional().default([]),
  pricing: z
    .array(
      z.object({
        templateId: z.string().uuid(),
        priceEgp: z.number().positive().max(10_000_000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

const actionSchema = z.discriminatedUnion("kind", [
  userActionSchema,
  locationActionSchema,
  categoryActionSchema,
  bookingTemplateActionSchema,
  yachtDraftActionSchema,
]);

export const dryRunRequestSchema = z.object({
  phase: z.literal("dry_run"),
  operationId: z.string().uuid(),
  action: actionSchema,
});

export const executeRequestSchema = z.object({
  phase: z.literal("execute"),
  operationId: z.string().uuid(),
  confirmationToken: z.string().min(20).max(2000),
  confirmed: z.literal(true),
  action: actionSchema,
});

type OperatorAction = z.infer<typeof actionSchema>;
type PlannedChange = {
  entityType: string;
  entityId: string;
  action: "create" | "skip";
  summary: string;
};
type PreparedPlan = {
  operationId: string;
  actionHash: string;
  expiresAt: number;
  action: OperatorAction;
  changes: PlannedChange[];
  errors: string[];
  details: Record<string, unknown>;
};
type OperationOutcome = {
  operationId: string;
  status: "completed" | "skipped" | "partial";
  created: PlannedChange[];
  skipped: PlannedChange[];
  errors: string[];
};

const operatorRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many operator requests, please try again later" },
});

function safelyEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

export function operatorAuthorizationFailure(
  environment: string | undefined,
  secret: string | undefined,
  authorization: string | undefined,
): { status: number; error: string } | null {
  if (environment !== "production") {
    return { status: 404, error: "Not found" };
  }
  if (!secret) {
    return { status: 503, error: "Operator endpoint is not configured" };
  }
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!token || !safelyEqual(token, secret)) {
    return { status: 401, error: "Unauthorized" };
  }
  return null;
}

function requireProductionOperator(
  req: Request,
  res: Response,
  next: () => void,
): void {
  const failure = operatorAuthorizationFailure(
    process.env.NODE_ENV,
    process.env.MARSA_OPERATOR_SECRET,
    req.headers.authorization,
  );
  if (failure) {
    res.status(failure.status).json({ error: failure.error });
    return;
  }
  next();
}

function sectionForAction(action: OperatorAction): AdminSectionKey {
  if (action.kind === "user") return action.role === "host" ? "hosts" : "users";
  return "yachts";
}

async function createPlan(
  operationId: string,
  action: OperatorAction,
  previousDetails: Record<string, unknown> = {},
  query: any = db,
): Promise<PreparedPlan> {
  const actionHash = fingerprintOperatorAction(action);
  const base = {
    operationId,
    actionHash,
    expiresAt: Date.now() + PLAN_TTL_MS,
    action,
    changes: [] as PlannedChange[],
    errors: [] as string[],
    details: { ...previousDetails } as Record<string, unknown>,
  };

  if (action.kind === "user") {
    const [localUser] = await query
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, action.email))
      .limit(1);
    if (localUser) {
      if (localUser.role !== action.role) {
        base.errors.push(
          `A MARSA user already exists for this email with role "${localUser.role}". Role changes are not allowed by the operator endpoint.`,
        );
      } else {
        base.changes.push({
          entityType: "user",
          entityId: localUser.id,
          action: "skip",
          summary: `Existing ${localUser.role} user ${action.email} is unchanged`,
        });
        if (action.role === "host") {
          const [profile] = await query
            .select()
            .from(hostProfilesTable)
            .where(eq(hostProfilesTable.userId, localUser.id))
            .limit(1);
          if (!profile) {
            const hostProfileId =
              typeof base.details.hostProfileId === "string"
                ? base.details.hostProfileId
                : randomUUID();
            base.details.hostProfileId = hostProfileId;
            base.changes.push({
              entityType: "host_profile",
              entityId: hostProfileId,
              action: "create",
              summary: `Create pending host profile for ${action.email}`,
            });
          }
        }
      }
      base.details.localUserId = localUser.id;
      return base;
    }

    const clerkUsers = await clerkClient.users.getUserList({
      emailAddress: [action.email],
      limit: 2,
    });
    const clerkUser = clerkUsers.data[0];
    const userId =
      typeof base.details.userId === "string"
        ? base.details.userId
        : randomUUID();
    base.details.userId = userId;
    base.details.clerkUserId = clerkUser?.id ?? null;
    base.changes.push({
      entityType: "user",
      entityId: userId,
      action: "create",
      summary: clerkUser
        ? `Link existing activated Clerk account ${action.email} as ${action.role}`
        : `Invite ${action.email} and create a ${action.role} MARSA profile`,
    });
    if (action.role === "host") {
      const hostProfileId =
        typeof base.details.hostProfileId === "string"
          ? base.details.hostProfileId
          : randomUUID();
      base.details.hostProfileId = hostProfileId;
      base.changes.push({
        entityType: "host_profile",
        entityId: hostProfileId,
        action: "create",
        summary: `Create pending host profile for ${action.email}`,
      });
    }
    return base;
  }

  if (action.kind === "location") {
    try {
      assertValidTimeZone(action.timeZone);
    } catch {
      base.errors.push("timeZone must be a valid IANA time zone");
      return base;
    }
    const slug = makeSlug(action.name);
    const [existingLocation] = await query
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.slug, slug))
      .limit(1);
    if (existingLocation) {
      if (
        existingLocation.name === action.name &&
        existingLocation.city === action.city &&
        existingLocation.country === action.country &&
        existingLocation.timeZone === action.timeZone
      ) {
        base.changes.push({
          entityType: "location",
          entityId: existingLocation.id,
          action: "skip",
          summary: `Existing location "${action.name}" is unchanged`,
        });
      } else {
        base.errors.push(`Location slug "${slug}" is already used by different data`);
      }
      return base;
    }
    if (action.isDefault) {
      const [currentDefault] = await query
        .select({ id: locationsTable.id })
        .from(locationsTable)
        .where(eq(locationsTable.isDefault, true))
        .limit(1);
      if (currentDefault) {
        base.errors.push(
          "A default location already exists. The operator endpoint does not replace existing defaults.",
        );
        return base;
      }
    }
    const id =
      typeof base.details.locationId === "string"
        ? base.details.locationId
        : randomUUID();
    base.details.locationId = id;
    base.details.slug = slug;
    base.changes.push({
      entityType: "location",
      entityId: id,
      action: "create",
      summary: `Create location "${action.name}" (${action.city}, ${action.country})`,
    });
    return base;
  }

  if (action.kind === "category") {
    const [existingCategory] = await query
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.slug, action.slug))
      .limit(1);
    if (existingCategory) {
      if (existingCategory.name === action.name) {
        base.changes.push({
          entityType: "category",
          entityId: existingCategory.id,
          action: "skip",
          summary: `Existing category "${action.slug}" is unchanged`,
        });
      } else {
        base.errors.push(`Category slug "${action.slug}" is already used by different data`);
      }
      return base;
    }
    const id =
      typeof base.details.categoryId === "string"
        ? base.details.categoryId
        : randomUUID();
    base.details.categoryId = id;
    base.changes.push({
      entityType: "category",
      entityId: id,
      action: "create",
      summary: `Create category "${action.name}"`,
    });
    return base;
  }

  if (action.kind === "booking_template") {
    const [existingTemplate] = await query
      .select()
      .from(bookingTemplatesTable)
      .where(
        and(
          eq(bookingTemplatesTable.name, action.name),
          eq(bookingTemplatesTable.durationHours, action.durationHours),
        ),
      )
      .limit(1);
    if (existingTemplate) {
      base.changes.push({
        entityType: "booking_template",
        entityId: existingTemplate.id,
        action: "skip",
        summary: `Existing ${action.durationHours}-hour template "${action.name}" is unchanged`,
      });
      return base;
    }
    const id =
      typeof base.details.bookingTemplateId === "string"
        ? base.details.bookingTemplateId
        : randomUUID();
    base.details.bookingTemplateId = id;
    base.changes.push({
      entityType: "booking_template",
      entityId: id,
      action: "create",
      summary: `Create ${action.durationHours}-hour template "${action.name}"`,
    });
    return base;
  }

  const [hostUser] = await query
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, action.hostEmail))
    .limit(1);
  if (!hostUser || hostUser.role !== "host") {
    base.errors.push("hostEmail must belong to an existing MARSA host");
    return base;
  }
  const [hostProfile] = await query
    .select()
    .from(hostProfilesTable)
    .where(eq(hostProfilesTable.userId, hostUser.id))
    .limit(1);
  if (!hostProfile) {
    base.errors.push("The host does not have a host profile");
    return base;
  }
  const [location] = await query
    .select()
    .from(locationsTable)
    .where(and(eq(locationsTable.id, action.locationId), eq(locationsTable.isActive, true)))
    .limit(1);
  if (!location) {
    base.errors.push("locationId must reference an active managed location");
  }
  if (action.categoryId) {
    const [category] = await query
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, action.categoryId))
      .limit(1);
    if (!category) base.errors.push("categoryId does not reference an existing category");
  }
  const priceTemplateIds = action.pricing.map((price) => price.templateId);
  if (new Set(priceTemplateIds).size !== priceTemplateIds.length) {
    base.errors.push("pricing entries cannot repeat a templateId");
  }
  if (priceTemplateIds.length) {
    const templates = await query
      .select({ id: bookingTemplatesTable.id })
      .from(bookingTemplatesTable)
      .where(eq(bookingTemplatesTable.isActive, true));
    const activeIds = new Set(
      (templates as Array<{ id: string }>).map((template) => template.id),
    );
    const missing = priceTemplateIds.filter((id) => !activeIds.has(id));
    if (missing.length) base.errors.push("All pricing templateIds must reference active templates");
  }
  if (base.errors.length) return base;

  const yachtId =
    typeof base.details.yachtId === "string"
      ? base.details.yachtId
      : randomUUID();
  base.details.yachtId = yachtId;
  base.details.hostProfileId = hostProfile.id;
  base.details.locationName = location!.name;
  base.details.locationCity = location!.city;
  base.changes.push({
    entityType: "yacht",
    entityId: yachtId,
    action: "create",
    summary: `Create draft yacht "${action.title}" for ${action.hostEmail}`,
  });
  for (const price of action.pricing) {
    base.changes.push({
      entityType: "yacht_template_pricing",
      entityId: `${yachtId}:${price.templateId}`,
      action: "create",
      summary: `Set EGP ${price.priceEgp.toFixed(2)} draft price for template ${price.templateId}`,
    });
  }
  return base;
}

function makeSlug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "location"
  );
}

function resourceKeyFor(action: OperatorAction): string {
  if (action.kind === "user") return `user:${action.email}`;
  if (action.kind === "location") return `location:${makeSlug(action.name)}`;
  if (action.kind === "category") return `category:${action.slug}`;
  if (action.kind === "booking_template") {
    return `booking_template:${action.name.toLocaleLowerCase()}:${action.durationHours}`;
  }
  return `yacht_draft:${action.hostEmail}:${action.locationId}:${action.title.toLocaleLowerCase()}`;
}

function planFingerprint(plan: PreparedPlan): string {
  return fingerprintOperatorAction({
    changes: plan.changes,
    details: plan.details,
  });
}

async function validatePlanStillMatches(
  plan: PreparedPlan,
  query: any = db,
): Promise<string | null> {
  const refreshed = await createPlan(
    plan.operationId,
    plan.action,
    plan.details,
    query,
  );
  if (refreshed.errors.length) return refreshed.errors.join(" ");
  if (planFingerprint(refreshed) !== planFingerprint(plan)) {
    return "Marketplace state changed after the dry run.";
  }
  return null;
}

async function lockPlanResources(tx: any, action: OperatorAction): Promise<void> {
  if (action.kind === "user") {
    const [user] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, action.email))
      .limit(1)
      .for("update");
    if (user) {
      await tx
        .select({ id: hostProfilesTable.id })
        .from(hostProfilesTable)
        .where(eq(hostProfilesTable.userId, user.id))
        .limit(1)
        .for("update");
    }
    return;
  }
  if (action.kind === "location") {
    await tx
      .select({ id: locationsTable.id })
      .from(locationsTable)
      .where(eq(locationsTable.slug, makeSlug(action.name)))
      .limit(1)
      .for("update");
    if (action.isDefault) {
      await tx
        .select({ id: locationsTable.id })
        .from(locationsTable)
        .where(eq(locationsTable.isDefault, true))
        .limit(1)
        .for("update");
    }
    return;
  }
  if (action.kind === "category") {
    await tx
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.slug, action.slug))
      .limit(1)
      .for("update");
    return;
  }
  if (action.kind === "booking_template") {
    await tx
      .select({ id: bookingTemplatesTable.id })
      .from(bookingTemplatesTable)
      .where(
        and(
          eq(bookingTemplatesTable.name, action.name),
          eq(bookingTemplatesTable.durationHours, action.durationHours),
        ),
      )
      .limit(1)
      .for("update");
    return;
  }

  const [host] = await tx
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, action.hostEmail))
    .limit(1)
    .for("update");
  if (host) {
    await tx
      .select({ id: hostProfilesTable.id })
      .from(hostProfilesTable)
      .where(eq(hostProfilesTable.userId, host.id))
      .limit(1)
      .for("update");
  }
  await tx
    .select({ id: locationsTable.id })
    .from(locationsTable)
    .where(eq(locationsTable.id, action.locationId))
    .limit(1)
    .for("update");
  if (action.categoryId) {
    await tx
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, action.categoryId))
      .limit(1)
      .for("update");
  }
  if (action.pricing.length) {
    await tx
      .select({ id: bookingTemplatesTable.id })
      .from(bookingTemplatesTable)
      .where(inArray(bookingTemplatesTable.id, action.pricing.map((price) => price.templateId)))
      .for("update");
  }
}

function outcomeFor(plan: PreparedPlan): OperationOutcome {
  const created = plan.changes.filter((change) => change.action === "create");
  const skipped = plan.changes.filter((change) => change.action === "skip");
  return {
    operationId: plan.operationId,
    status: created.length ? "completed" : "skipped",
    created,
    skipped,
    errors: [],
  };
}

async function applyPlan(
  tx: any,
  plan: PreparedPlan,
  resolvedClerkId?: string,
): Promise<OperationOutcome> {
  const outcome = outcomeFor(plan);
  const action = plan.action;

  if (!outcome.created.length) return outcome;

  if (action.kind === "user") {
    const userChange = outcome.created.find(
      (change) => change.entityType === "user",
    );
    if (userChange) {
      const clerkId =
        resolvedClerkId ?? (plan.details.clerkUserId as string | null);
      if (!clerkId) throw new Error("User plan is missing Clerk identity state");
      await tx.insert(usersTable).values({
        id: userChange.entityId,
        clerkId,
        email: action.email,
        fullName: action.fullName ?? null,
        role: action.role,
      });
      const hostChange = outcome.created.find(
        (change) => change.entityType === "host_profile",
      );
      if (hostChange) {
        await tx.insert(hostProfilesTable).values({
          id: hostChange.entityId,
          userId: userChange.entityId,
          bio: action.hostBio ?? null,
          verificationStatus: "pending",
        });
      }
    } else {
      const hostChange = outcome.created.find(
        (change) => change.entityType === "host_profile",
      );
      if (hostChange) {
        await tx.insert(hostProfilesTable).values({
          id: hostChange.entityId,
          userId: String(plan.details.localUserId),
          bio: action.hostBio ?? null,
          verificationStatus: "pending",
        });
      }
    }
    return outcome;
  }

  if (action.kind === "location") {
    const change = outcome.created[0];
    await tx.insert(locationsTable).values({
      id: change.entityId,
      name: action.name,
      city: action.city,
      country: action.country,
      timeZone: action.timeZone,
      slug: String(plan.details.slug),
      isActive: true,
      isDefault: action.isDefault,
      sortOrder: action.sortOrder,
    });
    return outcome;
  }

  if (action.kind === "category") {
    const change = outcome.created[0];
    await tx.insert(categoriesTable).values({
      id: change.entityId,
      name: action.name,
      slug: action.slug,
      iconUrl: action.iconUrl ?? null,
      sortOrder: action.sortOrder,
    });
    return outcome;
  }

  if (action.kind === "booking_template") {
    const change = outcome.created[0];
    await tx.insert(bookingTemplatesTable).values({
      id: change.entityId,
      name: action.name,
      durationHours: action.durationHours,
      description: action.description ?? null,
      isActive: action.isActive,
      sortOrder: action.sortOrder,
    });
    return outcome;
  }

  const yachtChange = outcome.created.find(
    (change) => change.entityType === "yacht",
  );
  if (!yachtChange) throw new Error("Prepared yacht plan is missing its yacht record");
  await tx.insert(yachtsTable).values({
    id: yachtChange.entityId,
    hostId: String(plan.details.hostProfileId),
    categoryId: action.categoryId ?? null,
    locationId: action.locationId,
    customLocationName: null,
    title: action.title,
    description: action.description ?? null,
    location: String(plan.details.locationName),
    city: String(plan.details.locationCity),
    capacity: action.capacity,
    lengthFt: action.lengthFt ? String(action.lengthFt) : null,
    yearBuilt: action.yearBuilt ?? null,
    manufacturer: action.manufacturer ?? null,
    features: action.features,
    status: "draft",
  });
  if (action.pricing.length) {
    await tx.insert(yachtTemplatePricingTable).values(
      action.pricing.map((price) => ({
        id: randomUUID(),
        yachtId: yachtChange.entityId,
        templateId: price.templateId,
        price: price.priceEgp.toFixed(2),
        currency: "EGP",
        isActive: true,
      })),
    );
  }
  return outcome;
}

async function recordOutcome(
  tx: any,
  action: OperatorAction,
  outcome: OperationOutcome,
): Promise<void> {
  const sectionKey = sectionForAction(action);
  for (const change of [...outcome.created, ...outcome.skipped]) {
    await tx.insert(adminEventsTable).values({
      id: randomUUID(),
      sectionKey,
      entityType: change.entityType,
      entityId: change.entityId,
      eventType:
        change.action === "create"
          ? "operator.provisioned"
          : "operator.skipped_existing",
      metadata: {
        operationId: outcome.operationId,
        summary: change.summary,
        outcome: change.action,
      },
    });
  }
  await tx.insert(adminEventsTable).values({
    id: randomUUID(),
    sectionKey,
    entityType: "operator_operation",
    entityId: outcome.operationId,
    eventType: "operator.completed",
    metadata: { outcome },
  });
}

async function markOperationStale(
  tx: any,
  operation: { id: string; resourceKey: string },
  action: OperatorAction,
  reason: string,
): Promise<void> {
  await tx
    .update(operatorOperationsTable)
    .set({
      status: "stale",
      resourceKey: `stale:${operation.resourceKey}:${operation.id}`,
      leaseExpiresAt: null,
    })
    .where(eq(operatorOperationsTable.id, operation.id));
  await tx.insert(adminEventsTable).values({
    id: randomUUID(),
    sectionKey: sectionForAction(action),
    entityType: "operator_operation",
    entityId: operation.id,
    eventType: "operator.stale",
    metadata: { reason },
  });
}

type ClaimedOperation =
  | { kind: "claimed"; plan: PreparedPlan; invitationId: string | null }
  | { kind: "completed"; outcome: OperationOutcome }
  | { kind: "in_progress" }
  | { kind: "stale"; reason: string }
  | { kind: "missing" };

async function claimOperation(
  operationId: string,
  actionHash: string,
): Promise<ClaimedOperation> {
  return db.transaction(async (tx) => {
    const [operation] = await tx
      .select()
      .from(operatorOperationsTable)
      .where(eq(operatorOperationsTable.id, operationId))
      .limit(1)
      .for("update");
    if (!operation) return { kind: "missing" };
    if (operation.actionHash !== actionHash) {
      return { kind: "stale", reason: "operationId belongs to a different action" };
    }
    if (operation.status === "completed" && operation.outcome) {
      return {
        kind: "completed",
        outcome: operation.outcome as unknown as OperationOutcome,
      };
    }
    if (operation.status === "stale" || operation.status === "expired") {
      return {
        kind: "stale",
        reason: "The approved dry run is no longer valid. Prepare a new operation.",
      };
    }
    const now = new Date();
    if (operation.expiresAt <= now) {
      await tx
        .update(operatorOperationsTable)
        .set({
          status: "expired",
          resourceKey: `expired:${operation.resourceKey}:${operation.id}`,
          leaseExpiresAt: null,
        })
        .where(eq(operatorOperationsTable.id, operation.id));
      return {
        kind: "stale",
        reason: "The approved dry run has expired. Prepare a new operation.",
      };
    }
    if (
      operation.status === "executing" &&
      operation.leaseExpiresAt &&
      operation.leaseExpiresAt > now
    ) {
      return { kind: "in_progress" };
    }

    const plan = operation.plan as unknown as PreparedPlan;
    await lockPlanResources(tx, plan.action);
    const stateError = await validatePlanStillMatches(plan, tx);
    if (stateError) {
      await markOperationStale(tx, operation, plan.action, stateError);
      return { kind: "stale", reason: stateError };
    }
    await tx
      .update(operatorOperationsTable)
      .set({
        status: "executing",
        leaseExpiresAt: new Date(now.getTime() + EXECUTION_LEASE_MS),
      })
      .where(eq(operatorOperationsTable.id, operation.id));
    return {
      kind: "claimed",
      plan,
      invitationId: operation.invitationId,
    };
  });
}

async function resolveClerkIdentity(
  operationId: string,
  plan: PreparedPlan,
  invitationId: string | null,
): Promise<string | undefined> {
  const userChange = plan.changes.find(
    (change) => change.entityType === "user" && change.action === "create",
  );
  if (!userChange) return undefined;
  const clerkUserId = plan.details.clerkUserId;
  if (typeof clerkUserId === "string") return clerkUserId;

  let pendingInvitationId = invitationId;
  if (!pendingInvitationId) {
    const invitations = await clerkClient.invitations.getInvitationList({
      query: plan.action.kind === "user" ? plan.action.email : "",
      status: "pending",
      limit: 20,
    });
    const existing = invitations.data.find(
      (invitation) =>
        plan.action.kind === "user" &&
        invitation.emailAddress.toLocaleLowerCase() ===
          plan.action.email.toLocaleLowerCase(),
    );
    const invitation =
      existing ??
      (await clerkClient.invitations.createInvitation({
        emailAddress: (plan.action as Extract<OperatorAction, { kind: "user" }>).email,
        publicMetadata: {
          marsaRole: (plan.action as Extract<OperatorAction, { kind: "user" }>).role,
        },
      }));
    pendingInvitationId = invitation.id;
    await db
      .update(operatorOperationsTable)
      .set({ invitationId: pendingInvitationId })
      .where(
        and(
          eq(operatorOperationsTable.id, operationId),
          eq(operatorOperationsTable.status, "executing"),
        ),
      );
  }
  return `pending_invitation:${pendingInvitationId}`;
}

async function finalizeOperation(
  operationId: string,
  actionHash: string,
  resolvedClerkId?: string,
): Promise<
  | { kind: "completed"; outcome: OperationOutcome }
  | { kind: "in_progress" }
  | { kind: "stale"; reason: string }
> {
  return db.transaction(async (tx) => {
    const [operation] = await tx
      .select()
      .from(operatorOperationsTable)
      .where(eq(operatorOperationsTable.id, operationId))
      .limit(1)
      .for("update");
    if (!operation || operation.actionHash !== actionHash) {
      return { kind: "stale", reason: "Operation state is unavailable" };
    }
    if (operation.status === "completed" && operation.outcome) {
      return {
        kind: "completed",
        outcome: operation.outcome as unknown as OperationOutcome,
      };
    }
    if (operation.status !== "executing") {
      return { kind: "in_progress" };
    }
    const plan = operation.plan as unknown as PreparedPlan;
    await lockPlanResources(tx, plan.action);
    const stateError = await validatePlanStillMatches(plan, tx);
    if (stateError) {
      await markOperationStale(tx, operation, plan.action, stateError);
      return { kind: "stale", reason: stateError };
    }
    const outcome = await applyPlan(tx, plan, resolvedClerkId);
    await recordOutcome(tx, plan.action, outcome);
    await tx
      .update(operatorOperationsTable)
      .set({
        status: "completed",
        resourceKey: `completed:${operation.resourceKey}:${operation.id}`,
        leaseExpiresAt: null,
        completedAt: new Date(),
        outcome: outcome as unknown as Record<string, unknown>,
      })
      .where(eq(operatorOperationsTable.id, operation.id));
    return { kind: "completed", outcome };
  });
}

router.post(
  "/internal/operator",
  operatorRateLimit,
  requireProductionOperator,
  async (req: Request, res: Response): Promise<void> => {
    const dryRun = dryRunRequestSchema.safeParse(req.body);
    if (dryRun.success) {
      const request = dryRun.data;
      const secret = process.env.MARSA_OPERATOR_SECRET!;
      const actionHash = fingerprintOperatorAction(request.action);
      const [existingOperation] = await db
        .select()
        .from(operatorOperationsTable)
        .where(eq(operatorOperationsTable.id, request.operationId))
        .limit(1);
      if (existingOperation) {
        if (existingOperation.actionHash !== actionHash) {
          res.status(409).json({
            error: "operationId was already used for a different proposed action",
          });
          return;
        }
        if (existingOperation.status === "completed" && existingOperation.outcome) {
          res.json({
            ...(existingOperation.outcome as unknown as OperationOutcome),
            idempotent: true,
          });
          return;
        }
        if (
          existingOperation.status === "stale" ||
          existingOperation.status === "expired"
        ) {
          res.status(409).json({
            error: "This operation is no longer valid. Use a new operationId.",
          });
          return;
        }
        const expiresAt = new Date(Date.now() + PLAN_TTL_MS);
        const plan = {
          ...(existingOperation.plan as unknown as PreparedPlan),
          expiresAt: expiresAt.getTime(),
        };
        await db
          .update(operatorOperationsTable)
          .set({ expiresAt, plan: plan as unknown as Record<string, unknown> })
          .where(eq(operatorOperationsTable.id, existingOperation.id));
        const confirmationToken = createConfirmationToken(
          {
            operationId: plan.operationId,
            actionHash: plan.actionHash,
            expiresAt: plan.expiresAt,
          },
          secret,
        );
        res.json({
          operationId: plan.operationId,
          expiresAt: expiresAt.toISOString(),
          changes: plan.changes,
          confirmationToken,
          nextStep:
            "Present these changes for explicit approval, then repeat this exact action with phase=execute, confirmed=true, and confirmationToken.",
        });
        return;
      }

      const plan = await createPlan(request.operationId, request.action);
      if (plan.errors.length) {
        res.status(422).json({
          operationId: plan.operationId,
          expiresAt: new Date(plan.expiresAt).toISOString(),
          changes: plan.changes,
          errors: plan.errors,
        });
        return;
      }
      const resourceKey = resourceKeyFor(request.action);
      const [savedOperation] = await db
        .insert(operatorOperationsTable)
        .values({
          id: plan.operationId,
          resourceKey,
          actionHash: plan.actionHash,
          action: request.action as unknown as Record<string, unknown>,
          plan: plan as unknown as Record<string, unknown>,
          status: "planned",
          expiresAt: new Date(plan.expiresAt),
        })
        .onConflictDoNothing()
        .returning({ id: operatorOperationsTable.id });
      if (!savedOperation) {
        res.status(409).json({
          error:
            "A pending or completed operator operation already owns this marketplace record. Inspect its activity before preparing another request.",
        });
        return;
      }
      const confirmationToken = createConfirmationToken(
        {
          operationId: plan.operationId,
          actionHash: plan.actionHash,
          expiresAt: plan.expiresAt,
        },
        secret,
      );
      await recordAdminEvent({
        sectionKey: sectionForAction(request.action),
        entityType: "operator_operation",
        entityId: plan.operationId,
        eventType: "operator.dry_run",
        metadata: { changes: plan.changes, expiresAt: plan.expiresAt },
      });
      res.json({
        operationId: plan.operationId,
        expiresAt: new Date(plan.expiresAt).toISOString(),
        changes: plan.changes,
        confirmationToken,
        nextStep:
          "Present these changes for explicit approval, then repeat this exact action with phase=execute, confirmed=true, and confirmationToken.",
      });
      return;
    }

    const execute = executeRequestSchema.safeParse(req.body);
    if (!execute.success) {
      res.status(400).json({
        error: "Invalid operator request",
        details: execute.error.flatten(),
      });
      return;
    }
    const request = execute.data;
    const secret = process.env.MARSA_OPERATOR_SECRET!;
    const actionHash = fingerprintOperatorAction(request.action);

    const confirmation = verifyConfirmationToken(request.confirmationToken, secret);
    if (
      !confirmation ||
      confirmation.operationId !== request.operationId ||
      confirmation.actionHash !== actionHash ||
      confirmation.expiresAt <= Date.now()
    ) {
      res.status(409).json({
        error: "Confirmation is invalid or expired. Run a new dry run before executing.",
      });
      return;
    }
    const claimed = await claimOperation(request.operationId, actionHash);
    if (claimed.kind === "missing") {
      res.status(409).json({
        error: "The approved dry run is no longer available. Run a new dry run before executing.",
      });
      return;
    }
    if (claimed.kind === "completed") {
      res.json({ ...claimed.outcome, idempotent: true });
      return;
    }
    if (claimed.kind === "in_progress") {
      res.status(409).json({ error: "This operation is already executing" });
      return;
    }
    if (claimed.kind === "stale") {
      res.status(409).json({ error: claimed.reason });
      return;
    }
    try {
      const clerkId = await resolveClerkIdentity(
        request.operationId,
        claimed.plan,
        claimed.invitationId,
      );
      const finalized = await finalizeOperation(
        request.operationId,
        actionHash,
        clerkId,
      );
      if (finalized.kind === "completed") {
        res.json({ ...finalized.outcome, idempotent: false });
        return;
      }
      if (finalized.kind === "in_progress") {
        res.status(409).json({ error: "This operation is already executing" });
        return;
      }
      res.status(409).json({ error: finalized.reason });
    } catch (error) {
      await recordAdminEvent({
        sectionKey: sectionForAction(request.action),
        entityType: "operator_operation",
        entityId: request.operationId,
        eventType: "operator.failed",
        metadata: { actionKind: request.action.kind },
      }).catch(() => {});
      req.log.error(
        { operationId: request.operationId, actionKind: request.action.kind },
        "Operator operation failed",
      );
      res.status(409).json({
        error:
          "The operation could not be completed. Wait for the execution lease to expire, then rerun the approved operation or prepare a new dry run.",
      });
    }
  },
);

export default router;