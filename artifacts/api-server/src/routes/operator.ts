import {
  createHash,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { createClerkClient } from "@clerk/express";
import {
  bookingTemplatesTable,
  categoriesTable,
  db,
  hostProfilesTable,
  locationsTable,
  operatorOperationsTable,
  usersTable,
  yachtPhotosTable,
  yachtTemplatePricingTable,
  yachtsTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { z } from "zod/v4";

import { recordAdminEvent } from "../lib/adminActivity";
import { assertValidTimeZone } from "../lib/cancellations/time";
import { resolveYachtLocation } from "../lib/yachtLocation";

const router: IRouter = Router();
const OPERATOR_TOKEN = process.env.AGENT_OPERATOR_TOKEN;
const OPERATOR_SECRET_KEY = process.env.CLERK_SECRET_KEY;

const operatorRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many operator requests. Try again later." },
});

function requireOperatorToken(
  req: Request,
  res: Response,
  next: () => void,
): void {
  if (process.env.NODE_ENV !== "production") {
    res.status(404).json({ error: "Operator actions are available only in production" });
    return;
  }
  if (!OPERATOR_TOKEN) {
    res.status(503).json({
      error: "Production operator access is not configured",
    });
    return;
  }

  const supplied = req.header("x-marsa-operator-token");
  if (
    !supplied ||
    supplied.length !== OPERATOR_TOKEN.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(OPERATOR_TOKEN))
  ) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

router.use("/internal/operator", operatorRateLimit, requireOperatorToken);

const requestSchema = z.object({
  requestId: z.string().uuid(),
  confirm: z.boolean().default(false),
});

const userProvisionSchema = requestSchema.extend({
  user: z.object({
    email: z
      .string()
      .trim()
      .email()
      .max(320)
      .transform((value) => value.toLocaleLowerCase()),
    fullName: z.string().trim().min(1).max(200).optional(),
    role: z.enum(["guest", "host", "admin"]),
    hostBio: z.string().max(2_000).optional(),
  }),
});

const yachtProvisionSchema = requestSchema.extend({
  hostEmail: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLocaleLowerCase()),
  yacht: z
    .object({
      title: z.string().trim().min(3).max(200),
      description: z.string().trim().max(5_000).optional(),
      locationId: z.string().min(1).optional(),
      customLocationName: z.string().trim().min(2).max(200).optional(),
      categoryId: z.string().min(1).optional(),
      capacity: z.number().int().min(1).max(200),
      lengthFt: z.number().positive().max(1_000).optional(),
      yearBuilt: z.number().int().min(1800).max(new Date().getFullYear() + 1).optional(),
      manufacturer: z.string().trim().max(100).optional(),
      features: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
      photoUrls: z.array(z.string().url()).min(1).max(20).optional(),
      pricing: z
        .array(
          z.object({
            templateId: z.string().min(1),
            priceEgp: z.number().positive().max(10_000_000),
          }),
        )
        .min(1)
        .max(20)
        .optional(),
    })
    .refine(
      (value) => Boolean(value.locationId || value.customLocationName),
      {
        message: "Select an active location or provide a custom location",
        path: ["locationId"],
      },
    ),
});

const locationProvisionSchema = requestSchema.extend({
  location: z.object({
    name: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(120),
    country: z.string().trim().min(1).max(120),
    timeZone: z.string().trim().min(1).max(120),
    isDefault: z.boolean().default(false),
    sortOrder: z.number().int().min(0).default(0),
  }),
});

const categoryProvisionSchema = requestSchema.extend({
  category: z.object({
    name: z.string().trim().min(1).max(100),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    iconUrl: z.string().url().optional(),
    sortOrder: z.number().int().min(0).default(0),
  }),
});

const bookingTemplateProvisionSchema = requestSchema.extend({
  template: z.object({
    name: z.string().trim().min(1).max(120),
    durationHours: z.number().int().min(1).max(168),
    description: z.string().trim().max(1_000).optional(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).default(0),
  }),
});

type OperationResult = Record<string, unknown>;

function operationHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

type OperationClaim =
  | { kind: "claimed" }
  | { kind: "completed"; result: OperationResult }
  | { kind: "unavailable"; status: string };

async function claimOperation(
  requestId: string,
  action: string,
  inputHash: string,
): Promise<OperationClaim> {
  const [claimed] = await db
    .insert(operatorOperationsTable)
    .values({
      id: randomUUID(),
      requestId,
      action,
      inputHash,
      status: "running",
    })
    .onConflictDoNothing({
      target: operatorOperationsTable.requestId,
    })
    .returning({ id: operatorOperationsTable.id });
  if (claimed) return { kind: "claimed" };

  const [existing] = await db
    .select()
    .from(operatorOperationsTable)
    .where(eq(operatorOperationsTable.requestId, requestId))
    .limit(1);

  if (!existing) {
    throw new Error("Unable to load the claimed operation");
  }
  if (existing.action !== action || existing.inputHash !== inputHash) {
    throw new Error("This request ID was already used for a different operation");
  }
  if (existing.status === "completed") {
    return {
      kind: "completed",
      result: { alreadyCompleted: true, ...(existing.result ?? {}) },
    };
  }
  return { kind: "unavailable", status: existing.status };
}

function respondToExistingClaim(res: Response, claim: OperationClaim): boolean {
  if (claim.kind === "claimed") return false;
  if (claim.kind === "completed") {
    res.json(claim.result);
    return true;
  }
  res.status(409).json({
    error: `This request cannot be retried because its prior operation is ${claim.status}`,
  });
  return true;
}

async function finishOperation(
  requestId: string,
  status: "completed" | "failed",
  result: OperationResult,
): Promise<void> {
  await db
    .update(operatorOperationsTable)
    .set({ status, result, completedAt: new Date() })
    .where(eq(operatorOperationsTable.requestId, requestId));
}

async function resolveHostForYacht(email: string) {
  const [host] = await db
    .select({
      userId: usersTable.id,
      role: usersTable.role,
      hostId: hostProfilesTable.id,
      verificationStatus: hostProfilesTable.verificationStatus,
    })
    .from(usersTable)
    .innerJoin(hostProfilesTable, eq(hostProfilesTable.userId, usersTable.id))
    .where(sql`lower(${usersTable.email}) = ${email}`)
    .limit(1);
  return host ?? null;
}

router.post(
  "/internal/operator/users",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = userProvisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid user operation", details: parsed.error.issues });
      return;
    }

    const { requestId, confirm, user } = parsed.data;
    const hash = operationHash({ action: "provision_user", user });
    const [existingUser] = await db
      .select({
        id: usersTable.id,
        clerkId: usersTable.clerkId,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(eq(usersTable.email, user.email))
      .limit(1);

    const preview = {
      action: "provision_user",
      requestId,
      valid: true,
      requiresConfirmation: true,
      existingUser: existingUser ?? null,
      intendedRole: user.role,
      willSendInvitation:
        !existingUser || existingUser.clerkId.startsWith("invited:"),
    };
    if (!confirm) {
      res.json(preview);
      return;
    }

    let operationClaimed = false;
    let invitationId: string | null = null;
    try {
      const claim = await claimOperation(requestId, "provision_user", hash);
      if (respondToExistingClaim(res, claim)) return;
      operationClaimed = true;

      if (!OPERATOR_SECRET_KEY) {
        throw new Error("Production Clerk access is not configured");
      }

      let localUser = existingUser;
      if (!localUser || localUser.clerkId.startsWith("invited:")) {
        const clerk = createClerkClient({ secretKey: OPERATOR_SECRET_KEY });
        const invitation = await clerk.invitations.createInvitation({
          emailAddress: user.email,
          notify: true,
          publicMetadata: { marsaRole: user.role },
        });
        invitationId = invitation.id;
        await db
          .update(operatorOperationsTable)
          .set({
            result: {
              stage: "invitation_sent",
              invitationId,
            },
          })
          .where(eq(operatorOperationsTable.requestId, requestId));
      }

      if (!localUser) {
        const [created] = await db.transaction(async (tx) => {
          const [createdUser] = await tx
            .insert(usersTable)
            .values({
              id: randomUUID(),
              clerkId: `invited:${randomUUID()}`,
              email: user.email,
              fullName: user.fullName ?? null,
              role: user.role,
            })
            .returning({
              id: usersTable.id,
              clerkId: usersTable.clerkId,
              role: usersTable.role,
            });
          if (user.role === "host") {
            await tx.insert(hostProfilesTable).values({
              id: randomUUID(),
              userId: createdUser.id,
              bio: user.hostBio ?? null,
              verificationStatus: "pending",
            });
          }
          return [createdUser];
        });
        localUser = created;
      } else if (localUser.role !== user.role) {
        await db
          .update(usersTable)
          .set({ role: user.role })
          .where(eq(usersTable.id, localUser.id));
      }
      if (user.role === "host") {
        const [profile] = await db
          .select({ id: hostProfilesTable.id })
          .from(hostProfilesTable)
          .where(eq(hostProfilesTable.userId, localUser.id))
          .limit(1);
        if (!profile) {
          await db.insert(hostProfilesTable).values({
            id: randomUUID(),
            userId: localUser.id,
            bio: user.hostBio ?? null,
            verificationStatus: "pending",
          });
        }
      }

      const result = {
        action: "provision_user",
        requestId,
        created: !existingUser,
        userId: localUser.id,
        role: user.role,
        invitationId,
      };
      await finishOperation(requestId, "completed", result);
      await recordAdminEvent({
        sectionKey: "users",
        entityType: "user",
        entityId: localUser.id,
        eventType: "operator.user_provisioned",
        metadata: { role: user.role, created: !existingUser },
      });
      res.status(existingUser ? 200 : 201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "User provisioning failed";
      if (operationClaimed) {
        await finishOperation(requestId, "failed", {
          action: "provision_user",
          requestId,
          error: message,
          invitationId,
          requiresReview: invitationId !== null,
        }).catch(() => {});
      }
      req.log.error({ err: error, requestId }, "Operator user provisioning failed");
      res.status(409).json({ error: message });
    }
  },
);

router.post(
  "/internal/operator/locations",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = locationProvisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid location operation", details: parsed.error.issues });
      return;
    }

    const { requestId, confirm, location } = parsed.data;
    try {
      assertValidTimeZone(location.timeZone);
    } catch {
      res.status(422).json({ error: "timeZone must be a valid IANA time zone" });
      return;
    }
    const [duplicate] = await db
      .select({ id: locationsTable.id })
      .from(locationsTable)
      .where(eq(locationsTable.name, location.name))
      .limit(1);
    const preview = {
      action: "create_location",
      requestId,
      valid: !duplicate,
      errors: duplicate ? ["A location with this name already exists"] : [],
      requiresConfirmation: true,
      willReplaceDefault: location.isDefault,
    };
    if (!confirm || duplicate) {
      res.status(duplicate ? 409 : 200).json(preview);
      return;
    }

    const hash = operationHash({ action: "create_location", location });
    let operationClaimed = false;
    try {
      const claim = await claimOperation(requestId, "create_location", hash);
      if (respondToExistingClaim(res, claim)) return;
      operationClaimed = true;
      const locationId = randomUUID();
      const slug = `${location.name
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 90) || "location"}-${locationId.slice(0, 8)}`;
      await db.transaction(async (tx) => {
        if (location.isDefault) {
          await tx
            .update(locationsTable)
            .set({ isDefault: false })
            .where(eq(locationsTable.isDefault, true));
        }
        await tx.insert(locationsTable).values({
          id: locationId,
          ...location,
          slug,
          isActive: true,
        });
      });
      const result = {
        action: "create_location",
        requestId,
        created: true,
        locationId,
      };
      await finishOperation(requestId, "completed", result);
      await recordAdminEvent({
        sectionKey: "yachts",
        entityType: "location",
        entityId: locationId,
        eventType: "operator.location_created",
      });
      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Location provisioning failed";
      if (operationClaimed) {
        await finishOperation(requestId, "failed", {
          action: "create_location",
          requestId,
          error: message,
        }).catch(() => {});
      }
      req.log.error({ err: error, requestId }, "Operator location provisioning failed");
      res.status(409).json({ error: message });
    }
  },
);

router.post(
  "/internal/operator/categories",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = categoryProvisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid category operation", details: parsed.error.issues });
      return;
    }

    const { requestId, confirm, category } = parsed.data;
    const [duplicate] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.slug, category.slug))
      .limit(1);
    const preview = {
      action: "create_category",
      requestId,
      valid: !duplicate,
      errors: duplicate ? ["A category with this slug already exists"] : [],
      requiresConfirmation: true,
    };
    if (!confirm || duplicate) {
      res.status(duplicate ? 409 : 200).json(preview);
      return;
    }

    const hash = operationHash({ action: "create_category", category });
    let operationClaimed = false;
    try {
      const claim = await claimOperation(requestId, "create_category", hash);
      if (respondToExistingClaim(res, claim)) return;
      operationClaimed = true;
      const categoryId = randomUUID();
      await db.insert(categoriesTable).values({
        id: categoryId,
        ...category,
        iconUrl: category.iconUrl ?? null,
      });
      const result = {
        action: "create_category",
        requestId,
        created: true,
        categoryId,
      };
      await finishOperation(requestId, "completed", result);
      await recordAdminEvent({
        sectionKey: "yachts",
        entityType: "category",
        entityId: categoryId,
        eventType: "operator.category_created",
      });
      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Category provisioning failed";
      if (operationClaimed) {
        await finishOperation(requestId, "failed", {
          action: "create_category",
          requestId,
          error: message,
        }).catch(() => {});
      }
      req.log.error({ err: error, requestId }, "Operator category provisioning failed");
      res.status(409).json({ error: message });
    }
  },
);

router.post(
  "/internal/operator/booking-templates",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = bookingTemplateProvisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid booking template operation", details: parsed.error.issues });
      return;
    }

    const { requestId, confirm, template } = parsed.data;
    const [duplicate] = await db
      .select({ id: bookingTemplatesTable.id })
      .from(bookingTemplatesTable)
      .where(eq(bookingTemplatesTable.name, template.name))
      .limit(1);
    const preview = {
      action: "create_booking_template",
      requestId,
      valid: !duplicate,
      errors: duplicate ? ["A booking template with this name already exists"] : [],
      requiresConfirmation: true,
    };
    if (!confirm || duplicate) {
      res.status(duplicate ? 409 : 200).json(preview);
      return;
    }

    const hash = operationHash({ action: "create_booking_template", template });
    let operationClaimed = false;
    try {
      const claim = await claimOperation(
        requestId,
        "create_booking_template",
        hash,
      );
      if (respondToExistingClaim(res, claim)) return;
      operationClaimed = true;
      const templateId = randomUUID();
      await db.insert(bookingTemplatesTable).values({
        id: templateId,
        ...template,
        description: template.description ?? null,
      });
      const result = {
        action: "create_booking_template",
        requestId,
        created: true,
        templateId,
      };
      await finishOperation(requestId, "completed", result);
      await recordAdminEvent({
        sectionKey: "yachts",
        entityType: "booking_template",
        entityId: templateId,
        eventType: "operator.booking_template_created",
      });
      res.status(201).json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Booking template provisioning failed";
      if (operationClaimed) {
        await finishOperation(requestId, "failed", {
          action: "create_booking_template",
          requestId,
          error: message,
        }).catch(() => {});
      }
      req.log.error({ err: error, requestId }, "Operator booking template provisioning failed");
      res.status(409).json({ error: message });
    }
  },
);

router.post(
  "/internal/operator/yachts",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = yachtProvisionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid yacht operation", details: parsed.error.issues });
      return;
    }

    const { requestId, confirm, hostEmail, yacht } = parsed.data;
    const host = await resolveHostForYacht(hostEmail);
    const location = await resolveYachtLocation(yacht);
    const errors: string[] = [];
    if (!host || host.role !== "host" || host.verificationStatus !== "verified") {
      errors.push("A verified MARSA host is required for this listing");
    }
    if (!location) errors.push("The selected location is not available");

    if (yacht.categoryId) {
      const [category] = await db
        .select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(eq(categoriesTable.id, yacht.categoryId))
        .limit(1);
      if (!category) errors.push("The selected category does not exist");
    }
    if (yacht.pricing?.length) {
      const templateIds = yacht.pricing.map((item) => item.templateId);
      if (new Set(templateIds).size !== templateIds.length) {
        errors.push("Each booking template can be priced only once");
      } else {
        const templates = await db
          .select({ id: bookingTemplatesTable.id })
          .from(bookingTemplatesTable)
          .where(inArray(bookingTemplatesTable.id, templateIds));
        if (templates.length !== templateIds.length) {
          errors.push("One or more booking templates do not exist");
        }
      }
    }

    const preview = {
      action: "create_yacht_draft",
      requestId,
      valid: errors.length === 0,
      errors,
      requiresConfirmation: true,
      hostId: host?.hostId ?? null,
      status: "draft",
      photosToCreate: yacht.photoUrls?.length ?? 0,
      pricingRowsToCreate: yacht.pricing?.length ?? 0,
    };
    if (!confirm || errors.length > 0) {
      res.status(errors.length ? 422 : 200).json(preview);
      return;
    }

    const hash = operationHash({
      action: "create_yacht_draft",
      hostEmail,
      yacht,
    });
    let operationClaimed = false;
    try {
      const claim = await claimOperation(
        requestId,
        "create_yacht_draft",
        hash,
      );
      if (respondToExistingClaim(res, claim)) return;
      operationClaimed = true;

      const yachtId = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(yachtsTable).values({
          id: yachtId,
          hostId: host!.hostId,
          categoryId: yacht.categoryId ?? null,
          ...location!,
          title: yacht.title,
          description: yacht.description ?? null,
          capacity: yacht.capacity,
          lengthFt: yacht.lengthFt ? String(yacht.lengthFt) : null,
          yearBuilt: yacht.yearBuilt ?? null,
          manufacturer: yacht.manufacturer ?? null,
          features: yacht.features ?? [],
          status: "draft",
        });
        if (yacht.photoUrls?.length) {
          await tx.insert(yachtPhotosTable).values(
            yacht.photoUrls.map((url, index) => ({
              id: randomUUID(),
              yachtId,
              url,
              isPrimary: index === 0,
              sortOrder: index,
            })),
          );
        }
        if (yacht.pricing?.length) {
          await tx.insert(yachtTemplatePricingTable).values(
            yacht.pricing.map((item) => ({
              id: randomUUID(),
              yachtId,
              templateId: item.templateId,
              price: String(item.priceEgp),
              currency: "EGP",
              isActive: true,
            })),
          );
        }
      });

      const result = {
        action: "create_yacht_draft",
        requestId,
        created: true,
        yachtId,
        status: "draft",
      };
      await finishOperation(requestId, "completed", result);
      await recordAdminEvent({
        sectionKey: "yachts",
        entityType: "yacht",
        entityId: yachtId,
        eventType: "operator.yacht_draft_created",
        metadata: {
          hostId: host!.hostId,
          photoCount: yacht.photoUrls?.length ?? 0,
          pricingCount: yacht.pricing?.length ?? 0,
        },
      });
      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Yacht provisioning failed";
      if (operationClaimed) {
        await finishOperation(requestId, "failed", {
          action: "create_yacht_draft",
          requestId,
          error: message,
        }).catch(() => {});
      }
      req.log.error({ err: error, requestId }, "Operator yacht provisioning failed");
      res.status(409).json({ error: message });
    }
  },
);

export default router;