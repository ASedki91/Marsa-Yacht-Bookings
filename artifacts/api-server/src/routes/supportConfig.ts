import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  auditLog,
  requireAuth,
  requireRole,
  validateBody,
} from "../middlewares";

const router: IRouter = Router();
const PLATFORM_SETTINGS_ID = "marketplace";

// Preserves the currently shipped number until an admin explicitly changes it.
export const DEFAULT_WHATSAPP_SUPPORT_NUMBER = "201030303030";

const whatsappSupportNumberSchema = z
  .string()
  .trim()
  .min(7)
  .max(32)
  .refine((value) => /^\+?[0-9][0-9 -]*$/.test(value), {
    message:
      "Use only digits, spaces, dashes, and an optional leading plus sign.",
  })
  .transform((value) => value.replace(/[\s-]/g, "").replace(/^\+/, ""))
  .refine((value) => /^\d{7,15}$/.test(value), {
    message:
      "Enter a valid international WhatsApp number using 7 to 15 digits.",
  });

const updateSupportConfigSchema = z.object({
  whatsappSupportNumber: whatsappSupportNumberSchema,
});

function responseBody(settings: { whatsappSupportNumber: string }) {
  return { whatsappSupportNumber: settings.whatsappSupportNumber };
}

async function getOrCreateSettings() {
  const [existing] = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.id, PLATFORM_SETTINGS_ID))
    .limit(1);

  if (existing) return existing;

  await db
    .insert(platformSettingsTable)
    .values({
      id: PLATFORM_SETTINGS_ID,
      whatsappSupportNumber: DEFAULT_WHATSAPP_SUPPORT_NUMBER,
    })
    .onConflictDoNothing();

  const [created] = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.id, PLATFORM_SETTINGS_ID))
    .limit(1);

  return (
    created ?? {
      id: PLATFORM_SETTINGS_ID,
      whatsappSupportNumber: DEFAULT_WHATSAPP_SUPPORT_NUMBER,
    }
  );
}

router.get(
  "/support-config",
  async (_req: Request, res: Response): Promise<void> => {
    res.json(responseBody(await getOrCreateSettings()));
  },
);

router.use("/admin/support-config", requireAuth, requireRole("admin"));

router.get(
  "/admin/support-config",
  async (_req: Request, res: Response): Promise<void> => {
    res.json(responseBody(await getOrCreateSettings()));
  },
);

router.patch(
  "/admin/support-config",
  validateBody(updateSupportConfigSchema),
  auditLog({
    action: "admin.update_support_config",
    entityType: "platform_settings",
    getEntityId: () => PLATFORM_SETTINGS_ID,
    getNewValue: (req) => ({
      whatsappSupportNumber: req.body.whatsappSupportNumber,
    }),
  }),
  async (req: Request, res: Response): Promise<void> => {
    await getOrCreateSettings();
    const user = (req as any).localUser;
    const [updated] = await db
      .update(platformSettingsTable)
      .set({
        whatsappSupportNumber: req.body.whatsappSupportNumber,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(platformSettingsTable.id, PLATFORM_SETTINGS_ID))
      .returning();

    res.json(
      responseBody(
        updated ?? {
          whatsappSupportNumber: DEFAULT_WHATSAPP_SUPPORT_NUMBER,
        },
      ),
    );
  },
);

export default router;