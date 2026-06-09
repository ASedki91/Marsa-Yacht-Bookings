import Stripe from "stripe";
import { logger } from "./logger";

if (!process.env.STRIPE_SECRET_KEY) {
  logger.warn("STRIPE_SECRET_KEY is not set — payment features will fail");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_missing", {
  apiVersion: "2026-05-27.dahlia",
});
